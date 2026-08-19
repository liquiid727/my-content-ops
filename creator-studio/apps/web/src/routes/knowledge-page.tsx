import type { KnowledgeSource, KnowledgeSourceDetail, ResourceConnection } from '@creator-studio/contracts'
import { BookOpenText, DatabaseZap, ExternalLink, FileSearch, Link2, Loader2, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { connectionApi } from '../modules/connections'
import { getLocalizedErrorMessage, i18n } from '../modules/i18n'
import { knowledgeApi } from '../modules/knowledge'
import { projectApi } from '../modules/projects'
import { Button, EmptyState, Input, Select, Skeleton, useToastStore } from '../shared/ui'
import { RouteHeading } from './route-heading'

export default function KnowledgePage() {
  const [connections, setConnections] = useState<ResourceConnection[]>([])
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([])
  const [results, setResults] = useState<KnowledgeSource[]>([])
  const [selected, setSelected] = useState<KnowledgeSourceDetail>()
  const [query, setQuery] = useState('')
  const [connectionId, setConnectionId] = useState('all')
  const [kind, setKind] = useState('all')
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string>()
  const notify = useToastStore((state) => state.notify)

  const search = async () => {
    setLoading(true); setError(undefined)
    try {
      const response = await knowledgeApi.search({ q: query, ...(connectionId !== 'all' ? { connectionId } : {}), ...(kind !== 'all' ? { kind } : {}) })
      setResults(response.data.results)
    } catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t)) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let active = true
    Promise.all([connectionApi.list(), projectApi.list({ limit: 100 }), knowledgeApi.search()]).then(([connectionResponse, projectResponse, searchResponse]) => {
      if (!active) return
      setConnections(connectionResponse.data.connections)
      setProjects(projectResponse.data.map((project) => ({ id: project.id, title: project.title })))
      setResults(searchResponse.data.results)
    }).catch((caught: unknown) => { if (active) setError(getLocalizedErrorMessage(caught, i18n.t)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const read = async (source: KnowledgeSource) => {
    setReading(true); setError(undefined)
    try { setSelected((await knowledgeApi.read(source.id)).data) }
    catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t)) }
    finally { setReading(false) }
  }

  const bind = async () => {
    if (!selected || !projectId) return
    try {
      await knowledgeApi.bind(projectId, selected.id)
      const next = { ...selected, projectIds: [...new Set([...selected.projectIds, projectId])] }
      setSelected(next)
      setResults((items) => items.map((item) => item.id === next.id ? { ...item, projectIds: next.projectIds } : item))
      notify({ title: '已添加到项目', description: '创作操作可以读取这条实时外部引用。' })
    } catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t)) }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <RouteHeading description="跨 Obsidian、本地文件夹和飞书查找历史资料。原文留在原位置，Agent 通过受控引用实时读取。" eyebrow="工作区 / 外部资料" title="知识库" />
      {error ? <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert"><span>{error}</span><Button onClick={() => void search()}><RefreshCw className="h-4 w-4" />重试</Button></div> : null}
      <form className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_13rem_11rem_auto]" onSubmit={(event) => { event.preventDefault(); void search() }}>
        <Input aria-label="搜索外部资料" onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文、转写或飞书文档…" value={query} />
        <Select aria-label="连接来源" onValueChange={setConnectionId} options={[{ value: 'all', label: '全部连接' }, ...connections.map((connection) => ({ value: connection.id, label: connection.name }))]} value={connectionId} />
        <Select aria-label="资料类型" onValueChange={setKind} options={[{ value: 'all', label: '全部类型' }, { value: 'document', label: '文档' }, { value: 'spreadsheet', label: '表格' }, { value: 'image', label: '图片 OCR' }, { value: 'audio', label: '音频转写' }, { value: 'video', label: '视频转写' }]} value={kind} />
        <Button disabled={loading} type="submit" variant="primary">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}搜索</Button>
      </form>

      <div className="mt-5 grid min-h-[34rem] gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
        <section aria-label="知识搜索结果" className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-semibold">搜索结果</h2><p className="mt-0.5 text-xs text-muted">{results.length} 条可引用资料</p></div><DatabaseZap className="h-4 w-4 text-primary" /></div>
          {loading ? <div className="space-y-px bg-border"><Skeleton className="h-24 rounded-none" /><Skeleton className="h-24 rounded-none" /><Skeleton className="h-24 rounded-none" /></div> : results.length ? (
            <div className="max-h-[42rem] divide-y divide-border overflow-y-auto">{results.map((source) => (
              <Button className={`h-auto min-h-24 w-full justify-start rounded-none px-4 py-4 text-left ${selected?.id === source.id ? 'bg-primary/10' : ''}`} key={source.id} onClick={() => void read(source)} variant="ghost">
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><BookOpenText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate font-semibold text-foreground">{source.title}</span></span><span className="mt-2 line-clamp-2 block text-xs font-normal leading-5 text-muted">{source.excerpt || source.ref}</span><span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{source.connectionType} · {source.kind}{source.projectIds.length ? ` · ${source.projectIds.length} 个项目` : ''}</span></span>
              </Button>
            ))}</div>
          ) : <div className="p-5"><EmptyState description={connections.length ? '先在设置中运行索引，或输入关键词实时搜索飞书。' : '先到设置中添加 Obsidian、文件夹或飞书连接。'} icon={<FileSearch className="h-5 w-5" />} title="没有找到资料" /></div>}
        </section>

        <section aria-label="资料预览" className="rounded-xl border border-border bg-surface">
          {reading ? <div className="space-y-4 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-64" /></div> : selected ? (
            <div className="flex h-full flex-col">
              <header className="border-b border-border px-5 py-4"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold">{selected.title}</h2><p className="mt-1 break-all font-mono text-[11px] text-muted">{selected.ref}</p></div>{selected.sourceUrl ? <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-elevated" href={selected.sourceUrl} rel="noreferrer" target="_blank"><ExternalLink className="h-4 w-4" />打开原文</a> : null}</div><div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-muted"><span>{selected.connectionType}</span><span>{selected.kind}</span><span>{selected.cached ? '15 分钟缓存' : '刚刚实时读取'}</span>{selected.readAt ? <span>读取于 {new Date(selected.readAt).toLocaleString()}</span> : null}</div></header>
              <div className="min-h-0 flex-1 overflow-y-auto p-5"><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground">{selected.text}</pre></div>
              <footer className="border-t border-border p-4"><div className="flex flex-col gap-3 sm:flex-row"><Select aria-label="选择项目" onValueChange={setProjectId} options={projects.map((project) => ({ value: project.id, label: project.title }))} placeholder="选择要引用的项目" {...(projectId ? { value: projectId } : {})} /><Button disabled={!projectId || selected.projectIds.includes(projectId)} onClick={() => void bind()} variant="primary"><Link2 className="h-4 w-4" />{projectId && selected.projectIds.includes(projectId) ? '已添加' : '添加到项目'}</Button></div></footer>
            </div>
          ) : <div className="grid h-full place-items-center p-6"><EmptyState description="读取时会校验来源版本；原文发生变化后会自动刷新派生索引。" icon={<BookOpenText className="h-5 w-5" />} title="选择一条资料查看实时内容" /></div>}
        </section>
      </div>
    </div>
  )
}
