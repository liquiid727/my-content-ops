import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { BM25Index } from './bm25.js'

export function createApp(index: BM25Index, vaultPath: string) {
  const app = new Hono()

  app.use('*', cors({ origin: '*' }))

  app.get('/status', (c) => {
    return c.json({ ok: true, docs: index.size, vaultPath })
  })

  app.get('/search', (c) => {
    const q = c.req.query('q')?.trim()
    const limit = Math.min(Number(c.req.query('limit') ?? 8), 20)

    if (!q) return c.json({ error: 'q is required' }, 400)

    const results = index.search(q, limit).map((r) => ({
      path: r.meta.path,
      title: r.meta.title,
      excerpt: r.meta.excerpt,
      content: r.meta.content,
      tags: r.meta.tags,
      folder: r.meta.folder,
      score: Math.round(r.score * 100) / 100,
    }))

    return c.json({ query: q, results })
  })

  return app
}
