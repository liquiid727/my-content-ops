import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import Database from 'better-sqlite3'

const root = resolve(import.meta.dirname, '..')
const entry = join(root, 'apps/server/dist/index.js')
if (!existsSync(entry)) throw new Error('Production server is not built. Run npm run build first.')

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('Could not reserve a local port'))
      resolvePort({ port: address.port, close: () => new Promise((resolveClose) => server.close(resolveClose)) })
    })
  })
}

function startServer(port, dataDirectory) {
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, CREATOR_STUDIO_PORT: String(port), CREATOR_STUDIO_DATA_DIR: dataDirectory },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  return { child, output: () => output }
}

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => reject(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms`)), timeoutMs)
    child.once('exit', (code, signal) => { clearTimeout(timer); resolveExit({ code, signal }) })
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

async function waitForHealth(port, timeoutMs = 3_000) {
  const startedAt = performance.now()
  let lastError
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
      if (response.ok) return performance.now() - startedAt
    } catch (error) { lastError = error }
    await new Promise((resolveWait) => setTimeout(resolveWait, 40))
  }
  throw new Error(`Server did not become healthy: ${String(lastError)}`)
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'creator-studio-runtime-gate-'))
try {
  const occupied = await reservePort()
  const occupiedRun = startServer(occupied.port, join(temporaryRoot, 'occupied-data'))
  const occupiedExit = await waitForExit(occupiedRun.child)
  if (occupiedExit.code === 0 || !/EADDRINUSE|address already in use/i.test(occupiedRun.output())) {
    throw new Error(`Occupied-port startup did not fail clearly. Output: ${occupiedRun.output()}`)
  }
  await occupied.close()

  const available = await reservePort()
  const port = available.port
  await available.close()
  const dataDirectory = join(temporaryRoot, 'production-data')
  const production = startServer(port, dataDirectory)
  const startupMs = await waitForHealth(port)
  const nestedRoute = await fetch(`http://127.0.0.1:${port}/projects/runtime-check/overview`)
  const nestedHtml = await nestedRoute.text()
  if (!nestedRoute.ok || !nestedHtml.includes('Creator Studio')) throw new Error('Production SPA fallback failed for a nested route')

  const pid = production.child.pid
  production.child.kill('SIGTERM')
  const stopped = await waitForExit(production.child)
  if (stopped.code !== 0) throw new Error(`Production shutdown failed (${JSON.stringify(stopped)}): ${production.output()}`)
  if (pid !== undefined) {
    try { process.kill(pid, 0); throw new Error(`Server process ${pid} still exists after shutdown`) }
    catch (error) { if (error?.code !== 'ESRCH') throw error }
  }

  const sqlite = new Database(join(dataDirectory, 'creator-studio.sqlite'))
  try { sqlite.exec('BEGIN EXCLUSIVE; ROLLBACK;') } finally { sqlite.close() }

  console.log(JSON.stringify({ occupiedPort: 'rejected', productionRoute: 'ok', cleanShutdown: 'ok', databaseLockReleased: 'ok', startupMs: Math.round(startupMs * 100) / 100 }))
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
