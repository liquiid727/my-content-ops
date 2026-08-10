#!/usr/bin/env node
// Creator Studio dev launcher — runs web (Vite) + server (tsx watch) in parallel
// with an emoji banner, colored per-service log prefixes, and a readiness check.
// Entry point is `pnpm run dev` (which runs `predev` to build contracts first).
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const webPort = process.env.CREATOR_STUDIO_WEB_PORT ?? '5173'
const serverPort = process.env.CREATOR_STUDIO_PORT ?? '4310'
const dataDir = process.env.CREATOR_STUDIO_DATA_DIR ?? 'data'

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

console.log('')
console.log(color(BOLD + MAGENTA, '  🎛️  Creator Studio Dev'))
console.log(color(DIM, `  ───────────────────────────────────────────────`))
console.log(`  ${cyan('🌐  Web')}    →  http://127.0.0.1:${webPort}`)
console.log(`  ${cyan('⚙️   API')}    →  http://127.0.0.1:${serverPort}`)
console.log(`  ${yellow('📦  Data')}   →  ${dataDir}`)
console.log('')

const env = { ...process.env, FORCE_COLOR: '1' }

const children = [
  { name: 'web', emoji: '🌐', color: magenta, args: ['--filter', '@creator-studio/web', 'run', 'dev'] },
  { name: 'server', emoji: '⚙️', color: cyan, args: ['--filter', '@creator-studio/server', 'run', 'dev'] },
].map(({ name, emoji, color, args }) => {
  const child = spawn('pnpm', args, { cwd: root, env, detached: true, stdio: ['inherit', 'pipe', 'pipe'] })
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
          console.log(green(`     🌐 Web → http://127.0.0.1:${webPort}`))
          console.log(green(`     ⚙️  API → http://127.0.0.1:${serverPort}`))
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
