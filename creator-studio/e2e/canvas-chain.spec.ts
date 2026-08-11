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
  await page.getByRole('button', { name: '适应视图' }).click()
  const outlineNode = nodes.filter({ hasText: 'outline' })
  await outlineNode.click()
  await page.getByRole('button', { name: '生成口播稿' }).click()
  await expect(nodes).toHaveCount(3, { timeout: 15_000 })

  // 口播稿节点已出现：三条文本链路全部落库
  await page.getByRole('button', { name: '适应视图' }).click()
  await expect(nodes.filter({ hasText: 'script' })).toBeVisible()

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
