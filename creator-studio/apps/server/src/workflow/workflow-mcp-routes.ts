import { graphCommandSchema, idSchema, proposeChangeSetSchema } from '@creator-studio/contracts'
import type { Hono } from 'hono'
import { z } from 'zod'

import type { HttpBindings } from '../http/types.js'
import type { WorkflowService } from './workflow-service.js'

const requestSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string(), params: z.record(z.string(), z.unknown()).optional() }).passthrough()
const projectArgs = z.object({ projectId: idSchema }).strict()
const validateArgs = z.object({ projectId: idSchema, baseRevision: z.number().int().positive(), commands: z.array(graphCommandSchema).min(1).max(100) }).strict()
const proposalArgs = validateArgs.extend({ summary: z.string().min(1).max(2_000), proposerName: z.string().min(1).max(120).default('MCP Client') }).strict()
const statusArgs = z.object({ changeSetId: idSchema }).strict()

const tools = [
  { name: 'creative_canvas_get_snapshot', description: 'Read a project creative-canvas snapshot.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'creative_canvas_validate_change_set', description: 'Validate proposed graph commands without changing the project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, baseRevision: { type: 'integer' }, commands: { type: 'array' } }, required: ['projectId', 'baseRevision', 'commands'], additionalProperties: false } },
  { name: 'creative_canvas_propose_change_set', description: 'Create a ChangeSet for review in Creator Studio. This never approves or executes it.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, baseRevision: { type: 'integer' }, summary: { type: 'string' }, proposerName: { type: 'string' }, commands: { type: 'array' } }, required: ['projectId', 'baseRevision', 'summary', 'commands'], additionalProperties: false } },
  { name: 'creative_canvas_get_change_set', description: 'Read ChangeSet validation and decision status.', inputSchema: { type: 'object', properties: { changeSetId: { type: 'string' } }, required: ['changeSetId'], additionalProperties: false } },
]

export function configureWorkflowMcpRoutes(app: Hono<HttpBindings>, service: WorkflowService): void {
  app.post('/mcp', async (context) => {
    const identity = { workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') }
    let parsed: z.infer<typeof requestSchema>
    try { parsed = requestSchema.parse(await context.req.json()) } catch { return context.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400) }
    const success = (result: unknown) => context.json({ jsonrpc: '2.0', id: parsed.id ?? null, result })
    if (parsed.method === 'initialize') return success({ protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'creator-studio-creative-canvas', version: '1.0.0' } })
    if (parsed.method === 'notifications/initialized') return context.body(null, 202)
    if (parsed.method === 'tools/list') return success({ tools })
    if (parsed.method !== 'tools/call') return context.json({ jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32601, message: 'Method not found' } }, 404)
    const call = z.object({ name: z.string(), arguments: z.unknown().default({}) }).parse(parsed.params ?? {})
    try {
      let data: unknown
      if (call.name === 'creative_canvas_get_snapshot') { const args = projectArgs.parse(call.arguments); data = await service.getSnapshot(identity, args.projectId) }
      else if (call.name === 'creative_canvas_validate_change_set') { const args = validateArgs.parse(call.arguments); await service.getSnapshot(identity, args.projectId); data = service.validate(args.projectId, args.baseRevision, args.commands) }
      else if (call.name === 'creative_canvas_propose_change_set') { const args = proposalArgs.parse(call.arguments); const proposal = proposeChangeSetSchema.parse({ baseRevision: args.baseRevision, summary: args.summary, proposer: { type: 'mcp', name: args.proposerName }, commands: args.commands }); data = await service.proposeChangeSet(identity, args.projectId, proposal) }
      else if (call.name === 'creative_canvas_get_change_set') { const args = statusArgs.parse(call.arguments); data = await service.getChangeSet(identity, args.changeSetId) }
      else return success({ isError: true, content: [{ type: 'text', text: `Unknown tool: ${call.name}` }] })
      return success({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return success({ isError: true, content: [{ type: 'text', text: message }] })
    }
  })
}
