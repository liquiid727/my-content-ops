import { assetListQuerySchema, assetListResponseSchema, assetResponseSchema, assetUploadFieldsSchema, idSchema } from '@creator-studio/contracts'
import { bodyLimit } from 'hono/body-limit'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import { DEFAULT_MAX_ASSET_BYTES, type AssetService } from './asset-service.js'

export function configureAssetRoutes(app: Hono<HttpBindings>, service: AssetService, maxBytes = DEFAULT_MAX_ASSET_BYTES): void {
  app.get('/assets', async (context) => {
    const query = parseWithSchema(assetListQuerySchema, { projectId: context.req.query('projectId'), type: context.req.query('type'), cursor: context.req.query('cursor'), limit: context.req.query('limit') })
    const page = await service.list({ workspaceId: context.get('workspaceId') }, query)
    return context.json(assetListResponseSchema.parse({ data: page.items, meta: { requestId: context.get('requestId'), hasMore: page.hasMore, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) } }))
  })

  app.post('/assets/upload', bodyLimit({
    maxSize: maxBytes + 1024 * 1024,
    onError: () => { throw new HttpError({ status: 413, code: 'FILE_TOO_LARGE', message: '上传文件超过 Server 限制。' }) },
  }), async (context) => {
    let body: Record<string, string | File | (string | File)[]>
    try { body = await context.req.parseBody({ all: true }) } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'multipart 请求无效。' }) }
    const candidate = body.file
    const file = Array.isArray(candidate) ? candidate[0] : candidate
    if (!(file instanceof File)) throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'multipart 字段 file 必须包含文件。' })
    const projectValue = Array.isArray(body.projectId) ? body.projectId[0] : body.projectId
    const fields = parseWithSchema(assetUploadFieldsSchema, { ...(typeof projectValue === 'string' && projectValue ? { projectId: projectValue } : {}) })
    const asset = await service.upload({ workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') }, file, fields.projectId)
    return context.json(assetResponseSchema.parse({ data: asset, meta: { requestId: context.get('requestId') } }), 201)
  })

  app.get('/assets/:assetId', async (context) => {
    const id = parseWithSchema(idSchema, context.req.param('assetId'))
    const { asset } = await service.get({ workspaceId: context.get('workspaceId') }, id)
    return context.json(assetResponseSchema.parse({ data: asset, meta: { requestId: context.get('requestId') } }))
  })

  app.get('/assets/:assetId/content', async (context) => {
    const id = parseWithSchema(idSchema, context.req.param('assetId'))
    const content = await service.content({ workspaceId: context.get('workspaceId') }, id)
    const rangeHeader = context.req.header('Range')
    const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/)
    let start = 0
    let end = content.bytes.byteLength - 1
    let status: 200 | 206 = 200
    if (rangeHeader) {
      if (!range || (!range[1] && !range[2])) {
        context.header('Content-Range', `bytes */${content.bytes.byteLength}`)
        return context.body(null, 416)
      }
      if (!range[1] && range[2]) {
        const suffixLength = Number(range[2])
        start = Math.max(content.bytes.byteLength - suffixLength, 0)
        end = content.bytes.byteLength - 1
      } else {
        start = Number(range[1])
        end = range[2] ? Number(range[2]) : end
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= content.bytes.byteLength) {
        context.header('Content-Range', `bytes */${content.bytes.byteLength}`)
        return context.body(null, 416)
      }
      end = Math.min(end, content.bytes.byteLength - 1)
      status = 206
      context.header('Content-Range', `bytes ${start}-${end}/${content.bytes.byteLength}`)
    }
    const bytes = content.bytes.slice(start, end + 1)
    context.header('Content-Type', content.mimeType)
    context.header('Content-Length', String(bytes.byteLength))
    context.header('Accept-Ranges', 'bytes')
    context.header('X-Content-Type-Options', 'nosniff')
    return context.body(bytes, status)
  })

  app.delete('/assets/:assetId', async (context) => {
    const id = parseWithSchema(idSchema, context.req.param('assetId'))
    await service.remove({ workspaceId: context.get('workspaceId') }, id)
    return context.body(null, 204)
  })
}
