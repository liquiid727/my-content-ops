import type { KnowledgeSource } from '@creator-studio/contracts'
import { BookOpenText, ExternalLink, Link2Off, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { getLocalizedErrorMessage, i18n } from '../i18n'
import { Button, EmptyState, Skeleton, useToastStore } from '../../shared/ui'
import { knowledgeApi } from './knowledge-api'

export function ProjectSourcesPanel({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const notify = useToastStore((state) => state.notify)

  useEffect(() => {
    let active = true
    knowledgeApi.listProject(projectId).then((response) => { if (active) setSources(response.data.sources) })
      .catch((caught: unknown) => { if (active) setError(getLocalizedErrorMessage(caught, i18n.t)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const remove = async (source: KnowledgeSource) => {
    try {
      await knowledgeApi.unbind(projectId, source.id)
      setSources((items) => items.filter((item) => item.id !== source.id))
      notify({ title: '已从项目移除引用', description: '外部原文和知识库索引没有被删除。' })
    } catch (caught) { setError(getLocalizedErrorMessage(caught, i18n.t)) }
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Project Context</p><h2 className="mt-1 font-display text-2xl font-semibold">引用资料</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">这些外部引用会在创作操作运行时实时读取，并记录来源版本与读取时间。</p></div><Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" to="/knowledge"><Plus className="h-4 w-4" />从知识库添加</Link></div>
      {error ? <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      {sources.length ? <div className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{sources.map((source) => (
        <article className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center" key={source.id}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-elevated text-primary"><BookOpenText className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{source.title}</h3><p className="mt-1 truncate font-mono text-[11px] text-muted">{source.connectionType} · {source.ref}</p></div><div className="flex gap-2">{source.sourceUrl ? <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-elevated" href={source.sourceUrl} rel="noreferrer" target="_blank"><ExternalLink className="h-4 w-4" />原文</a> : null}<Button onClick={() => void remove(source)} variant="ghost"><Link2Off className="h-4 w-4" />移除引用</Button></div></article>
      ))}</div> : <div className="mt-5"><EmptyState action={<Link className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" to="/knowledge">打开知识库</Link>} description="添加历史笔记、文件或飞书文档，后续生成内容时即可引用。" icon={<BookOpenText className="h-5 w-5" />} title="这个项目还没有引用资料" /></div>}
    </section>
  )
}
