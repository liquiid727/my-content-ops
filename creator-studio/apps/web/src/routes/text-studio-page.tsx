import { artifactDetailResponseSchema } from '@creator-studio/contracts'
import { ArrowLeft, Check, Columns2, Eye, FileText, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiRequest, ApiClientError } from '../shared/api'
import { Button, Skeleton, Textarea } from '../shared/ui'

function MarkdownPreview({ source }: { source: string }) {
  const lines = source.split('\n')
  return <article className="prose-invert max-w-none space-y-3 text-sm leading-7 text-foreground">{lines.map((line, index) => {
    if (line.startsWith('### ')) return <h3 className="font-display text-xl font-semibold" key={index}>{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 className="font-display text-2xl font-semibold" key={index}>{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 className="font-display text-3xl font-semibold" key={index}>{line.slice(2)}</h1>
    if (line.startsWith('- ')) return <p className="pl-4 before:mr-3 before:text-primary before:content-['•']" key={index}>{line.slice(2)}</p>
    if (line.startsWith('> ')) return <blockquote className="border-l-2 border-primary pl-4 text-muted" key={index}>{line.slice(2)}</blockquote>
    return line ? <p className="whitespace-pre-wrap" key={index}>{line}</p> : <div className="h-2" key={index} />
  })}</article>
}

export default function TextStudioPage() {
  const { projectId = '', artifactId = '' } = useParams()
  const [text, setText] = useState('')
  const [revision, setRevision] = useState(1)
  const [status, setStatus] = useState<'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'>('loading')
  const [role, setRole] = useState('text')
  const loaded = useRef(false)

  useEffect(() => {
    let active = true
    apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, artifactDetailResponseSchema).then((response) => {
      if (!active) return
      const ref = response.data.currentVersion?.contentRef
      setText(ref?.type === 'inline' ? ref.text : '')
      setRevision(response.data.revision)
      setRole(response.data.role)
      setStatus('saved')
      loaded.current = true
    }).catch(() => active && setStatus('error'))
    return () => { active = false }
  }, [artifactId])

  const save = useCallback(async () => {
    if (!loaded.current || status === 'saving' || status === 'saved') return
    setStatus('saving')
    try {
      const response = await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, artifactDetailResponseSchema, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, patch: { text, metadata: { format: 'markdown' } } }) })
      setRevision(response.data.revision); setStatus('saved')
    } catch (error) { setStatus(error instanceof ApiClientError && error.code === 'REVISION_CONFLICT' ? 'conflict' : 'error') }
  }, [artifactId, revision, status, text])

  useEffect(() => { if (status !== 'dirty') return; const timer = window.setTimeout(() => void save(), 900); return () => window.clearTimeout(timer) }, [save, status])

  if (status === 'loading') return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-[60vh]" /></div>
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="text-studio">
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <Link className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-foreground" to={`/projects/${projectId}/canvas`}><ArrowLeft className="h-4 w-4" /><span className="sr-only">返回画布</span></Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><h1 className="truncate font-display text-xl font-semibold">{role}</h1><p className="text-xs text-muted">Markdown · revision {revision}</p></div>
        <span className={`hidden items-center gap-1.5 text-xs sm:flex ${status === 'conflict' || status === 'error' ? 'text-danger' : 'text-muted'}`}>{status === 'saved' ? <Check className="h-3.5 w-3.5 text-success" /> : null}{status === 'saving' ? '正在保存…' : status === 'saved' ? '已保存' : status === 'conflict' ? '版本冲突，请返回画布重新打开' : status === 'error' ? '保存失败' : '有未保存修改'}</span>
        <Button className="min-h-9 px-3" disabled={status === 'saved' || status === 'saving' || status === 'conflict'} onClick={() => void save()}><Save className="h-4 w-4" />保存</Button>
      </header>
      <div className="mt-4 grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-2">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r"><div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-semibold text-muted"><Columns2 className="h-3.5 w-3.5" />Markdown</div><Textarea aria-label="Markdown 编辑器" className="min-h-[42vh] flex-1 resize-none rounded-none border-0 bg-transparent p-6 font-mono text-sm leading-7 focus-visible:border-transparent" onChange={(event) => { setText(event.target.value); setStatus('dirty') }} spellCheck value={text} /></section>
        <section className="min-h-0 overflow-auto"><div className="sticky top-0 flex items-center gap-2 border-b border-border bg-surface/90 px-4 py-3 text-xs font-semibold text-muted backdrop-blur"><Eye className="h-3.5 w-3.5" />预览</div><div className="p-6 lg:p-10"><MarkdownPreview source={text} /></div></section>
      </div>
    </div>
  )
}
