import type { ArtifactDetail, CollectionItem } from '@creator-studio/contracts'
import { ArrowLeft, Brush, Check, Download, Image as ImageIcon, Loader2, Sparkles, Upload, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ulid } from 'ulid'

import { canvasApi } from '../canvas/api/canvas-api'
import { runApi } from '../canvas/api/run-api'
import { assetContentUrl, versionAssetId } from '../canvas/lib/media'
import { imageStudioApi } from '../image-studio/image-studio-api'
import { uploadAsset } from '../modules/assets'
import { Button, Input, Skeleton, Textarea } from '../shared/ui'

type Mode = 'generate_image' | 'edit_image' | 'outpaint_image' | 'vary_image' | 'enhance_image'
const modes: Array<{ id: Mode; label: string }> = [{ id: 'generate_image', label: '生成' }, { id: 'edit_image', label: '编辑' }, { id: 'outpaint_image', label: '扩图' }, { id: 'vary_image', label: '变体' }, { id: 'enhance_image', label: '增强' }]

function MaskCanvas({ assetId, projectId, outpaint, onPrepared }: { assetId: string; projectId: string; outpaint: boolean; onPrepared: (value: { overrideSourceAssetId?: string; maskAssetId: string }) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      const padding = outpaint ? Math.round(Math.max(image.naturalWidth, image.naturalHeight) * 0.2) : 0
      const width = image.naturalWidth + padding * 2; const height = image.naturalHeight + padding * 2
      const source = sourceRef.current; const mask = canvasRef.current
      if (!source || !mask) return
      source.width = width; source.height = height; mask.width = width; mask.height = height
      source.getContext('2d')?.drawImage(image, padding, padding)
      const context = mask.getContext('2d'); if (!context) return
      context.clearRect(0, 0, width, height); context.fillStyle = '#000'; context.fillRect(padding, padding, image.naturalWidth, image.naturalHeight)
      setReady(true)
    }
    image.src = assetContentUrl(assetId)
  }, [assetId, outpaint])

  const erase = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!(event.buttons & 1)) return
    const canvas = canvasRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context) return
    const rect = canvas.getBoundingClientRect(); const x = (event.clientX - rect.left) * canvas.width / rect.width; const y = (event.clientY - rect.top) * canvas.height / rect.height
    context.save(); context.globalCompositeOperation = 'destination-out'; context.beginPath(); context.arc(x, y, Math.max(canvas.width, canvas.height) * 0.035, 0, Math.PI * 2); context.fill(); context.restore()
  }
  const asFile = (canvas: HTMLCanvasElement, name: string) => new Promise<File>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('Canvas export failed')), 'image/png'))
  const prepare = async () => {
    if (!canvasRef.current || !sourceRef.current) return
    setUploading(true)
    try {
      const mask = await uploadAsset(await asFile(canvasRef.current, 'creative-mask.png'), projectId)
      if (outpaint) { const source = await uploadAsset(await asFile(sourceRef.current, 'outpaint-source.png'), projectId); onPrepared({ maskAssetId: mask.data.id, overrideSourceAssetId: source.data.id }) }
      else onPrepared({ maskAssetId: mask.data.id })
    } finally { setUploading(false) }
  }
  return <div className="rounded-xl border border-border bg-background/40 p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold">{outpaint ? '外扩画布' : '蒙版画笔'}</p><p className="mt-1 text-[10px] text-muted">黑色保留，擦出的透明区域交给 AI 生成</p></div><Button className="min-h-8 px-3 py-1 text-xs" disabled={!ready || uploading} onClick={() => void prepare()}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brush className="h-3.5 w-3.5" />}使用蒙版</Button></div><div className="relative mx-auto max-h-72 max-w-lg overflow-hidden rounded-lg bg-[linear-gradient(45deg,#252525_25%,transparent_25%),linear-gradient(-45deg,#252525_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#252525_75%),linear-gradient(-45deg,transparent_75%,#252525_75%)] bg-[length:16px_16px]"><canvas className="block max-h-72 w-full opacity-75" ref={sourceRef} /><canvas className="absolute inset-0 block max-h-72 w-full cursor-crosshair opacity-55" onPointerDown={erase} onPointerMove={erase} ref={canvasRef} /></div></div>
}

export default function ImageStudioPage() {
  const { projectId = '', artifactId = '' } = useParams(); const navigate = useNavigate()
  const [root, setRoot] = useState<ArtifactDetail>(); const [items, setItems] = useState<CollectionItem[]>([]); const [details, setDetails] = useState<Record<string, ArtifactDetail>>({})
  const [mode, setMode] = useState<Mode>('generate_image'); const [prompt, setPrompt] = useState(''); const [count, setCount] = useState(4); const [references, setReferences] = useState<string[]>([]); const [mask, setMask] = useState<{ maskAssetId: string; overrideSourceAssetId?: string }>()
  const [working, setWorking] = useState(false); const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await canvasApi.artifact(artifactId)
        const nextItems = response.data.kind === 'collection' ? await imageStudioApi.items(artifactId) : []
        const pairs = response.data.kind === 'collection'
          ? await Promise.all(nextItems.map(async (item) => [item.itemArtifactId, (await canvasApi.artifact(item.itemArtifactId)).data] as const))
          : [[response.data.id, response.data] as const]
        if (!active) return
        setRoot(response.data)
        setItems(nextItems)
        setDetails(Object.fromEntries(pairs))
        setError(undefined)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught))
      }
    })()
    return () => { active = false }
  }, [artifactId])
  const selectedId = items.find((item) => item.selected)?.itemArtifactId ?? (root?.kind === 'image' ? root.id : items[0]?.itemArtifactId)
  const selected = selectedId ? details[selectedId] : undefined; const selectedAssetId = versionAssetId(selected?.currentVersion)
  const uploadReferences = async (files: FileList | null) => { if (!files) return; const uploaded = await Promise.all([...files].slice(0, 8).map((file) => uploadAsset(file, projectId))); setReferences(uploaded.map((item) => item.data.id)) }
  const run = async () => {
    setWorking(true); setError(undefined)
    try {
      const result = await runApi.create(mode, { projectId, ...(mode !== 'generate_image' && selectedId ? { sourceArtifactId: selectedId } : {}), config: { prompt, count, referenceAssetIds: references, ...(mask ?? {}) }, idempotencyKey: ulid() })
      for (;;) { const current = await runApi.get(result.runId); if (current.status === 'completed') { const output = current.outputArtifactIds?.[0]; if (output) navigate(`/projects/${projectId}/image/${output}`, { replace: true }); break } if (current.status === 'failed' || current.status === 'cancelled') throw new Error(current.error?.message ?? '图片任务失败'); await new Promise((resolve) => window.setTimeout(resolve, 500)) }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setWorking(false) }
  }
  if (!root && !error) return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-[60vh]" /></div>
  return <div className="flex h-full min-h-0 flex-col" data-testid="image-studio"><header className="flex items-center gap-3 border-b border-border pb-3"><Link className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-elevated" to={`/projects/${projectId}/canvas`}><ArrowLeft className="h-4 w-4" /><span className="sr-only">返回画布</span></Link><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImageIcon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h1 className="font-display text-xl font-semibold">图像工作室</h1><p className="text-xs text-muted">候选、蒙版与生成历史都保存在项目中</p></div>{selectedAssetId ? <a className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-elevated" download href={assetContentUrl(selectedAssetId)}><Download className="h-4 w-4" />下载原图</a> : null}</header>
    {error ? <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
    <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="min-h-0 overflow-auto rounded-2xl border border-border bg-surface p-4"><div className="flex min-h-[360px] items-center justify-center rounded-xl bg-background/55 p-4">{selectedAssetId ? <img alt="当前选中图片" className="max-h-[56vh] max-w-full rounded-lg object-contain shadow-2xl" src={assetContentUrl(selectedAssetId)} /> : <div className="text-center text-muted"><ImageIcon className="mx-auto h-8 w-8" /><p className="mt-3 text-sm">生成首批候选图片</p></div>}</div>{items.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map((item, index) => { const detail = details[item.itemArtifactId]; const assetId = versionAssetId(detail?.currentVersion); return <Button className={`relative min-h-0 overflow-hidden rounded-xl p-0 ${item.selected ? 'border-primary ring-2 ring-primary/25' : ''}`} key={item.itemArtifactId} onClick={() => void imageStudioApi.select(artifactId, item.itemArtifactId).then(setItems)} variant="secondary">{assetId ? <img alt={`候选 ${index + 1}`} className="aspect-square w-full object-cover" src={assetContentUrl(assetId)} /> : null}{item.selected ? <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></span> : null}</Button> })}</div> : null}{selectedAssetId && (mode === 'edit_image' || mode === 'outpaint_image') ? <div className="mt-4"><MaskCanvas assetId={selectedAssetId} onPrepared={setMask} outpaint={mode === 'outpaint_image'} projectId={projectId} /></div> : null}</section>
      <aside className="min-h-0 overflow-auto rounded-2xl border border-border bg-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Creative tools</p><h2 className="mt-1 font-display text-xl font-semibold">制作下一版</h2><div className="mt-4 grid grid-cols-5 gap-1 rounded-xl bg-elevated p-1">{modes.map((item) => <Button className={`min-h-8 rounded-lg px-1 text-[11px] ${mode === item.id ? 'bg-surface text-primary shadow-sm' : ''}`} key={item.id} onClick={() => { setMode(item.id); setMask(undefined) }} variant="ghost">{item.label}</Button>)}</div><label className="mt-5 block text-xs font-semibold">创作指令</label><Textarea className="mt-2 min-h-32" onChange={(event) => setPrompt(event.target.value)} placeholder="描述画面、构图、光线、材质和需要保留的部分…" value={prompt} /><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-semibold">候选数量<Input className="mt-2" max={8} min={1} onChange={(event) => setCount(Number(event.target.value))} type="number" value={count} /></label><label className="text-xs font-semibold">参考图片<span className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted hover:border-primary/50 hover:text-primary"><Upload className="h-3.5 w-3.5" />{references.length ? `${references.length} 张` : '上传'}</span><input accept="image/png,image/jpeg,image/webp" className="sr-only" multiple onChange={(event) => void uploadReferences(event.target.files)} type="file" /></label></div>{mask ? <p className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-2 text-xs text-success"><Check className="h-3.5 w-3.5" />蒙版已就绪</p> : null}<Button className="mt-5 w-full" disabled={working || (mode !== 'generate_image' && !selectedId) || ((mode === 'outpaint_image') && !mask)} onClick={() => void run()} variant="primary">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'enhance_image' ? <WandSparkles className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{working ? '正在生成…' : '生成候选'}</Button><p className="mt-3 text-[10px] leading-4 text-muted">使用设置中的真实图像 Provider。未配置时任务会明确失败，不会生成伪造占位图。</p></aside></div></div>
}
