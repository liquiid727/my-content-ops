import { z } from 'zod'

import type { TaskHandler, TaskHandlerResult } from '../tasks/task-handler.js'
import { ConnectionService } from './connection-service.js'
import { KnowledgeService } from './knowledge-service.js'

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('install_lark'), workspaceId: z.string(), connectionId: z.string() }).strict(),
  z.object({ action: z.literal('finish_lark_auth'), workspaceId: z.string(), connectionId: z.string(), deviceCode: z.string().nullable() }).strict(),
  z.object({ action: z.literal('index'), workspaceId: z.string(), connectionId: z.string() }).strict(),
  z.object({ action: z.literal('refresh'), workspaceId: z.string(), sourceId: z.string() }).strict(),
])

export class KnowledgeTaskHandler implements TaskHandler {
  readonly type = 'knowledge'
  readonly recoverable = false
  constructor(private readonly connections: ConnectionService, private readonly knowledge: KnowledgeService) {}
  parse(input: unknown) { return inputSchema.parse(input) }
  async execute(raw: unknown, signal: AbortSignal): Promise<TaskHandlerResult> {
    const input = this.parse(raw)
    let output: unknown
    if (input.action === 'install_lark') output = await this.connections.installLark(input.workspaceId, input.connectionId, signal)
    else if (input.action === 'finish_lark_auth') { await this.connections.finishLarkAuth(input.workspaceId, input.connectionId, input.deviceCode, signal); output = { authenticated: true } }
    else if (input.action === 'index') output = await this.knowledge.indexConnection(input.workspaceId, input.connectionId)
    else output = await this.knowledge.refresh(input.workspaceId, input.sourceId)
    return { providerKey: 'local', model: `knowledge.${input.action}`, requestSnapshot: { action: input.action }, responseSnapshot: output, usage: {}, output }
  }
}
