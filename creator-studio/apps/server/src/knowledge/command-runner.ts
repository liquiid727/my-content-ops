import { spawn } from 'node:child_process'

export interface CommandResult { stdout: string; stderr: string; exitCode: number }
export type CommandRunner = (command: string, args: string[], options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal }) => Promise<CommandResult>

/** Executes one binary directly. No shell is involved, so resource refs cannot become shell syntax. */
export const runCommand: CommandRunner = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: '1' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const maxOutput = 8 * 1024 * 1024
  const collect = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(0, maxOutput)
  child.stdout.on('data', (chunk: Buffer) => { stdout = collect(stdout, chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr = collect(stderr, chunk) })
  const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs ?? 30_000)
  const abort = () => child.kill('SIGTERM')
  options.signal?.addEventListener('abort', abort, { once: true })
  child.once('error', reject)
  child.once('close', (code) => {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    resolve({ stdout, stderr, exitCode: code ?? -1 })
  })
})
