import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { extname } from 'node:path'

import { createApiApp, type ApiAppOptions } from './http/app.js'

export interface StaticAppOptions extends ApiAppOptions {
  webRoot: string
}

export function createStaticApp({ webRoot, ...apiOptions }: StaticAppOptions) {
  const app = new Hono()
  const serveIndex = serveStatic({ path: 'index.html', root: webRoot })
  const api = createApiApp(apiOptions)

  app.use('*', async (context, next) => {
    context.header('X-Content-Type-Options', 'nosniff')
    await next()
    context.header('X-Content-Type-Options', 'nosniff')
  })
  app.route('/api/v1', api)
  app.use('*', serveStatic({ root: webRoot }))
  app.get('*', async (context, next) => {
    const pathname = new URL(context.req.url).pathname

    if (extname(pathname) !== '') {
      return context.notFound()
    }

    return (await serveIndex(context, next)) ?? context.notFound()
  })

  return app
}
