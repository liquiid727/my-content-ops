import { connectionCheckResponseSchema, saveLarkSettingSchema, saveObsidianSettingSchema, saveProviderSettingSchema, settingsResponseSchema } from '@creator-studio/contracts'
import type { Hono } from 'hono'
import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { SettingsService } from './settings-service.js'
async function json(context: { req: { json: () => Promise<unknown> } }) { try { return await context.req.json() } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是 JSON。' }) } }
export function configureSettingsRoutes(app: Hono<HttpBindings>, service: SettingsService): void {
  app.get('/settings', async (c) => c.json(settingsResponseSchema.parse({ data: await service.load(c.get('workspaceId')), meta: { requestId: c.get('requestId') } })))
  app.patch('/providers/:key', async (c) => { await service.saveProvider(c.get('workspaceId'), c.req.param('key'), parseWithSchema(saveProviderSettingSchema, await json(c))); return c.json(settingsResponseSchema.parse({ data: await service.load(c.get('workspaceId')), meta: { requestId: c.get('requestId') } })) })
  app.patch('/connectors/lark_cli', async (c) => { await service.saveConnector(c.get('workspaceId'), 'lark_cli', parseWithSchema(saveLarkSettingSchema, await json(c))); return c.json(settingsResponseSchema.parse({ data: await service.load(c.get('workspaceId')), meta: { requestId: c.get('requestId') } })) })
  app.patch('/connectors/obsidian', async (c) => { await service.saveConnector(c.get('workspaceId'), 'obsidian', parseWithSchema(saveObsidianSettingSchema, await json(c))); return c.json(settingsResponseSchema.parse({ data: await service.load(c.get('workspaceId')), meta: { requestId: c.get('requestId') } })) })
  app.post('/providers/:key/test', async (c) => c.json(connectionCheckResponseSchema.parse({ data: await service.testProvider(c.get('workspaceId'), c.req.param('key')), meta: { requestId: c.get('requestId') } })))
  app.post('/connectors/:key/test', async (c) => { const key = c.req.param('key'); if (key !== 'lark_cli' && key !== 'obsidian') throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Connector 不存在。' }); return c.json(connectionCheckResponseSchema.parse({ data: await service.testConnector(c.get('workspaceId'), key), meta: { requestId: c.get('requestId') } })) })
}

