#!/usr/bin/env node
// Monorepo dev launcher — runs vault-server + creator-studio (web + server) in
// parallel with an emoji banner and colored per-service log prefixes.
// Entry point: `pnpm run dev` from the repository root.
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const vaultPort = process.env.VAULT_PORT ?? process.env.PORT ?? '3721'
const webPort = process.env.CREATOR_STUDIO_WEB_PORT ?? '5173'
const serverPort = process.env.CREATOR_STUDIO_PORT ?? '4310'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const MAGENTA = '\x1b[35m'
const RED = '\x1b[31m'

const color = (c, s) => `${c}${s}${RESET}`
const green = (s) => color(GREEN, s)
const magenta = (s) => color(MAGENTA, s)
const red = (s) => color(RED, s)

console.log('')
console.log(color(BOLD + MAGENTA, '  🎛️  Content Ops Dev'))
console.log(color(DIM, `  ───────────────────────────────────────────────`))
console.log(`  ${green('📓 Vault')}  →  http://127.0.0.1:${vaultPort}/status`)
console.log(`  ${magenta('🌐 Web')}    →  http://127.0.0.1:${webPort}`)
console.log(`  ${magenta('⚙️  API')}    →  http://127.0.0.1:${serverPort}`)
console.log('')

const env = {
  ...process.env,
  FORCE_COLOR: '1',
  VAULT_PATH: process.env.VAULT_PATH ?? `${process.env.HOME ?? ''}/Journal/personal_journey`,
  PORT: vaultPort,
  CREATOR_STUDIO_PORT: serverPort,
  CREATOR_STUDIO_WEB_PORT: webPort,
}

const commands = [
  { name: 'vault', emoji: '📓', color: green, args: ['-C', 'vault-server', 'run', 'dev'] },
  { name: 'studio', emoji: '🎛️', color: magenta, args: ['-C', 'creator-studio', 'run', 'dev'] },
]

const children = commands.map(({ name, emoji, color, args }) => {
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
