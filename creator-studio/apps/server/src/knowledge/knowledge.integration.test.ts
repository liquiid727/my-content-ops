import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { withTestDatabase } from '../db/test-database.js'
import { HttpError } from '../http/errors.js'
import { ProjectRepository, WorkspaceRepository } from '../repositories/index.js'
import { ConnectionService } from './connection-service.js'
import { KnowledgeRepository } from './knowledge-repository.js'
import { KnowledgeService } from './knowledge-service.js'
import { LarkResourceAdapter } from './lark-resource-adapter.js'
import { LocalResourceAdapter } from './local-resource-adapter.js'
import { ResourceAdapterRegistry } from './resource-adapter.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'

describe('external knowledge module', () => {
  it('indexes a local source, validates cache versions and binds only references to a project', async () => {
    await withTestDatabase(async (database) => {
      await new WorkspaceRepository(database.db).createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
        profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
      })
      await new ProjectRepository(database.db).create({ id: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'Project', status: 'draft', createdBy: PROFILE_ID, createdAt: 1, updatedAt: 1 })
      const vault = join(database.dataDirectory, 'vault')
      await mkdir(vault)
      await writeFile(join(vault, 'agent-notes.md'), '# Agent Notes\n\n历史素材中的关键结论。')

      const repository = new KnowledgeRepository(database.sqlite)
      const adapters = new ResourceAdapterRegistry([new LocalResourceAdapter('obsidian'), new LocalResourceAdapter('folder'), new LarkResourceAdapter()])
      let now = 1_700_000_000_000
      const connections = new ConnectionService(repository, adapters, database.dataDirectory, undefined, () => now++)
      const knowledge = new KnowledgeService(repository, connections, adapters, () => now++)
      const connection = await connections.create(WORKSPACE_ID, { type: 'obsidian', name: 'My Vault', config: { root: vault }, enabled: true })

      expect(await knowledge.indexConnection(WORKSPACE_ID, connection.id)).toEqual({ discovered: 1, indexed: 1, failed: 0 })
      const [source] = await knowledge.search(WORKSPACE_ID, { q: '关键结论', limit: 20 })
      expect(source).toMatchObject({ title: 'agent-notes', connectionType: 'obsidian', projectIds: [] })
      if (!source) throw new Error('Expected indexed source')

      const first = await knowledge.detail(WORKSPACE_ID, source.id)
      expect(first.text).toContain('历史素材')
      expect(first.cached).toBe(true)
      knowledge.bind(WORKSPACE_ID, PROJECT_ID, source.id)
      expect(knowledge.listProjectSources(WORKSPACE_ID, PROJECT_ID)[0]?.projectIds).toEqual([PROJECT_ID])
      const context = await knowledge.projectContext(WORKSPACE_ID, PROJECT_ID)
      expect(context.text).toContain('关键结论')
      expect(context.citations[0]).toMatchObject({ sourceId: source.id, ref: 'agent-notes.md' })

      connections.delete(WORKSPACE_ID, connection.id)
      expect(repository.listSources(WORKSPACE_ID, { q: '', limit: 20 })).toEqual([])
      expect(database.sqlite.prepare('SELECT count(*) AS count FROM knowledge_chunks_fts').get()).toEqual({ count: 0 })
      expect(await readFile(join(vault, 'agent-notes.md'), 'utf8')).toContain('历史素材')
    })
  })

  it('rejects traversal and symlink-style escape refs before reading', async () => {
    await withTestDatabase(async (database) => {
      const root = join(database.dataDirectory, 'root')
      await mkdir(root)
      const adapter = new LocalResourceAdapter('folder')
      await expect(adapter.read({ id: 'x', type: 'folder', config: { root } }, '../outside.md')).rejects.toBeInstanceOf(HttpError)
    })
  })

  it('uses only pinned read commands for Lark auth and spreadsheet extraction', async () => {
    const calls: string[][] = []
    const runner = async (_command: string, args: string[]) => {
      calls.push(args)
      if (args[0] === 'auth') return { exitCode: 0, stderr: '', stdout: JSON.stringify({ identities: { user: { available: true } } }) }
      if (args[0] === 'drive') return { exitCode: 0, stderr: '', stdout: JSON.stringify({ data: { url: 'https://example.feishu.cn/sheets/abc', type: 'sheet', token: 'abc', title: '选题表' } }) }
      if (args[1] === '+workbook-info') return { exitCode: 0, stderr: '', stdout: JSON.stringify({ data: { sheets: [{ sheet_id: 'sheet1' }] } }) }
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ data: { csv: '标题,状态\\nAgent,完成' } }) }
    }
    const adapter = new LarkResourceAdapter(runner)
    const connection = { id: 'lark', type: 'lark' as const, config: { command: '/managed/lark-cli' } }
    expect(await adapter.test(connection)).toMatchObject({ ok: true, status: 'ready' })
    expect((await adapter.read(connection, 'https://example.feishu.cn/sheets/abc')).text).toContain('Agent')
    expect(calls).toEqual([
      ['auth', 'status', '--json'],
      ['drive', '+inspect', '--url', 'https://example.feishu.cn/sheets/abc', '--format', 'json'],
      ['sheets', '+workbook-info', '--url', 'https://example.feishu.cn/sheets/abc', '--format', 'json'],
      ['sheets', '+csv-get', '--url', 'https://example.feishu.cn/sheets/abc', '--sheet-id', 'sheet1', '--max-chars', '100000', '--format', 'json'],
    ])
  })
})
