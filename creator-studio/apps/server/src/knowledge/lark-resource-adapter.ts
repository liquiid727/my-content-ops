import { basename } from 'node:path'

import { HttpError } from '../http/errors.js'
import type { CommandRunner } from './command-runner.js'
import { runCommand } from './command-runner.js'
import type { AdapterConnection, NormalizedResource, ResourceAdapter, ResourceDescriptor } from './resource-adapter.js'

function cliPath(connection: AdapterConnection): string {
  const value = connection.config.command ?? connection.config.cliPath
  if (typeof value !== 'string' || !value) throw new HttpError({ status: 422, code: 'CONNECTOR_UNAVAILABLE', message: '飞书 CLI 尚未安装。' })
  return value
}

function parseEnvelope(stdout: string): unknown {
  try {
    const parsed = JSON.parse(stdout) as { ok?: boolean; data?: unknown; error?: { message?: string; hint?: string } }
    if (parsed.ok === false) throw new Error(parsed.error?.hint ?? parsed.error?.message ?? '飞书 CLI 调用失败。')
    return parsed.data ?? parsed
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpError({ status: 502, code: 'CONNECTOR_INVALID_RESPONSE', message: '飞书 CLI 返回了无法解析的结果。' })
    throw error
  }
}

function objects(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(objects)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const own = ('token' in record || 'file_token' in record || 'url' in record) ? [record] : []
  return [...own, ...Object.values(record).flatMap(objects)]
}

function descriptor(record: Record<string, unknown>): ResourceDescriptor | null {
  const ref = record.url ?? record.token ?? record.file_token ?? record.obj_token
  if (typeof ref !== 'string' || !ref) return null
  const rawType = String(record.type ?? record.obj_type ?? record.file_type ?? 'docx').toLowerCase()
  const kind = rawType.includes('sheet') || rawType.includes('bitable') || rawType.includes('base') ? 'spreadsheet' : 'document'
  const title = String(record.title ?? record.name ?? ref)
  return {
    ref, title, kind, mimeType: kind === 'spreadsheet' ? 'application/json' : 'text/markdown',
    excerpt: String(record.excerpt ?? record.summary ?? ''), sourceUrl: typeof record.url === 'string' ? record.url : null,
    sourceVersion: typeof record.version === 'string' || typeof record.version === 'number' ? String(record.version) : null,
    modifiedAt: typeof record.modified_time === 'number' ? record.modified_time * 1000 : null,
    metadata: { larkType: rawType, token: String(record.token ?? record.file_token ?? record.obj_token ?? '') },
  }
}

function printable(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function collectKeyValues(value: unknown, keys: ReadonlySet<string>, output: string[] = []): string[] {
  if (Array.isArray(value)) { value.forEach((item) => collectKeyValues(item, keys, output)); return output }
  if (!value || typeof value !== 'object') return output
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && (typeof item === 'string' || typeof item === 'number')) output.push(String(item))
    else collectKeyValues(item, keys, output)
  }
  return output
}

export class LarkResourceAdapter implements ResourceAdapter {
  readonly type = 'lark' as const
  constructor(private readonly runner: CommandRunner = runCommand) {}

  private async call(connection: AdapterConnection, args: string[], timeoutMs = 30_000): Promise<unknown> {
    const result = await this.runner(cliPath(connection), [...args, '--format', 'json'], { timeoutMs })
    if (result.exitCode !== 0) {
      const detail = result.stderr || result.stdout
      if (/auth|login|token|credential|unauthorized/i.test(detail)) throw new HttpError({ status: 401, code: 'CONNECTOR_AUTH_REQUIRED', message: '飞书授权已失效，请重新认证。' })
      throw new HttpError({ status: 502, code: 'CONNECTOR_COMMAND_FAILED', message: '飞书 CLI 调用失败，请在连接设置中运行诊断。' })
    }
    return parseEnvelope(result.stdout)
  }

  async test(connection: AdapterConnection) {
    const result = await this.runner(cliPath(connection), ['auth', 'status', '--json'], { timeoutMs: 15_000 })
    if (result.exitCode !== 0) return { ok: false, status: 'auth_required' as const, message: '飞书用户授权尚未完成或已失效。' }
    try {
      const status = JSON.parse(result.stdout) as { identities?: { user?: { available?: boolean } } }
      if (!status.identities?.user?.available) return { ok: false, status: 'auth_required' as const, message: '飞书应用已配置，请继续完成用户授权。' }
      return { ok: true, status: 'ready' as const, message: '飞书 CLI 已安装并完成用户授权。' }
    } catch { throw new HttpError({ status: 502, code: 'CONNECTOR_INVALID_RESPONSE', message: '飞书 CLI 返回了无法解析的认证状态。' }) }
  }

  async browse(connection: AdapterConnection, limit: number): Promise<ResourceDescriptor[]> {
    return this.search(connection, '', limit)
  }

  async search(connection: AdapterConnection, query: string, limit: number): Promise<ResourceDescriptor[]> {
    const unique = new Map<string, ResourceDescriptor>()
    let pageToken: string | undefined
    const cappedLimit = Math.min(limit, 2_000)
    do {
      const data = await this.call(connection, ['drive', '+search', '--query', query, '--page-size', String(Math.min(cappedLimit - unique.size, 20)), ...(pageToken ? ['--page-token', pageToken] : [])])
      for (const item of objects(data)) {
        const result = descriptor(item)
        if (result && !unique.has(result.ref)) unique.set(result.ref, result)
      }
      const next = collectKeyValues(data, new Set(['page_token', 'next_page_token']))[0]
      pageToken = next && next !== pageToken ? next : undefined
    } while (pageToken && unique.size < cappedLimit)
    return [...unique.values()].slice(0, limit)
  }

  async stat(connection: AdapterConnection, ref: string): Promise<ResourceDescriptor> {
    const inspected = await this.call(connection, ['drive', '+inspect', '--url', ref])
    const item = objects(inspected)[0] ?? (inspected && typeof inspected === 'object' ? inspected as Record<string, unknown> : {})
    return descriptor(item) ?? { ref, title: basename(ref), kind: 'document', mimeType: 'text/markdown', excerpt: '', sourceUrl: ref.startsWith('http') ? ref : null, sourceVersion: null, modifiedAt: null, metadata: {} }
  }

  async read(connection: AdapterConnection, ref: string): Promise<NormalizedResource> {
    const inspected = await this.call(connection, ['drive', '+inspect', '--url', ref])
    const item = objects(inspected)[0] ?? (inspected && typeof inspected === 'object' ? inspected as Record<string, unknown> : {})
    const info = descriptor(item) ?? { ref, title: basename(ref), kind: 'document' as const, mimeType: 'text/markdown', excerpt: '', sourceUrl: ref.startsWith('http') ? ref : null, sourceVersion: null, modifiedAt: null, metadata: {} }
    const larkType = String(item.type ?? item.obj_type ?? item.file_type ?? info.metadata.larkType ?? 'docx').toLowerCase()
    const token = String(item.token ?? item.obj_token ?? item.file_token ?? ref)
    let data: unknown
    if (larkType.includes('sheet') && !larkType.includes('bitable')) {
      const locator = ref.startsWith('http') ? ['--url', ref] : ['--spreadsheet-token', token]
      const workbook = await this.call(connection, ['sheets', '+workbook-info', ...locator])
      const sheetIds = [...new Set(collectKeyValues(workbook, new Set(['sheet_id', 'sheetId'])))].slice(0, 20)
      if (!sheetIds.length) throw new HttpError({ status: 422, code: 'RESOURCE_EXTRACTION_FAILED', message: '飞书表格中没有可读取的工作表。' })
      const sheets: unknown[] = []
      for (const sheetId of sheetIds) sheets.push(await this.call(connection, ['sheets', '+csv-get', ...locator, '--sheet-id', sheetId, '--max-chars', '100000']))
      data = sheets
    } else if (larkType.includes('bitable') || larkType.includes('base')) {
      const resolved = ref.startsWith('http') ? await this.call(connection, ['base', '+url-resolve', '--url', ref]) : item
      const baseToken = collectKeyValues(resolved, new Set(['base_token', 'app_token', 'baseToken', 'appToken']))[0] ?? token
      let tableIds = [...new Set(collectKeyValues(resolved, new Set(['table_id', 'tableId'])))].slice(0, 20)
      if (!tableIds.length) {
        const tables = await this.call(connection, ['base', '+table-list', '--base-token', baseToken, '--limit', '100'])
        tableIds = [...new Set(collectKeyValues(tables, new Set(['table_id', 'tableId'])))].slice(0, 20)
      }
      if (!tableIds.length) throw new HttpError({ status: 422, code: 'RESOURCE_EXTRACTION_FAILED', message: '飞书多维表格中没有可读取的数据表。' })
      const tables: unknown[] = []
      for (const tableId of tableIds) tables.push(await this.call(connection, ['base', '+record-list', '--base-token', baseToken, '--table-id', tableId, '--limit', '200']))
      data = tables
    }
    else data = await this.call(connection, ['docs', '+fetch', '--doc', ref, '--doc-format', 'markdown'], 60_000)
    const text = printable(data)
    return { ...info, text, excerpt: text.slice(0, 300), metadata: { ...info.metadata, larkType, token } }
  }
}
