import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serverPort = Number(env.CREATOR_STUDIO_PORT ?? 4310)
  const webPort = Number(env.CREATOR_STUDIO_WEB_PORT ?? 5173)

  return {
    plugins: [react()],
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
