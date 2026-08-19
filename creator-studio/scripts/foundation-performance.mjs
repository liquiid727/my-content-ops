import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'
import Database from 'better-sqlite3'
import { ulid } from 'ulid'

const root = resolve(import.meta.dirname, '..')
const entry = join(root, 'apps/server/dist/index.js')
if (!existsSync(entry)) throw new Error('Production server is not built. Run pnpm run build first.')

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a local port'))
      probe.close(() => resolvePort(address.port))
    })
  })
}

function startServer(port, dataDirectory) {
  const child = spawn(process.execPath, [entry], { cwd: root, env: { ...process.env, CREATOR_STUDIO_PORT: String(port), CREATOR_STUDIO_DATA_DIR: dataDirectory }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  return { child, output: () => output }
}

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => reject(new Error(`Process ${child.pid} did not exit`)), timeoutMs)
    child.once('exit', (code, signal) => { clearTimeout(timer); resolveExit({ code, signal }) })
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

async function stopServer(server) {
  server.child.kill('SIGTERM')
  const exit = await waitForExit(server.child)
  if (exit.code !== 0) throw new Error(`Server shutdown failed: ${server.output()}`)
}

async function healthReady(baseUrl, timeoutMs = 3_000) {
  const startedAt = performance.now()
  let lastError
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`)
      if (response.ok) return performance.now() - startedAt
    } catch (error) { lastError = error }
    await new Promise((resolveWait) => setTimeout(resolveWait, 30))
  }
  throw new Error(`Health did not become ready: ${String(lastError)}`)
}

function percentile95(values) {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)]
}

async function measuredRequest(url, init) {
  const startedAt = performance.now()
  const response = await fetch(url, init)
  const elapsed = performance.now() - startedAt
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed with ${response.status}: ${await response.text()}`)
  await response.arrayBuffer()
  return elapsed
}

function seedDatabase(databasePath) {
  const sqlite = new Database(databasePath)
  try {
    const workspace = sqlite.prepare('SELECT id FROM workspaces LIMIT 1').get()
    const profile = sqlite.prepare('SELECT id FROM creator_profiles LIMIT 1').get()
    if (!workspace || !profile) throw new Error('Default identity was not initialized')
    const now = Date.now() - 10_000
    const insertProject = sqlite.prepare('INSERT INTO projects (id, workspace_id, title, brief, status, content_type, settings_json, created_by, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    const insertAsset = sqlite.prepare('INSERT INTO assets (id, workspace_id, project_id, kind, source, display_name, mime_type, size_bytes, storage_path, sha256, metadata_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insertTask = sqlite.prepare('INSERT INTO tasks (id, workspace_id, type, status, progress, input_json, output_json, attempt_count, max_attempts, created_by, created_at, started_at, finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insertEvent = sqlite.prepare('INSERT INTO task_events (task_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?)')
    sqlite.transaction(() => {
      const projectIds = []
      for (let index = 0; index < 100; index += 1) {
        const id = ulid(now + index)
        projectIds.push(id)
        insertProject.run(id, workspace.id, `Seed Project ${String(index + 1).padStart(3, '0')}`, 'Foundation performance seed', 'draft', 'short_video', '{}', profile.id, now + index, now + index)
      }
      for (let index = 0; index < 1_000; index += 1) {
        const id = ulid(now + 1_000 + index)
        insertAsset.run(id, workspace.id, projectIds[index % projectIds.length], 'image', 'upload', `seed-${index}.png`, 'image/png', 68, `assets/${id}/seed.png`, String(index).padStart(64, '0'), '{}', profile.id, now + index, now + index)
      }
      const taskId = ulid(now + 3_000)
      insertTask.run(taskId, workspace.id, 'seed_generation', 'completed', 100, '{"prompt":"performance seed"}', '{"text":"done"}', 1, 1, profile.id, now, now + 1, now + 2, now + 2)
      for (let index = 0; index < 1_000; index += 1) insertEvent.run(taskId, index === 999 ? 'completed' : 'progress', '{}', now + index)
    })()
  } finally { sqlite.close() }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'creator-studio-performance-'))
let browser
try {
  const dataDirectory = join(temporaryRoot, 'data')
  const initializationPort = await availablePort()
  const initializationBase = `http://127.0.0.1:${initializationPort}`
  const initialization = startServer(initializationPort, dataDirectory)
  await healthReady(initializationBase)
  await stopServer(initialization)
  seedDatabase(join(dataDirectory, 'creator-studio.sqlite'))

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const production = startServer(port, dataDirectory)
  const startupMs = await healthReady(baseUrl)
  const bootstrap = await fetch(`${baseUrl}/api/v1/bootstrap`)
  if (!bootstrap.ok) throw new Error(`Bootstrap failed: ${await bootstrap.text()}`)
  const cookie = bootstrap.headers.get('set-cookie')?.split(';', 1)[0]
  if (!cookie) throw new Error('Bootstrap did not issue the local session cookie')
  const requestHeaders = { Cookie: cookie }

  const apiSamples = []
  const readPaths = ['/api/v1/projects?limit=30', '/api/v1/assets?limit=30', '/api/v1/tasks?limit=30']
  for (let index = 0; index < 60; index += 1) apiSamples.push(await measuredRequest(`${baseUrl}${readPaths[index % readPaths.length]}`, { headers: requestHeaders }))

  const createSamples = []
  for (let index = 0; index < 30; index += 1) {
    createSamples.push(await measuredRequest(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { ...requestHeaders, Origin: baseUrl, 'Content-Type': 'application/json', 'Idempotency-Key': ulid() },
      body: JSON.stringify({ title: `Performance Project ${index}`, brief: '', contentType: 'short_video' }),
    }))
  }

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const dashboardStartedAt = performance.now()
  await page.goto(baseUrl)
  await page.getByRole('heading', { name: '清晰掌控你的创作工作台。' }).waitFor()
  const dashboardInteractiveMs = performance.now() - dashboardStartedAt
  await browser.close()
  browser = undefined
  await stopServer(production)

  const result = {
    seed: { projects: 100, assets: 1_000, taskEvents: 1_000 },
    environment: { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? 'unknown', memoryGiB: Math.round(totalmem() / 1024 ** 3) },
    startupMs: Math.round(startupMs * 100) / 100,
    dashboardInteractiveMs: Math.round(dashboardInteractiveMs * 100) / 100,
    readApiP95Ms: Math.round(percentile95(apiSamples) * 100) / 100,
    createProjectP95Ms: Math.round(percentile95(createSamples) * 100) / 100,
    thresholds: { startupMs: 3_000, dashboardInteractiveMs: 2_000, readApiP95Ms: 200, createProjectP95Ms: 300 },
  }
  console.log(JSON.stringify(result, null, 2))
  const failures = Object.entries(result.thresholds).filter(([key, limit]) => result[key] >= limit)
  if (failures.length > 0) throw new Error(`Foundation performance threshold exceeded: ${failures.map(([key]) => key).join(', ')}`)
} finally {
  await browser?.close()
  await rm(temporaryRoot, { recursive: true, force: true })
}
