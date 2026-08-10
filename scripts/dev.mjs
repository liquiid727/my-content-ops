import { spawn } from 'node:child_process'
import process from 'node:process'

const env = {
  ...process.env,
  VAULT_PATH: process.env.VAULT_PATH ?? `${process.env.HOME ?? ''}/Journal/personal_journey`,
  PORT: process.env.VAULT_PORT ?? process.env.PORT ?? '3721',
}

const commands = [
  {
    name: 'vault',
    command: 'npm',
    args: ['--prefix', 'vault-server', 'run', 'dev'],
    env,
  },
  {
    name: 'studio',
    command: 'npm',
    args: ['--prefix', 'creator-studio', 'run', 'dev'],
    env,
  },
]

const children = commands.map(({ name, command, args, env }) => {
  const child = spawn(command, args, { env, stdio: ['inherit', 'pipe', 'pipe'] })

  const prefix = (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.log(`[${name}] ${line}`)
    }
  }

  child.stdout.on('data', prefix)
  child.stderr.on('data', prefix)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[${name}] exited with ${signal ?? code}`)
    shutdown(code ?? 1)
  })

  return child
})

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
