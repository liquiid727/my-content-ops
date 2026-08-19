#!/usr/bin/env node
// Launch the vendored infinite-canvas Vite app.
// Entry: `make dev-canvas` / `pnpm run dev:canvas`
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const webDir = resolve(root, 'infinite-canvas/web')
const preferredPort = Number(process.env.CREATOR_STUDIO_CANVAS_PORT ?? 3300)

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

const color = (c, s) => `${c}${s}${RESET}`
const cyan = (s) => color(CYAN, s)
const yellow = (s) => color(YELLOW, s)
const red = (s) => color(RED, s)

function isPortFree(port) {
  return new Promise((resolvePromise) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolvePromise(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolvePromise(true))
    })
  })
}

async function resolvePort(start) {
  if (await isPortFree(start)) return start
  if (process.env.CREATOR_STUDIO_CANVAS_PORT) {
    console.error(red(`  ✖  Port ${start} (Canvas) is already in use.`))
    console.error(yellow('     Free it, or set CREATOR_STUDIO_CANVAS_PORT to a free port.'))
    process.exit(1)
  }
  for (let port = start + 1; port < start + 50; port += 1) {
    if (await isPortFree(port)) {
      console.log(yellow(`  ⚠️  Port ${start} busy → using ${port} for Canvas`))
      return port
    }
  }
  console.error(red(`  ✖  No free port found near ${start} for Canvas`))
  process.exit(1)
}

if (!existsSync(resolve(webDir, 'package.json'))) {
  console.error(red('  ✖  infinite-canvas/web is missing. See infinite-canvas/VENDOR.md'))
  process.exit(1)
}

if (!existsSync(resolve(webDir, 'node_modules/vite'))) {
  console.error(red('  ✖  Canvas dependencies are not installed.'))
  console.error(yellow('     Run: make canvas-install'))
  process.exit(1)
}

const port = String(await resolvePort(preferredPort))

console.log('')
console.log(color(BOLD + CYAN, '  🖼️  Infinite Canvas'))
console.log(color(DIM, '  ───────────────────────────────────────────────'))
console.log(`  ${cyan('🌐  Canvas')} →  http://127.0.0.1:${port}/canvas`)
console.log(`  ${cyan('⚙️   Config')} →  http://127.0.0.1:${port}/config`)
console.log('')

const child = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'],
  { cwd: webDir, env: { ...process.env, FORCE_COLOR: '1' }, stdio: 'inherit' },
)

const shutdown = (code = 0) => {
  if (child.exitCode === null) child.kill('SIGTERM')
  process.exit(code)
}

child.on('exit', (code, signal) => {
  if (signal === 'SIGTERM' || signal === 'SIGINT') process.exit(0)
  process.exit(code ?? 1)
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
