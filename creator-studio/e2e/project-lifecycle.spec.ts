import { expect, test, type Page } from '@playwright/test'

async function selectRadixOption(page: Page, triggerLabel: string, optionName: string): Promise<void> {
  await page.getByLabel(triggerLabel).click()
  await page.getByRole('option', { name: optionName }).click()
}

test('creates, edits, and archives a Project through its Overview', async ({ page }) => {
  const title = `E2E Project ${Date.now()}`
  const updatedTitle = `${title} updated`

  await page.goto('/projects')
  await page.getByRole('button', { name: '新建项目' }).click()
  await page.getByLabel('项目标题').fill(title)
  await selectRadixOption(page, '内容类型', '短视频')
  await page.getByLabel('项目说明').fill('验证 Project 生命周期的本地端到端流程。')
  await page.getByRole('button', { name: '创建项目' }).click()

  await expect(page).toHaveURL(/\/projects\/[0-9A-HJKMNP-TV-Z]{26}\/overview$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('没有活动任务')).toBeVisible()
  await expect(page.getByText('还没有素材')).toBeVisible()

  await page.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('项目标题').fill(updatedTitle)
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible()
  await expect(page.getByText('版本 2')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '归档' }).click()
  await expect(page).toHaveURL('/projects')
  await expect(page.getByText(updatedTitle)).toHaveCount(0)

  await page.getByLabel('按状态筛选项目').click()
  await page.getByRole('option', { name: '已归档' }).click()
  await expect(page.getByText(updatedTitle)).toBeVisible()
  await page.getByText(updatedTitle).click()
  await expect(page.getByText('已归档').first()).toBeVisible()
})

test('Asset list presents loading, error, empty, and success states', async ({ page }) => {
  const requestId = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
  let mode: 'error' | 'empty' | 'success' = 'error'
  let releaseInitialRequest!: () => void
  const initialRequestGate = new Promise<void>((resolve) => { releaseInitialRequest = resolve })
  await page.route('**/api/v1/assets*', async (route) => {
    if (mode === 'error') {
      await initialRequestGate
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '素材列表暂时不可用。', retryable: false }, meta: { requestId } }) })
      return
    }
    const data = mode === 'success' ? [{
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAC', projectId: null, type: 'image', name: 'reference.png',
      mimeType: 'image/png', size: 68, width: 1, height: 1, durationMs: null,
      contentUrl: '/api/v1/assets/01ARZ3NDEKTSV4RRFFQ69G5FAC/content', thumbnailUrl: null,
      createdAt: '2026-08-09T09:00:00.000Z',
    }] : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId, hasMore: false } }) })
  })

  await page.goto('/assets')
  await expect(page.getByRole('status', { name: '正在加载素材' })).toBeVisible()
  releaseInitialRequest()
  await expect(page.getByRole('alert')).toContainText('素材请求失败。')

  mode = 'empty'
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByRole('heading', { name: '还没有素材' })).toBeVisible()

  mode = 'success'
  await selectRadixOption(page, '按素材类型筛选', '图片')
  await expect(page.getByRole('heading', { name: 'reference.png' })).toBeVisible()
  await expect(page.getByRole('link', { name: '读取文件' })).toHaveAttribute('href', /\/api\/v1\/assets\/.+\/content/)
})

test('Settings keeps Provider and Connector credentials server-side', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Provider' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lark CLI' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Obsidian' })).toBeVisible()
  await expect(page.getByText('仅提供确定性 stub')).toHaveCount(2)

  const credential = page.getByLabel('Provider 凭据')
  await credential.fill('e2e-secret-that-must-disappear')
  await page.getByRole('button', { name: '保存' }).first().click()
  await expect(page.getByText('设置已保存，凭据不会再次显示。')).toBeVisible()
  await expect(credential).toHaveValue('')
  await expect(page.getByText('Seed Provider · 已有凭据')).toBeVisible()
  await page.getByRole('button', { name: '测试连接' }).first().click()
  await expect(page.getByText(/基础阶段确定性 stub 连接成功/)).toBeVisible()
})

test('Tasks restores its REST snapshot before continuing with live events', async ({ page }) => {
  await page.goto('/tasks')
  await expect(page.getByRole('heading', { name: '还没有任务' })).toBeVisible()
  const created = await page.evaluate(async () => {
    const response = await fetch('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'seed_generation', input: { prompt: 'E2E task recovery snapshot' } }),
    })
    return response.json() as Promise<{ data: { id: string } }>
  })
  await expect(page.getByText('seed_generation')).toBeVisible()
  await page.reload()
  await expect(page.getByText('seed_generation')).toBeVisible()
  await expect(page.getByText(/已完成|运行中|排队中/)).toBeVisible()
  expect(created.data.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
})

test('Theme applies immediately and persists to CreatorProfile', async ({ page }) => {
  await page.goto('/')
  await selectRadixOption(page, '主题', '浅色')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('/api/v1/bootstrap')
    const body = await response.json() as { data: { creatorProfile: { preferences: { theme: string } } } }
    return body.data.creatorProfile.preferences.theme
  })).toBe('light')
  await page.reload()
  await expect(page.getByLabel('主题')).toHaveText('浅色')
})

test('Assets uploads a validated local file and shows the result', async ({ page }) => {
  await page.goto('/assets')
  await page.getByLabel('选择要上传的素材').setInputFiles({
    name: `foundation-${Date.now()}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.getByRole('heading', { name: /foundation-.*\.png/ })).toBeVisible()
  await expect(page.getByText('图片', { exact: true }).last()).toBeVisible()
})

test('Language switches the complete shell and persists to CreatorProfile', async ({ page }) => {
  await page.goto('/')
  await selectRadixOption(page, '语言', 'English')
  await expect(page.getByRole('heading', { name: 'Your studio, clearly routed.' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('/api/v1/bootstrap')
    const body = await response.json() as { data: { creatorProfile: { preferences: { locale: string } } } }
    return body.data.creatorProfile.preferences.locale
  })).toBe('en-US')
  await page.reload()
  await expect(page.getByLabel('Language')).toHaveText('English')
  await selectRadixOption(page, 'Language', '中文')
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('/api/v1/bootstrap')
    const body = await response.json() as { data: { creatorProfile: { preferences: { locale: string } } } }
    return body.data.creatorProfile.preferences.locale
  })).toBe('zh-CN')
})

test('Tasks exposes cancellation progress and its stable terminal result', async ({ page }) => {
  const requestId = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
  const taskId = '01ARZ3NDEKTSV4RRFFQ69G5FAZ'
  let cancelled = false
  const task = () => ({
    id: taskId, projectId: null, type: 'seed_generation', status: cancelled ? 'cancelled' : 'running', progress: 40,
    resultRef: null, parentTaskId: null, retryCount: 0, error: null, output: null,
    createdAt: '2026-08-09T09:00:00.000Z', startedAt: '2026-08-09T09:00:01.000Z', finishedAt: cancelled ? '2026-08-09T09:00:02.000Z' : null,
  })
  await page.route('**/api/v1/task-events', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': heartbeat\n\n' }))
  await page.route('**/api/v1/tasks**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith(`/${taskId}/cancel`)) { cancelled = true; await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: task(), meta: { requestId } }) }); return }
    if (url.pathname.endsWith(`/${taskId}`)) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: task(), meta: { requestId } }) }); return }
    const data = url.searchParams.get('active') === 'true' && cancelled ? [] : [task()]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId, hasMore: false } }) })
  })
  await page.goto('/tasks')
  await expect(page.getByText('运行中')).toBeVisible()
  await page.getByRole('button', { name: '取消任务' }).click()
  await expect(page.getByText('已取消')).toBeVisible()
  await expect(page.getByRole('button', { name: '取消任务' })).toHaveCount(0)
})

test('Tasks reconnects SSE with Last-Event-ID and applies the missed terminal event', async ({ page }) => {
  const requestId = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
  const taskId = '01ARZ3NDEKTSV4RRFFQ69G5FB0'
  let status: 'queued' | 'running' | 'completed' = 'queued'
  let streamRequests = 0
  let detailRequests = 0
  let replayCursor: string | undefined
  const task = () => ({
    id: taskId, projectId: null, type: 'seed_generation', status, progress: status === 'queued' ? 0 : status === 'running' ? 45 : 100,
    resultRef: status === 'completed' ? { type: 'generation', id: '01ARZ3NDEKTSV4RRFFQ69G5FB1' } : null,
    parentTaskId: null, retryCount: 0, error: null, output: status === 'completed' ? { text: 'replayed' } : null,
    createdAt: '2026-08-09T09:00:00.000Z', startedAt: status === 'queued' ? null : '2026-08-09T09:00:01.000Z', finishedAt: status === 'completed' ? '2026-08-09T09:00:02.000Z' : null,
  })
  const event = (id: number, type: string, eventStatus: 'running' | 'completed') => `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ taskId, projectId: null, status: eventStatus, progress: eventStatus === 'running' ? 45 : 100, occurredAt: '2026-08-09T09:00:02.000Z' })}\n\n`

  await page.route('**/api/v1/task-events', async (route) => {
    streamRequests += 1
    if (streamRequests === 1) {
      status = 'running'
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: event(17, 'task.updated', 'running') })
      return
    }
    replayCursor = route.request().headers()['last-event-id']
    status = 'completed'
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${event(17, 'task.updated', 'running')}${event(18, 'task.completed', 'completed')}` })
  })
  await page.route('**/api/v1/tasks**', async (route) => {
    const url = new URL(route.request().url())
    const isDetail = url.pathname.endsWith(`/${taskId}`)
    if (isDetail) detailRequests += 1
    const data = isDetail ? task() : [task()]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId, ...(Array.isArray(data) ? { hasMore: false } : {}) } }) })
  })

  await page.goto('/tasks')
  await expect(page.getByText('已完成')).toBeVisible()
  expect(replayCursor).toBe('17')
  expect(detailRequests).toBe(2)
})

test('Foundation surfaces do not overflow at 360, 768, or 1280 pixels', async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/projects', '/assets', '/tasks', '/settings']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    }
  }
})
