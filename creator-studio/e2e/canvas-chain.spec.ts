import { expect, test, type Page } from '@playwright/test'

/** 生成一个合法的 26 位 ULID（Idempotency-Key 必需）。 */
function ulid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let timestamp = BigInt(Date.now())
  let value = ''
  for (let i = 0; i < 10; i += 1) {
    value = alphabet[Number(timestamp % 32n)] + value
    timestamp /= 32n
  }
  for (let i = 0; i < 16; i += 1) value += alphabet[Math.floor(Math.random() * 32)]
  return value
}

/** 建一个项目并返回其 id（走真实 server，无 API key 时生成走 Seed fallback）。 */
async function createProject(page: Page): Promise<string> {
  const key = ulid()
  const created = await page.evaluate(async ({ key }) => {
    // 等待本地服务 bootstrap 就绪（SSE 常驻，不能用 networkidle）
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const health = await fetch('/api/v1/health').catch(() => null)
      if (health?.ok) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const response = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ title: `Canvas chain ${Date.now()}`, contentType: 'short_video', brief: '验证 Topic → Outline → Script 全链路' }),
    })
    if (!response.ok) throw new Error(`create project failed ${response.status}: ${await response.text()}`)
    return response.json() as Promise<{ data: { id: string } }>
  }, { key })
  return created.data.id
}

test('Topic → Outline → Script chain runs end-to-end on the Canvas', async ({ page }) => {
  await page.goto('/')
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}/canvas`)
  await expect(page.getByText('开始你的第一个创作节点')).toBeVisible({ timeout: 10_000 })

  // 双击画布打开节点选择器，创建「选题」
  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 220 } })
  await page.getByRole('button', { name: '选题' }).click()

  const nodes = page.locator('[data-testid="canvas-node"]')
  await expect(nodes).toHaveCount(1, { timeout: 10_000 })

  // 选中选题节点 → Inspector 执行「生成大纲」
  await nodes.first().click()
  await page.getByRole('button', { name: '生成大纲' }).click()
  await expect(nodes).toHaveCount(2, { timeout: 15_000 })

  // 大纲节点已出现：适配视图后选中它，执行「生成口播稿」
  // 画布顶栏（role=status）与 React Flow Controls 各有一个适应视图按钮，限定顶栏入口避免 strict mode 歧义
  await page.getByRole('status').getByRole('button', { name: '适应视图' }).click()
  const outlineNode = nodes.filter({ hasText: '大纲' })
  await outlineNode.click()
  await page.getByRole('button', { name: '生成口播稿' }).click()
  await expect(nodes).toHaveCount(3, { timeout: 15_000 })

  // 口播稿节点已出现：三条文本链路全部落库
  // 画布顶栏（role=status）与 React Flow Controls 各有一个适应视图按钮，限定顶栏入口避免 strict mode 歧义
  await page.getByRole('status').getByRole('button', { name: '适应视图' }).click()
  await expect(nodes.filter({ hasText: '口播稿' })).toBeVisible()

  // 服务端确认：graph 含 3 节点 2 边，且三个 artifact role 为 topic/outline/script
  const roles = await page.evaluate(async (pid) => {
    const graphResponse = await fetch(`/api/v1/projects/${pid}/graph`)
    const graph = await graphResponse.json() as { data: { nodes: Array<{ artifactId: string }>; edges: unknown[] } }
    const details = await Promise.all(graph.data.nodes.map(async (node) => {
      const response = await fetch(`/api/v1/artifacts/${node.artifactId}`)
      const body = await response.json() as { data: { role: string } }
      return body.data.role
    }))
    return { roles: details.sort(), edges: graph.data.edges.length }
  }, projectId)
  expect(roles).toEqual({ roles: ['outline', 'script', 'topic'], edges: 2 })
})

test('Script → Cover (image collection) + Voice (audio) media chain', async ({ page }) => {
  await page.goto('/')
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}/canvas`)
  await expect(page.getByText('开始你的第一个创作节点')).toBeVisible({ timeout: 10_000 })

  // 创建「口播稿」脚本节点
  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 220 } })
  await page.getByRole('button', { name: '口播稿' }).click()
  const nodes = page.locator('[data-testid="canvas-node"]')
  await expect(nodes).toHaveCount(1, { timeout: 10_000 })
  await nodes.first().click()
  await expect(page.getByRole('button', { name: '生成封面' })).toBeVisible({ timeout: 10_000 })

  // generate_cover → Image Collection 节点出现，缩略图 lazy 加载（contentRef → assets）
  await page.getByRole('button', { name: '生成封面' }).click()
  await expect(nodes.filter({ hasText: '封面' })).toBeVisible({ timeout: 15_000 })
  // 画布顶栏（role=status）与 React Flow Controls 各有一个适应视图按钮，限定顶栏入口避免 strict mode 歧义
  await page.getByRole('status').getByRole('button', { name: '适应视图' }).click()
  const coverImage = nodes.filter({ hasText: '封面' }).locator('img[src*="/api/v1/assets/"]').first()
  await expect(coverImage).toBeVisible({ timeout: 10_000 })

  // generate_voice → Audio 节点出现，可点击播放（lazy mount）
  await nodes.filter({ hasText: '口播稿' }).click()
  await page.getByRole('button', { name: '生成配音' }).click()
  await expect(nodes.filter({ hasText: '配音' })).toBeVisible({ timeout: 15_000 })
  // 画布顶栏（role=status）与 React Flow Controls 各有一个适应视图按钮，限定顶栏入口避免 strict mode 歧义
  await page.getByRole('status').getByRole('button', { name: '适应视图' }).click()
  const voiceNode = nodes.filter({ hasText: '配音' })
  await expect(voiceNode.getByRole('button', { name: '播放配音' })).toBeVisible({ timeout: 10_000 })
  await voiceNode.getByRole('button', { name: '播放配音' }).click()
  await expect(voiceNode.locator('audio')).toBeVisible()

  // 服务端确认：media assets 落库且类型正确
  const media = await page.evaluate(async (pid) => {
    const graphResponse = await fetch(`/api/v1/projects/${pid}/graph`)
    const graph = await graphResponse.json() as { data: { nodes: Array<{ artifactId: string }> } }
    const kinds = await Promise.all(graph.data.nodes.map(async (node) => {
      const response = await fetch(`/api/v1/artifacts/${node.artifactId}`)
      const body = await response.json() as { data: { kind: string; role: string } }
      return `${body.data.kind}:${body.data.role}`
    }))
    return kinds.sort()
  }, projectId)
  expect(media).toEqual(['audio:voice', 'collection:cover', 'text:script'])
})

test('Script → Video chain produces a Video node with a draft asset (MVP skeleton)', async ({ page }) => {
  await page.goto('/')
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}/canvas`)
  await expect(page.getByText('开始你的第一个创作节点')).toBeVisible({ timeout: 10_000 })

  // 创建「口播稿」脚本节点 → Inspector 执行「生成视频」
  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 220 } })
  await page.getByRole('button', { name: '口播稿' }).click()
  const nodes = page.locator('[data-testid="canvas-node"]')
  await expect(nodes).toHaveCount(1, { timeout: 10_000 })
  await nodes.first().click()
  await expect(page.getByRole('button', { name: '生成视频' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(nodes.filter({ hasText: 'draft' })).toBeVisible({ timeout: 15_000 })

  // 服务端确认：video:draft artifact 落库且携带 MP4 asset
  const video = await page.evaluate(async (pid) => {
    const graphResponse = await fetch(`/api/v1/projects/${pid}/graph`)
    const graph = await graphResponse.json() as { data: { nodes: Array<{ artifactId: string }> } }
    const details = await Promise.all(graph.data.nodes.map(async (node) => {
      const response = await fetch(`/api/v1/artifacts/${node.artifactId}`)
      const body = await response.json() as { data: { kind: string; role: string } }
      return `${body.data.kind}:${body.data.role}`
    }))
    return details.sort()
  }, projectId)
  expect(video).toEqual(['text:script', 'video:draft'])
})

test('Hover "+" on a node opens the anchored generate-next menu', async ({ page }) => {
  await page.goto('/')
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}/canvas`)
  await expect(page.getByText('开始你的第一个创作节点')).toBeVisible({ timeout: 10_000 })

  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 220 } })
  await page.getByRole('button', { name: '选题' }).click()
  const nodes = page.locator('[data-testid="canvas-node"]')
  await expect(nodes).toHaveCount(1, { timeout: 10_000 })

  // 悬停节点 → 右缘出现「+」→ 锚定小菜单 → 点「生成大纲」
  await nodes.first().hover()
  await page.getByTestId('generate-next-entry').click()
  const menu = page.getByTestId('generate-next-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: '生成大纲' }).click()
  await expect(nodes).toHaveCount(2, { timeout: 15_000 })
})

test('Multi-select topic + image → generate cover: loading placeholder wired from every source', async ({ page }) => {
  await page.goto('/')
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}/canvas`)
  await expect(page.getByText('开始你的第一个创作节点')).toBeVisible({ timeout: 10_000 })

  // 创建「选题」与「配图」两个节点
  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 160 } })
  await page.getByRole('button', { name: '选题' }).click()
  const nodes = page.locator('[data-testid="canvas-node"]')
  await expect(nodes).toHaveCount(1, { timeout: 10_000 })
  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 360 } })
  await page.getByRole('button', { name: '配图' }).click()
  await expect(nodes).toHaveCount(2, { timeout: 10_000 })

  // ⌘点多选两个节点 → 底部浮动条「生成」→ 菜单选「生成封面」
  await nodes.nth(0).click()
  await nodes.nth(1).click({ modifiers: ['Meta'] })
  const bar = page.getByTestId('multi-generate-bar')
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: '生成' }).click()
  const menu = page.getByTestId('generate-next-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: '生成封面' }).click()

  // 占位 collection 节点立即出现（loading 态，SSE 刷图后）
  await expect(nodes).toHaveCount(3, { timeout: 15_000 })

  // 服务端确认：run 完成后仍是 3 节点、两条源边都指向 cover artifact、候选填充
  const result = await page.evaluate(async (pid) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const runsResponse = await fetch(`/api/v1/runs?projectId=${pid}`)
      const runs = (await runsResponse.json() as { data: Array<{ operationId: string; status: string }> }).data
        .filter((run) => run.operationId === 'generate_cover')
      if (runs.length > 0 && runs.every((run) => run.status === 'completed' || run.status === 'failed')) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const graphResponse = await fetch(`/api/v1/projects/${pid}/graph`)
    const graph = await graphResponse.json() as {
      data: {
        nodes: Array<{ artifactId: string }>
        edges: Array<{ sourceArtifactId: string; targetArtifactId: string; inputSlot: string }>
      }
    }
    const details = await Promise.all(graph.data.nodes.map(async (node) => {
      const response = await fetch(`/api/v1/artifacts/${node.artifactId}`)
      return response.json() as Promise<{ data: { kind: string; role: string } }>
    }))
    const cover = details.find((detail) => detail.data.role === 'cover')
    const itemsResponse = cover ? await fetch(`/api/v1/artifacts/${graph.data.nodes[details.indexOf(cover)].artifactId}/collection-items`) : null
    const items = itemsResponse ? await itemsResponse.json() as { data: { items: unknown[] } } : null
    return {
      nodeKinds: details.map((detail) => detail.data.kind).sort(),
      edges: graph.data.edges,
      candidateCount: items?.data.items.length ?? 0,
    }
  }, projectId)
  expect(result.nodeKinds).toEqual(['collection', 'image', 'text'])
  expect(result.edges).toHaveLength(2)
  expect(result.edges.every((edge) => edge.inputSlot === 'cover')).toBe(true)
  expect(new Set(result.edges.map((edge) => edge.targetArtifactId)).size).toBe(1)
  expect(result.candidateCount).toBeGreaterThan(0)
})

test('Publish skeleton: header entry → dialog → publish run side effect', async ({ page }) => {
  await page.goto('/')
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}/canvas`)
  await expect(page.getByText('开始你的第一个创作节点')).toBeVisible({ timeout: 10_000 })

  // 创建「口播稿」脚本节点作为可发布目标
  await page.locator('.react-flow__pane').dblclick({ position: { x: 320, y: 220 } })
  await page.getByRole('button', { name: '口播稿' }).click()
  const nodes = page.locator('[data-testid="canvas-node"]')
  await expect(nodes).toHaveCount(1, { timeout: 10_000 })

  // 右上角 Header Publish 入口（aria-label 发布，区别于 Inspector 的发布操作）→ 对话框显示可发布目标
  await page.getByLabel('发布').click()
  await expect(page.getByRole('heading', { name: '发布内容' })).toBeVisible()
  await expect(page.getByTestId('publish-target')).toContainText('口播稿')

  // 执行骨架发布 → 对话框进入运行态并完成
  await page.getByRole('dialog').getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('发布完成')).toBeVisible({ timeout: 15_000 })

  // 服务端确认：publish Run 按 action behavior 执行，不产出内容 Artifact
  const publishRuns = await page.evaluate(async (pid) => {
    const response = await fetch(`/api/v1/runs?projectId=${pid}`)
    const body = await response.json() as { data: Array<{ operationId: string; status: string; outputArtifactIds: string[] | null }> }
    return body.data.filter((run) => run.operationId === 'publish').map((run) => ({ status: run.status, outputArtifactIds: run.outputArtifactIds }))
  }, projectId)
  expect(publishRuns.length).toBeGreaterThan(0)
  expect(publishRuns.every((run) => run.status === 'completed')).toBe(true)
  expect(publishRuns.every((run) => run.outputArtifactIds === null || run.outputArtifactIds.length === 0)).toBe(true)
})
