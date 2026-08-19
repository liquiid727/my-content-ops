#!/usr/bin/env node
// Creator Studio dev launcher — web + server + embedded canvas host.
// Entry point is `pnpm run dev` (which runs `predev` to build contracts first).
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const repoRoot = resolve(root, '..')
const preferredWebPort = Number(process.env.CREATOR_STUDIO_WEB_PORT ?? 5173)
const preferredServerPort = Number(process.env.CREATOR_STUDIO_PORT ?? 4310)
const preferredCanvasPort = Number(process.env.CREATOR_STUDIO_CANVAS_PORT ?? 3300)
const dataDir = process.env.CREATOR_STUDIO_DATA_DIR ?? 'data'
const strictPorts = process.env.CREATOR_STUDIO_STRICT_PORTS === '1'
const canvasInstalled = existsSync(resolve(repoRoot, 'infinite-canvas/web/node_modules/vite'))

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const MAGENTA = '\x1b[35m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

const color = (c, s) => `${c}${s}${RESET}`
const magenta = (s) => color(MAGENTA, s)
const cyan = (s) => color(CYAN, s)
const green = (s) => color(GREEN, s)
const yellow = (s) => color(YELLOW, s)
const red = (s) => color(RED, s)

/** Probe whether a TCP port is free on 127.0.0.1. */
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

/**
 * Prefer `start`. If taken:
 * - fail when the user pinned the port via env, or CREATOR_STUDIO_STRICT_PORTS=1
 * - otherwise walk upward and use the next free port
 */
async function resolvePort(start, label, envKey) {
  if (await isPortFree(start)) return start
  if (strictPorts || process.env[envKey]) {
    console.error(red(`  ✖  Port ${start} (${label}) is already in use.`))
    console.error(yellow(`     Free it, or set ${envKey} to a free port.`))
    process.exit(1)
  }
  for (let port = start + 1; port < start + 50; port += 1) {
    if (await isPortFree(port)) {
      console.log(yellow(`  ⚠️  Port ${start} busy → using ${port} for ${label}`))
      return port
    }
  }
  console.error(red(`  ✖  No free port found near ${start} for ${label}`))
  process.exit(1)
}

const webPort = String(await resolvePort(preferredWebPort, 'Web', 'CREATOR_STUDIO_WEB_PORT'))
const serverPort = String(await resolvePort(preferredServerPort, 'API', 'CREATOR_STUDIO_PORT'))
const canvasPort = String(preferredCanvasPort)
const canvasFree = await isPortFree(preferredCanvasPort)
const startCanvas = canvasInstalled && canvasFree
const canvasOrigin = `http://127.0.0.1:${canvasPort}`

console.log('')
console.log(color(BOLD + MAGENTA, '  🎛️  Creator Studio Dev'))
console.log(color(DIM, `  ───────────────────────────────────────────────`))
console.log(`  ${cyan('🌐  Web')}    →  http://127.0.0.1:${webPort}`)
console.log(`  ${cyan('⚙️   API')}    →  http://127.0.0.1:${serverPort}`)
if (!canvasInstalled) {
  console.log(yellow('  ⚠️  Canvas skipped — run `make canvas-install`'))
} else if (startCanvas) {
  console.log(`  ${cyan('🖼️  Canvas')} →  ${canvasOrigin}/canvas  (embedded in Web)`)
} else {
  console.log(`  ${cyan('🖼️  Canvas')} →  ${canvasOrigin}/canvas  (already running)`)
}
console.log(`  ${yellow('📦  Data')}   →  ${dataDir}`)
console.log('')

const env = {
  ...process.env,
  FORCE_COLOR: '1',
  CREATOR_STUDIO_WEB_PORT: webPort,
  CREATOR_STUDIO_PORT: serverPort,
  CREATOR_STUDIO_CANVAS_PORT: canvasPort,
  VITE_CANVAS_ORIGIN: canvasOrigin,
}

const processes = [
  { name: 'web', emoji: '🌐', color: magenta, cmd: 'pnpm', args: ['--filter', '@creator-studio/web', 'run', 'dev'], cwd: root },
  { name: 'server', emoji: '⚙️', color: cyan, cmd: 'pnpm', args: ['--filter', '@creator-studio/server', 'run', 'dev'], cwd: root },
]
if (startCanvas) {
  processes.push({ name: 'canvas', emoji: '🖼️', color: green, cmd: 'node', args: [resolve(repoRoot, 'scripts/dev-canvas.mjs')], cwd: repoRoot })
}

const children = processes.map(({ name, emoji, color, cmd, args, cwd }) => {
  const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['inherit', 'pipe', 'pipe'] })
  const prefix = (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.log(`${color(`${emoji} [${name}]`)} ${line}`)
    }
  }
  child.stdout.on('data', prefix)
  child.stderr.on('data', prefix)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`${red(`${emoji} [${name}]`)} exited with ${signal ?? code}`)
    shutdown(code ?? 1)
  })
  return child
})

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  setTimeout(() => process.exit(code), 300).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Readiness — poll /api/v1/health until the server reports ok, then print ✅.
;(async () => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/health`)
      if (res.ok) {
        const body = await res.json()
        if (body?.data?.status === 'ok') {
          console.log('')
          console.log(green('  ✅  Creator Studio 就绪 (ready)'))
          console.log(green(`     打开 http://127.0.0.1:${webPort}  （画布嵌在项目页里，不用另开端口）`))
          console.log(green(`     ⚙️  API → http://127.0.0.1:${serverPort}`))
          if (canvasInstalled) console.log(green(`     🖼️  Canvas host → ${canvasOrigin}`))
          console.log(green('     Ctrl+C 停止'))
          console.log('')
          return
        }
      }
    } catch {
      // server not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.error(yellow(`  ⚠️  Server health not confirmed within 30s — check the ⚙️ [server] log above.`))
})()
