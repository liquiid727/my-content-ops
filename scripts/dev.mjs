#!/usr/bin/env node
// Monorepo dev launcher — runs vault-server + creator-studio + infinite-canvas
// in parallel with an emoji banner and colored per-service log prefixes.
// Entry point: `pnpm run dev` from the repository root.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const preferredVaultPort = Number(process.env.VAULT_PORT ?? process.env.PORT ?? 3721)
const preferredWebPort = Number(process.env.CREATOR_STUDIO_WEB_PORT ?? 5173)
const preferredServerPort = Number(process.env.CREATOR_STUDIO_PORT ?? 4310)
const preferredCanvasPort = Number(process.env.CREATOR_STUDIO_CANVAS_PORT ?? 3300)

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const MAGENTA = '\x1b[35m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

const color = (c, s) => `${c}${s}${RESET}`
const green = (s) => color(GREEN, s)
const magenta = (s) => color(MAGENTA, s)
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

async function resolvePort(start, label, envKey) {
  if (await isPortFree(start)) return start
  // If the user pinned a port via env, fail loudly instead of shifting.
  if (process.env[envKey] || (envKey === 'PORT' && process.env.VAULT_PORT)) {
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

const vaultPort = String(await resolvePort(preferredVaultPort, 'Vault', 'VAULT_PORT'))
const webPort = String(await resolvePort(preferredWebPort, 'Web', 'CREATOR_STUDIO_WEB_PORT'))
const serverPort = String(await resolvePort(preferredServerPort, 'API', 'CREATOR_STUDIO_PORT'))
const canvasPort = String(preferredCanvasPort)

console.log('')
console.log(color(BOLD + MAGENTA, '  🎛️  Content Ops Dev'))
console.log(color(DIM, `  ───────────────────────────────────────────────`))
console.log(`  ${green('📓 Vault')}  →  http://127.0.0.1:${vaultPort}/status`)
console.log(`  ${magenta('🌐 Web')}    →  http://127.0.0.1:${webPort}`)
console.log(`  ${magenta('⚙️  API')}    →  http://127.0.0.1:${serverPort}`)
console.log(`  ${cyan('🖼️  Canvas')} →  embedded in Web (host :${canvasPort})`)
console.log('')

const env = {
  ...process.env,
  FORCE_COLOR: '1',
  VAULT_PATH: process.env.VAULT_PATH ?? `${process.env.HOME ?? ''}/Journal/personal_journey`,
  PORT: vaultPort,
  VAULT_PORT: vaultPort,
  CREATOR_STUDIO_PORT: serverPort,
  CREATOR_STUDIO_WEB_PORT: webPort,
  CREATOR_STUDIO_CANVAS_PORT: canvasPort,
  VITE_CANVAS_ORIGIN: `http://127.0.0.1:${canvasPort}`,
}

const commands = [
  { name: 'vault', emoji: '📓', color: green, cmd: 'pnpm', args: ['-C', 'vault-server', 'run', 'dev'] },
  { name: 'studio', emoji: '🎛️', color: magenta, cmd: 'pnpm', args: ['-C', 'creator-studio', 'run', 'dev'] },
]

const children = commands.map(({ name, emoji, color, cmd, args }) => {
  const child = spawn(cmd, args, { cwd: root, env, detached: true, stdio: ['inherit', 'pipe', 'pipe'] })

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
