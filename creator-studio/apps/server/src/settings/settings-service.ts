import { serializeIsoDateTime, settingsSchema, type SettingsData } from '@creator-studio/contracts'
import { access, constants } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, delimiter, join } from 'node:path'
import { ulid } from 'ulid'
import { HttpError } from '../http/errors.js'
import { ConfigRepository } from '../repositories/index.js'
import { SecretStore } from './secret-store.js'

function parse(json: string): Record<string, unknown> { return JSON.parse(json) as Record<string, unknown> }
function checkedAt(value: number | null) { return value === null ? null : serializeIsoDateTime(new Date(value)) }
async function executableExists(command: string): Promise<boolean> {
  if (command === 'seed-lark') return true
  const candidates = isAbsolute(command) ? [command] : (process.env.PATH ?? '').split(delimiter).map((path) => join(path, command))
  return new Promise((resolve) => { let pending = candidates.length; if (!pending) return resolve(false); for (const candidate of candidates) access(candidate, constants.X_OK, (error) => { if (!error) resolve(true); else if (--pending === 0) resolve(false) }) })
}

export class SettingsService {
  constructor(private readonly configs: ConfigRepository, private readonly secrets: SecretStore, private readonly now: () => number = Date.now) {}
  async load(workspaceId: string): Promise<SettingsData> {
    const [providers, connectors] = await Promise.all([this.configs.listProviders(workspaceId), this.configs.listConnectors(workspaceId)])
    return settingsSchema.parse({
      providers: await Promise.all(providers.map(async (item) => ({ key: item.providerKey, displayName: item.displayName, enabled: item.enabled, configured: await this.secrets.has(item.secretRef), config: parse(item.configJson), check: { status: null, checkedAt: null } }))),
      connectors: await Promise.all(connectors.map(async (item) => ({ key: item.connectorKey, displayName: item.displayName, enabled: item.enabled, configured: await this.secrets.has(item.secretRef), config: parse(item.configJson), check: { status: item.lastCheckStatus, checkedAt: checkedAt(item.lastCheckedAt) }, availability: 'stub_only' }))),
    })
  }
  async saveProvider(workspaceId: string, key: string, input: { displayName: string; enabled: boolean; model?: string | undefined; imageModel?: string | undefined; baseUrl?: string | undefined; credential?: string | undefined }) {
    const existing = await this.configs.getProvider(workspaceId, key); const now = this.now(); const ref = existing?.secretRef ?? (input.credential ? `provider:${workspaceId}:${key}` : null)
    if (input.credential && ref) await this.secrets.set(ref, input.credential)
    const config: Record<string, unknown> = {}
    if (input.model) config.model = input.model
    if (input.imageModel) config.imageModel = input.imageModel
    if (input.baseUrl) config.baseUrl = input.baseUrl
    await this.configs.saveProvider({ id: existing?.id ?? ulid(now), workspaceId, providerKey: key, displayName: input.displayName, configJson: JSON.stringify(config), secretRef: ref, enabled: input.enabled, createdAt: existing?.createdAt ?? now, updatedAt: now })
  }
  async saveConnector(workspaceId: string, key: 'lark_cli' | 'obsidian', input: Record<string, unknown> & { enabled: boolean; credential?: string | undefined }) {
    const config = key === 'lark_cli' ? { command: input.command, args: input.args } : { vaultRoot: await this.validateVault(String(input.vaultRoot)) }
    const existing = await this.configs.getConnector(workspaceId, key); const now = this.now(); const ref = existing?.secretRef ?? (input.credential ? `connector:${workspaceId}:${key}` : null)
    if (input.credential && ref) await this.secrets.set(ref, input.credential)
    await this.configs.saveConnector({ id: existing?.id ?? ulid(now), workspaceId, connectorKey: key, displayName: key === 'lark_cli' ? 'Lark CLI' : 'Obsidian', configJson: JSON.stringify(config), secretRef: ref, enabled: input.enabled, createdAt: existing?.createdAt ?? now, updatedAt: now })
  }
  async testConnector(workspaceId: string, key: 'lark_cli' | 'obsidian') {
    const config = await this.configs.getConnector(workspaceId, key)
    if (!config) throw new HttpError({ status: 422, code: 'CONNECTOR_UNAVAILABLE', message: '请先保存 Connector 配置。' })
    const values = parse(config.configJson)
    if (key === 'lark_cli' && !(await executableExists(String(values.command)))) throw new HttpError({ status: 503, code: 'CONNECTOR_UNAVAILABLE', message: 'Lark CLI 未安装或命令不可执行，请检查命令名称或路径。' })
    if (key === 'obsidian') await this.validateVault(String(values.vaultRoot))
    const now = this.now(); await this.configs.saveConnector({ ...config, lastCheckedAt: now, lastCheckStatus: 'ok', updatedAt: now })
    return { ok: true, mode: 'stub' as const, message: 'Foundation deterministic stub 连接成功；真实调用尚未开放。' }
  }
  async testProvider(workspaceId: string, key: string) {
    if (!(await this.configs.getProvider(workspaceId, key))) throw new HttpError({ status: 503, code: 'PROVIDER_UNAVAILABLE', message: '请先保存 Provider 配置。' })
    return { ok: true, mode: 'stub' as const, message: 'Foundation deterministic stub 连接成功；真实调用尚未开放。' }
  }
  private async validateVault(value: string): Promise<string> {
    if (!isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new HttpError({ status: 403, code: 'CONNECTOR_PATH_DENIED', message: 'Vault 根目录必须是规范化绝对目录。' })
    try { const resolved = await realpath(value); const info = await stat(resolved); if (!info.isDirectory()) throw new Error(); await new Promise<void>((resolve, reject) => access(resolved, constants.R_OK, (error) => error ? reject(error) : resolve())); return resolved } catch { throw new HttpError({ status: 403, code: 'CONNECTOR_PATH_DENIED', message: 'Vault 根目录不可读或不是目录。' }) }
  }
}
