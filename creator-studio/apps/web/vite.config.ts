import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Prefer process.env (set by scripts/dev.mjs) over .env files so port
  // auto-fallback and CLI overrides actually reach the Vite proxy.
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const serverPort = Number(process.env.CREATOR_STUDIO_PORT ?? fileEnv.CREATOR_STUDIO_PORT ?? 4310)
  const webPort = Number(process.env.CREATOR_STUDIO_WEB_PORT ?? fileEnv.CREATOR_STUDIO_WEB_PORT ?? 5173)
  const canvasPort = Number(process.env.CREATOR_STUDIO_CANVAS_PORT ?? fileEnv.CREATOR_STUDIO_CANVAS_PORT ?? 3300)
  const canvasOrigin = process.env.VITE_CANVAS_ORIGIN ?? fileEnv.VITE_CANVAS_ORIGIN ?? `http://127.0.0.1:${canvasPort}`

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_CANVAS_ORIGIN': JSON.stringify(canvasOrigin),
    },
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': `http://127.0.0.1:${serverPort}`,
      },
    },
  }
})
