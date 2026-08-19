import type { ConnectionType, ResourceConnection } from '@creator-studio/contracts'
import { CheckCircle2, FolderOpen, Loader2, PlugZap, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getLocalizedErrorMessage, i18n } from '../i18n'
import { Button, EmptyState, Input, Select, Skeleton, useToastStore } from '../../shared/ui'
import { connectionApi } from './connection-api'

const typeLabels: Record<ConnectionType, string> = { obsidian: 'Obsidian Vault', folder: '本地文件夹', lark: '飞书 / Lark' }
const statusLabels: Record<ResourceConnection['status'], string> = { not_configured: '待配置', installing: '安装中', auth_required: '待认证', ready: '已就绪', error: '异常' }

export function ConnectionsPanel() {
  const [connections, setConnections] = useState<ResourceConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string>()
  const [error, setError] = useState<string>()
  const [type, setType] = useState<ConnectionType>('obsidian')
  const [name, setName] = useState('我的 Obsidian')
  const [root, setRoot] = useState('')
  const notify = useToastStore((state) => state.notify)

  const reload = async () => {
    const response = await connectionApi.list()
    setConnections(response.data.connections)
  }

  useEffect(() => {
    let active = true
    connectionApi.list().then((response) => { if (active) setConnections(response.data.connections) })
      .catch((caught: unknown) => { if (active) setError(getLocalizedErrorMessage(caught, i18n.t, 'settings.loadFailed')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setWorking(key); setError(undefined)
    try { await action(); await reload(); notify({ title: success }) }
    catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t, 'settings.saveFailed')) }
    finally { setWorking(undefined) }
  }

  const chooseDirectory = async () => {
    setWorking('picker'); setError(undefined)
    try { setRoot((await connectionApi.pickDirectory()).data.path) }
    catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t, 'settings.saveFailed')) }
    finally { setWorking(undefined) }
  }

  const create = async () => {
    await run('create', async () => {
      const created = await connectionApi.create({ type, name, config: type === 'lark' ? {} : { root }, enabled: true })
      if (type !== 'lark') await connectionApi.index(created.data.id)
      setName(''); setRoot('')
    }, type === 'lark' ? '飞书连接已创建，请继续安装 CLI。' : '连接已创建，后台索引任务已启动。')
  }

  const authenticate = async (connection: ResourceConnection) => {
    setWorking(`auth:${connection.id}`); setError(undefined)
    try {
      const response = await connectionApi.authenticate(connection.id)
      if (response.data.authorizationUrl) window.open(response.data.authorizationUrl, '_blank', 'noopener,noreferrer')
      await reload()
      notify({ title: response.data.phase === 'app_setup' ? '已打开飞书应用配置页；完成后请再次点击继续配置。' : '已打开飞书用户授权页，完成后状态会自动更新。' })
    } catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t, 'settings.saveFailed')) }
    finally { setWorking(undefined) }
  }

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

  return (
    <div className="max-h-[72vh] overflow-y-auto px-6 py-6">
      {error ? <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="space-y-3">
        {connections.length ? connections.map((connection) => (
          <article className="rounded-xl border border-border bg-elevated/45 p-4" key={connection.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><PlugZap aria-hidden="true" className="h-4 w-4 text-primary" /><h3 className="font-semibold">{connection.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${connection.status === 'ready' ? 'bg-success/15 text-success' : connection.status === 'error' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}>{statusLabels[connection.status]}</span></div>
                <p className="mt-1 truncate text-xs text-muted">{typeLabels[connection.type]}{typeof connection.config.root === 'string' ? ` · ${connection.config.root}` : ''}</p>
                {connection.lastError ? <p className="mt-2 text-xs text-danger">{connection.lastError}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {connection.type === 'lark' && (connection.status === 'not_configured' || (connection.status === 'error' && typeof connection.config.managedVersion !== 'string')) ? <Button disabled={Boolean(working)} onClick={() => void run(`install:${connection.id}`, () => connectionApi.install(connection.id), '飞书 CLI 正在后台安装。')}><ShieldCheck className="h-4 w-4" />安装 CLI</Button> : null}
                {connection.type === 'lark' && (connection.status === 'auth_required' || (connection.status === 'error' && typeof connection.config.managedVersion === 'string')) ? <Button disabled={Boolean(working)} onClick={() => void authenticate(connection)} variant="primary"><ShieldCheck className="h-4 w-4" />继续配置</Button> : null}
                <Button aria-label={`测试 ${connection.name}`} disabled={Boolean(working)} onClick={() => void run(`test:${connection.id}`, () => connectionApi.test(connection.id), '连接检查通过。')}><CheckCircle2 className="h-4 w-4" />测试</Button>
                <Button aria-label={`索引 ${connection.name}`} disabled={Boolean(working) || connection.status !== 'ready'} onClick={() => void run(`index:${connection.id}`, () => connectionApi.index(connection.id), '后台索引任务已启动。')}><Search className="h-4 w-4" />索引</Button>
                <Button aria-label={`删除 ${connection.name}`} disabled={Boolean(working)} onClick={() => { if (window.confirm('断开后会删除本地派生索引和缓存，但不会删除原始资料。')) void run(`delete:${connection.id}`, () => connectionApi.remove(connection.id), '连接已断开。') }} variant="ghost"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </article>
        )) : <EmptyState description="添加 Obsidian、普通文件夹或飞书，之后即可在知识库中统一搜索。" icon={<FolderOpen className="h-5 w-5" />} title="还没有外部资料连接" />}
      </div>

      <section className="mt-6 border-t border-border pt-6">
        <h3 className="font-display text-lg font-semibold">添加连接</h3>
        <p className="mt-1 text-xs leading-5 text-muted">原始资料留在原位置；Creator Studio 只保存引用和可重建的本地索引。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Select aria-label="连接类型" onValueChange={(value) => { const next = value as ConnectionType; setType(next); setName(next === 'obsidian' ? '我的 Obsidian' : next === 'folder' ? '资料文件夹' : '我的飞书') }} options={[{ value: 'obsidian', label: 'Obsidian Vault' }, { value: 'folder', label: '本地文件夹' }, { value: 'lark', label: '飞书 / Lark' }]} value={type} />
          <Input aria-label="连接名称" onChange={(event) => setName(event.target.value)} placeholder="连接名称" value={name} />
        </div>
        {type !== 'lark' ? <div className="mt-3 flex gap-2"><Input aria-label="资料目录" className="flex-1" onChange={(event) => setRoot(event.target.value)} placeholder="选择本机目录" value={root} /><Button disabled={Boolean(working)} onClick={() => void chooseDirectory()}><FolderOpen className="h-4 w-4" />选择目录</Button></div> : <p className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs text-muted">创建后由应用把固定版本 CLI 安装到 Creator Studio 数据目录，再通过浏览器完成官方 OAuth 授权。</p>}
        <div className="mt-4 flex justify-end"><Button disabled={Boolean(working) || !name.trim() || (type !== 'lark' && !root)} onClick={() => void create()} variant="primary">{working === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}添加连接</Button></div>
      </section>
      <Button className="mt-4" onClick={() => void run('reload', reload, '连接状态已刷新。')} variant="ghost"><RefreshCw className="h-4 w-4" />刷新状态</Button>
    </div>
  )
}
