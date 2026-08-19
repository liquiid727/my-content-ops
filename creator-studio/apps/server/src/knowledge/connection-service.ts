import { access, constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import { connectionSchema, serializeIsoDateTime, type CreateConnection, type ResourceConnection, type UpdateConnection } from '@creator-studio/contracts'
import { ulid } from 'ulid'

import { HttpError } from '../http/errors.js'
import type { CommandRunner } from './command-runner.js'
import { runCommand } from './command-runner.js'
import { KnowledgeRepository, type KnowledgeConnectionRow } from './knowledge-repository.js'
import { ResourceAdapterRegistry } from './resource-adapter.js'

const LARK_VERSION = '1.0.86'

function date(value: number | null): string | null { return value === null ? null : serializeIsoDateTime(new Date(value)) }
function config(row: KnowledgeConnectionRow): Record<string, unknown> { return JSON.parse(row.config_json) as Record<string, unknown> }

function mapConnection(row: KnowledgeConnectionRow): ResourceConnection {
  return connectionSchema.parse({
    id: row.id, type: row.type, name: row.name, enabled: Boolean(row.enabled), status: row.status,
    config: config(row), capabilities: ['browse', 'search', 'read'], lastCheckedAt: date(row.last_checked_at), lastError: row.last_error,
    createdAt: serializeIsoDateTime(new Date(row.created_at)), updatedAt: serializeIsoDateTime(new Date(row.updated_at)),
  })
}

async function executable(path: string): Promise<boolean> {
  return new Promise((resolve) => access(path, constants.X_OK, (error) => resolve(!error)))
}

export class ConnectionService {
  private readonly larkSetupProcesses = new Map<string, { kill: (signal?: NodeJS.Signals) => boolean }>()

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly adapters: ResourceAdapterRegistry,
    private readonly dataDirectory: string,
    private readonly runner: CommandRunner = runCommand,
    private readonly now: () => number = Date.now,
  ) {}

  list(workspaceId: string): ResourceConnection[] { return this.repository.listConnections(workspaceId).map(mapConnection) }

  get(workspaceId: string, id: string): ResourceConnection {
    const row = this.repository.getConnection(workspaceId, id)
    if (!row) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '连接不存在。' })
    return mapConnection(row)
  }

  async create(workspaceId: string, input: CreateConnection): Promise<ResourceConnection> {
    const now = this.now()
    const id = ulid(now)
    const normalized = await this.normalizeConfig(input.type, input.config)
    const status = input.type === 'lark' ? 'not_configured' : 'ready'
    this.repository.insertConnection({
      id, workspace_id: workspaceId, type: input.type, name: input.name, config_json: JSON.stringify(normalized),
      enabled: input.enabled ? 1 : 0, status, last_checked_at: null, last_error: null, created_at: now, updated_at: now,
    })
    if (input.type !== 'lark') await this.test(workspaceId, id)
    return this.get(workspaceId, id)
  }

  async update(workspaceId: string, id: string, input: UpdateConnection): Promise<ResourceConnection> {
    const current = this.get(workspaceId, id)
    if (input.type && input.type !== current.type) throw new HttpError({ status: 409, code: 'CONNECTION_TYPE_IMMUTABLE', message: '连接类型不可修改，请新建连接。' })
    const now = this.now()
    const nextConfig = input.config ? await this.normalizeConfig(current.type, { ...current.config, ...input.config }) : current.config
    this.repository.updateConnection(workspaceId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled ? 1 : 0 } : {}),
      ...(input.config ? { config_json: JSON.stringify(nextConfig), status: current.type === 'lark' ? 'not_configured' : 'ready' } : {}), updated_at: now,
    })
    return this.get(workspaceId, id)
  }

  delete(workspaceId: string, id: string): void {
    if (!this.repository.deleteConnection(workspaceId, id)) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '连接不存在。' })
  }

  async test(workspaceId: string, id: string) {
    const row = this.requireRow(workspaceId, id)
    try {
      const result = await this.adapters.require(row.type).test({ id: row.id, type: row.type, config: config(row) })
      this.repository.updateConnection(workspaceId, id, { status: result.status, last_checked_at: this.now(), last_error: result.ok ? null : result.message, updated_at: this.now() })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接检查失败。'
      this.repository.updateConnection(workspaceId, id, { status: 'error', last_checked_at: this.now(), last_error: message, updated_at: this.now() })
      throw error
    }
  }

  managedLarkPath(): string { return join(this.dataDirectory, 'tools', 'lark-cli', 'node_modules', '.bin', 'lark-cli') }

  async installLark(workspaceId: string, id: string, signal?: AbortSignal): Promise<{ command: string; version: string }> {
    const row = this.requireRow(workspaceId, id)
    if (row.type !== 'lark') throw new HttpError({ status: 422, code: 'VALIDATION_FAILED', message: '只有飞书连接需要安装 CLI。' })
    const prefix = join(this.dataDirectory, 'tools', 'lark-cli')
    await mkdir(prefix, { recursive: true })
    this.repository.updateConnection(workspaceId, id, { status: 'installing', last_error: null, updated_at: this.now() })
    const result = await this.runner('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--save-exact', `@larksuite/cli@${LARK_VERSION}`], { timeoutMs: 4 * 60_000, ...(signal ? { signal } : {}) })
    const command = this.managedLarkPath()
    if (result.exitCode !== 0 || !(await executable(command))) {
      this.repository.updateConnection(workspaceId, id, { status: 'error', last_error: '飞书 CLI 安装失败。', updated_at: this.now() })
      throw new HttpError({ status: 503, code: 'CONNECTOR_INSTALL_FAILED', message: '飞书 CLI 安装失败，请检查网络和 npm 后重试。' })
    }
    const next = { ...config(row), command, managedVersion: LARK_VERSION }
    this.repository.updateConnection(workspaceId, id, { config_json: JSON.stringify(next), status: 'auth_required', last_error: null, updated_at: this.now() })
    return { command, version: LARK_VERSION }
  }

  async beginLarkAuth(workspaceId: string, id: string): Promise<{ authorizationUrl: string; deviceCode: string | null; phase: 'app_setup' | 'user_auth' }> {
    const row = this.requireRow(workspaceId, id)
    if (row.type !== 'lark') throw new HttpError({ status: 422, code: 'VALIDATION_FAILED', message: '该连接不需要 OAuth。' })
    const command = String(config(row).command ?? '')
    if (!command || !(await executable(command))) throw new HttpError({ status: 503, code: 'CONNECTOR_UNAVAILABLE', message: '请先安装飞书 CLI。' })
    const configured = await this.runner(command, ['config', 'show'], { timeoutMs: 15_000 })
    if (configured.exitCode !== 0 || !/app[_-]?id/i.test(`${configured.stdout}\n${configured.stderr}`)) {
      return { authorizationUrl: await this.startLarkAppSetup(workspaceId, id, command), deviceCode: null, phase: 'app_setup' }
    }
    const result = await this.runner(command, ['auth', 'login', '--domain', 'drive,docs,sheets,base,wiki', '--no-wait', '--json'], { timeoutMs: 30_000 })
    const output = `${result.stdout}\n${result.stderr}`
    const authorizationUrl = output.match(/https?:\/\/[^\s"']+/)?.[0]
    const deviceCode = output.match(/"device_code"\s*:\s*"([^"]+)"/)?.[1] ?? null
    if (result.exitCode !== 0 || !authorizationUrl) throw new HttpError({ status: 502, code: 'CONNECTOR_AUTH_FAILED', message: '无法启动飞书认证，请运行连接诊断后重试。' })
    this.repository.updateConnection(workspaceId, id, { status: 'auth_required', last_error: null, updated_at: this.now() })
    return { authorizationUrl, deviceCode, phase: 'user_auth' }
  }

  async finishLarkAuth(workspaceId: string, id: string, deviceCode: string | null, signal?: AbortSignal): Promise<void> {
    const row = this.requireRow(workspaceId, id)
    const command = String(config(row).command ?? '')
    if (deviceCode) {
      const result = await this.runner(command, ['auth', 'login', '--device-code', deviceCode, '--json'], { timeoutMs: 4 * 60_000, ...(signal ? { signal } : {}) })
      if (result.exitCode !== 0) throw new HttpError({ status: 401, code: 'CONNECTOR_AUTH_REQUIRED', message: '飞书认证未完成或已过期。' })
    }
    await this.test(workspaceId, id)
  }

  async pickDirectory(): Promise<string> {
    const result = await this.runner('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择 Creator Studio 可读取的资料目录")'], { timeoutMs: 2 * 60_000 })
    if (result.exitCode !== 0 || !result.stdout.trim()) throw new HttpError({ status: 409, code: 'DIRECTORY_PICKER_CANCELLED', message: '未选择目录。' })
    return (await realpath(result.stdout.trim())).replace(/\/$/, '')
  }

  row(workspaceId: string, id: string): KnowledgeConnectionRow { return this.requireRow(workspaceId, id) }

  private requireRow(workspaceId: string, id: string): KnowledgeConnectionRow {
    const row = this.repository.getConnection(workspaceId, id)
    if (!row) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '连接不存在。' })
    return row
  }

  /** Starts the official app-creation device flow and leaves it alive while the browser completes setup. */
  private startLarkAppSetup(workspaceId: string, id: string, command: string): Promise<string> {
    if (this.larkSetupProcesses.has(id)) throw new HttpError({ status: 409, code: 'CONNECTOR_SETUP_IN_PROGRESS', message: '飞书应用配置正在等待浏览器确认。' })
    return new Promise((resolve, reject) => {
      const child = spawn(command, ['config', 'init', '--new', '--lang', 'zh_cn'], {
        env: { ...process.env, NO_COLOR: '1' }, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.larkSetupProcesses.set(id, child)
      let output = ''
      let settled = false
      const finishStart = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
      }
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString('utf8')).slice(-256 * 1024)
        const url = output.match(/https?:\/\/[^\s"']+/)?.[0]?.replace(/[),.;]+$/, '')
        if (url && !settled) { finishStart(); resolve(url) }
      }
      child.stdout.on('data', collect)
      child.stderr.on('data', collect)
      child.once('error', (error) => {
        this.larkSetupProcesses.delete(id)
        finishStart(new HttpError({ status: 503, code: 'CONNECTOR_SETUP_FAILED', message: `无法启动飞书应用配置：${error.message}` }))
      })
      child.once('close', (code) => {
        this.larkSetupProcesses.delete(id)
        const row = this.repository.getConnection(workspaceId, id)
        if (row) this.repository.updateConnection(workspaceId, id, {
          status: code === 0 ? 'auth_required' : 'error',
          last_error: code === 0 ? null : '飞书应用配置未完成，请重试。', updated_at: this.now(),
        })
        if (!settled) finishStart(new HttpError({ status: 502, code: 'CONNECTOR_SETUP_FAILED', message: '飞书 CLI 未返回应用配置链接。' }))
      })
      const timer = setTimeout(() => {
        if (!settled) {
          child.kill('SIGTERM')
          finishStart(new HttpError({ status: 504, code: 'CONNECTOR_SETUP_TIMEOUT', message: '等待飞书应用配置链接超时。' }))
        }
      }, 30_000)
    })
  }

  private async normalizeConfig(type: 'obsidian' | 'folder' | 'lark', input: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (type === 'lark') {
      const command = typeof input.command === 'string' && input.command ? input.command : this.managedLarkPath()
      return { command, ...(typeof input.managedVersion === 'string' ? { managedVersion: input.managedVersion } : {}) }
    }
    const raw = input.root ?? input.vaultRoot
    if (typeof raw !== 'string' || !isAbsolute(raw) || raw.split(/[\\/]/).includes('..')) throw new HttpError({ status: 403, code: 'CONNECTOR_PATH_DENIED', message: '目录必须是规范化绝对路径。' })
    try {
      const root = await realpath(raw)
      if (!(await stat(root)).isDirectory()) throw new Error()
      return { root, include: Array.isArray(input.include) ? input.include : [], exclude: Array.isArray(input.exclude) ? input.exclude : [] }
    } catch { throw new HttpError({ status: 403, code: 'CONNECTOR_PATH_DENIED', message: '目录不可读或不是目录。' }) }
  }
}
