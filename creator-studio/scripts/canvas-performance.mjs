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
if (!existsSync(entry)) throw new Error('Production server is not built. Run npm run build first.')

const SIZES = (process.env.CANVAS_BENCHMARK_SIZES ?? '100,300,500,1000').split(',').map(Number).filter(Boolean)

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

function seedCanvasProject(sqlite, workspaceId, profileId, nodeCount) {
  const now = Date.now()
  const projectId = ulid(now)
  const insertProject = sqlite.prepare(
    'INSERT INTO projects (id, workspace_id, title, brief, status, content_type, settings_json, created_by, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
  )
  const insertArtifact = sqlite.prepare(
    'INSERT INTO artifacts (id, workspace_id, project_id, kind, role, current_version_id, created_by, revision, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, NULL)',
  )
  const insertVersion = sqlite.prepare(
    'INSERT INTO artifact_versions (id, artifact_id, version_number, parent_version_id, content_ref_type, content_ref_id, inline_text, metadata_json, source, operation_run_id, created_by, created_at) VALUES (?, ?, 1, NULL, ?, NULL, ?, \'{}\', \'system\', NULL, ?, ?)',
  )
  const setCurrentVersion = sqlite.prepare('UPDATE artifacts SET current_version_id = ? WHERE id = ?')
  const insertNode = sqlite.prepare(
    'INSERT INTO canvas_nodes (id, project_id, artifact_id, x, y, width, height, collapsed, z_index, renderer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?, ?, ?)',
  )
  const insertEdge = sqlite.prepare(
    'INSERT INTO edges (id, project_id, source_artifact_id, target_artifact_id, input_slot, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )

  insertProject.run(projectId, workspaceId, `Canvas Benchmark ${nodeCount}`, `seed ${nodeCount} nodes`, 'draft', 'short_video', '{}', profileId, now, now)

  const columns = Math.ceil(Math.sqrt(nodeCount * 1.6))
  const gapX = 320
  const gapY = 220
  const ids = []
  const insertAll = sqlite.transaction(() => {
    for (let index = 0; index < nodeCount; index += 1) {
      const artifactId = ulid(now + index * 2)
      const versionId = ulid(now + index * 2 + 1)
      ids.push({ artifactId, versionId })
      // artifact → version 互相引用：先建 artifact（current_version_id=NULL），再建 version，再回填。
      insertArtifact.run(artifactId, workspaceId, projectId, 'text', 'topic', profileId, now + index, now + index)
      insertVersion.run(versionId, artifactId, 'inline', `benchmark node ${index} 内容片段，用于渲染压力测试。`, profileId, now + index)
      setCurrentVersion.run(versionId, artifactId)
      insertNode.run(ulid(now + 100_000 + index), projectId, artifactId, (index % columns) * gapX, Math.floor(index / columns) * gapY, 'TextNode', now + index, now + index)
    }
    for (let index = 1; index < nodeCount; index += 1) {
      insertEdge.run(ulid(now + 200_000 + index), projectId, ids[index - 1].artifactId, ids[index].artifactId, 'topic', now + index)
    }
  })
  insertAll()
  return projectId
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'creator-studio-canvas-bench-'))
let browser
try {
  const dataDirectory = join(temporaryRoot, 'data')
  const initializationPort = await availablePort()
  const initializationBase = `http://127.0.0.1:${initializationPort}`
  const initialization = startServer(initializationPort, dataDirectory)
  await healthReady(initializationBase)
  await stopServer(initialization)

  const database = new Database(join(dataDirectory, 'creator-studio.sqlite'))
  let workspace
  let profile
  try {
    workspace = database.prepare('SELECT id FROM workspaces LIMIT 1').get()
    profile = database.prepare('SELECT id FROM creator_profiles LIMIT 1').get()
    if (!workspace || !profile) throw new Error('Default identity was not initialized')
  } finally { database.close() }

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const production = startServer(port, dataDirectory)
  await healthReady(baseUrl)
  const bootstrap = await fetch(`${baseUrl}/api/v1/bootstrap`)
  if (!bootstrap.ok) throw new Error(`Bootstrap failed: ${await bootstrap.text()}`)

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const results = []
  for (const size of SIZES) {
    const db = new Database(join(dataDirectory, 'creator-studio.sqlite'))
    let projectId
    try { projectId = seedCanvasProject(db, workspace.id, profile.id, size) } finally { db.close() }

    const nodes = page.locator('[data-testid="canvas-node"]')
    const interactiveStartedAt = performance.now()
    await page.goto(`${baseUrl}/projects/${encodeURIComponent(projectId)}/canvas`)
    await expectInteractive(nodes)
    const canvasInteractiveMs = performance.now() - interactiveStartedAt

    // 交互：拖拽（平移或拖节点）+ 滚轮缩放（进入高 LOD 时验证 culling/LOD 不卡顿）。
    const pane = page.locator('.react-flow__pane')
    await pane.hover()
    const dragStartedAt = performance.now()
    await page.mouse.down()
    await page.mouse.move(620, 420, { steps: 8 })
    await page.mouse.move(900, 620, { steps: 8 })
    await page.mouse.up()
    const dragMs = performance.now() - dragStartedAt

    const zoomStartedAt = performance.now()
    await page.mouse.wheel(0, -600)
    await page.mouse.wheel(0, -600)
    const zoomMs = performance.now() - zoomStartedAt

    results.push({ size, canvasInteractiveMs: Math.round(canvasInteractiveMs * 100) / 100, dragMs: Math.round(dragMs * 100) / 100, zoomMs: Math.round(zoomMs * 100) / 100 })
  }
  await browser.close()
  browser = undefined
  await stopServer(production)

  const thresholds = {
    100: { canvasInteractiveMs: 1_500 },
    300: { dragMs: 3_000, zoomMs: 3_000 },
    500: { dragMs: 4_000, zoomMs: 4_000 },
    1000: { dragMs: 8_000, zoomMs: 8_000 },
  }

  const summary = {
    sizes: results,
    thresholds,
    environment: { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? 'unknown', memoryGiB: Math.round(totalmem() / 1024 ** 3) },
  }
  console.log(JSON.stringify(summary, null, 2))

  const failures = []
  for (const result of results) {
    const limits = thresholds[result.size] ?? {}
    for (const [metric, limit] of Object.entries(limits)) {
      if (result[metric] >= limit) failures.push(`${result.size} nodes:${metric}=${result[metric]}ms >= ${limit}ms`)
    }
  }
  if (failures.length > 0) throw new Error(`Canvas performance threshold exceeded: ${failures.join(', ')}`)
} finally {
  await browser?.close()
  await rm(temporaryRoot, { recursive: true, force: true })
}

/**
 * 等待画布进入可交互态：节点数稳定 400ms 视为首屏已绘制。
 * `onlyRenderVisibleElements` 会剔除视口外节点，因此不能等「全部 N 个」。
 */
async function expectInteractive(locator) {
  let last = -1
  let stableAt = 0
  const startedAt = performance.now()
  while (performance.now() - startedAt < 30_000) {
    const count = await locator.count()
    if (count !== last) {
      last = count
      stableAt = performance.now()
    } else if (count > 0 && performance.now() - stableAt > 400) {
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  throw new Error(`Canvas did not become interactive within 30s (nodes: ${await locator.count()})`)
}
