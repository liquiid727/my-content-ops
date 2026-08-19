import type { ChangeSet, GraphCommand, RecipeCapability } from '@creator-studio/contracts'
import { Bot, Check, GitPullRequest, Loader2, X } from 'lucide-react'
import { useState } from 'react'

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Textarea } from '../shared/ui'
import { workflowApi } from './workflow-api'

function proposedCommands(request: string, capabilities: RecipeCapability[], x: number, y: number): GraphCommand[] {
  const normalized = request.toLowerCase()
  const wanted = normalized.includes('扩图') || normalized.includes('outpaint') ? 'image.outpaint'
    : normalized.includes('增强') ? 'image.enhance'
      : normalized.includes('改写') || normalized.includes('rewrite') ? 'text.rewrite'
        : normalized.includes('文') || normalized.includes('script') ? 'text.draft'
          : 'image.generate'
  const capability = capabilities.find((item) => item.id === wanted) ?? capabilities[0]
  if (!capability) return []
  return [{ type: 'create_recipe_node', capabilityId: capability.id, title: capability.label, config: { prompt: request }, position: { x, y } }]
}

export function ChangeSetReview({ projectId, revision, capabilities, onApplied }: { projectId: string; revision: number; capabilities: RecipeCapability[]; onApplied: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [request, setRequest] = useState(''); const [proposal, setProposal] = useState<ChangeSet>(); const [working, setWorking] = useState(false); const [error, setError] = useState<string>()
  const propose = async () => { setWorking(true); setError(undefined); try { const commands = proposedCommands(request, capabilities, 180, 160); if (!commands.length) throw new Error('没有可用的工具能力'); setProposal(await workflowApi.propose(projectId, { baseRevision: revision, summary: `内部 Agent 建议：${request}`, proposer: { type: 'internal_agent', name: 'Creator Studio Agent' }, commands })) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setWorking(false) } }
  const approve = async () => { if (!proposal) return; setWorking(true); try { await workflowApi.approve(proposal.id, revision); await onApplied(); setOpen(false); setProposal(undefined); setRequest('') } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setWorking(false) } }
  const reject = async () => { if (!proposal) return; setWorking(true); try { setProposal(await workflowApi.reject(proposal.id)) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setWorking(false) } }
  return <><Button className="min-h-8 px-3 py-1.5 text-xs" onClick={() => setOpen(true)}><Bot className="h-3.5 w-3.5" />AI 编排</Button><Dialog onOpenChange={setOpen} open={open}><DialogContent className="max-w-xl"><DialogTitle>让 Agent 提出画布变更</DialogTitle><DialogDescription>Agent 只能生成待审批的 ChangeSet。它不能替你批准，也不能直接执行流程。</DialogDescription>{!proposal ? <div className="mt-4"><Textarea className="min-h-28" onChange={(event) => setRequest(event.target.value)} placeholder="例如：添加一个图片生成工具，制作 4 张有电影感的封面候选" value={request} /><Button className="mt-3 w-full" disabled={!request.trim() || working} onClick={() => void propose()} variant="primary">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitPullRequest className="h-4 w-4" />}生成变更提案</Button></div> : <div className="mt-4"><div className={`rounded-xl border p-4 ${proposal.validation.valid ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'}`}><div className="flex items-center justify-between"><p className="font-semibold">{proposal.summary}</p><span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wider">{proposal.status}</span></div><ol className="mt-3 space-y-2">{proposal.commands.map((command, index) => <li className="rounded-lg bg-background/55 px-3 py-2 font-mono text-xs" key={index}>{index + 1}. {command.type}</li>)}</ol>{proposal.validation.errors.map((item) => <p className="mt-2 text-xs text-danger" key={`${item.commandIndex}-${item.code}`}>{item.code}: {item.message}</p>)}</div>{proposal.status === 'proposed' ? <div className="mt-4 flex justify-end gap-2"><Button disabled={working} onClick={() => void reject()}><X className="h-4 w-4" />拒绝</Button><Button disabled={working || !proposal.validation.valid} onClick={() => void approve()} variant="primary"><Check className="h-4 w-4" />批准并应用</Button></div> : null}</div>}{error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}</DialogContent></Dialog></>
}
