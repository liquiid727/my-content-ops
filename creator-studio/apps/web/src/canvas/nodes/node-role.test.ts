import { describe, expect, it } from 'vitest'

import type { ArtifactDetail } from '@creator-studio/contracts'

import { artifactTitle, cardStatus, displayTitle, NODE_DEFAULT_SIZE, nodeTone, roleLabelKey } from './node-role'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'

function artifact(overrides: Partial<ArtifactDetail> = {}): ArtifactDetail {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5F01',
    projectId: PROJECT_ID,
    kind: 'text',
    role: 'topic',
    currentVersionId: '01ARZ3NDEKTSV4RRFFQ69G5F02',
    revision: 1,
    createdAt: '2026-08-10T09:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
    currentVersion: {
      id: '01ARZ3NDEKTSV4RRFFQ69G5F02',
      artifactId: '01ARZ3NDEKTSV4RRFFQ69G5F01',
      versionNumber: 1,
      parentVersionId: null,
      contentRef: { type: 'inline', text: '普通人如何搭 Agent' },
      metadata: {},
      source: 'ai',
      operationRunId: null,
      createdBy: '01ARZ3NDEKTSV4RRFFQ69G5F03',
      createdAt: '2026-08-10T09:00:00.000Z',
    },
    ...overrides,
  }
}

describe('node role catalog', () => {
  it('maps roles to localized keys and tones', () => {
    expect(roleLabelKey('topic')).toBe('nodeRole.topic')
    expect(nodeTone('topic')).toBe('topic')
    expect(nodeTone('outline')).toBe('structure')
    expect(nodeTone('cover')).toBe('image')
    expect(nodeTone('unknown', 'audio')).toBe('audio')
  })

  it('prefers short topic lines and appends version on media/script', () => {
    expect(artifactTitle(artifact(), 'topic', '选题')).toBe('普通人如何搭 Agent')
    expect(displayTitle(artifact({ kind: 'image', role: 'cover', currentVersion: { ...artifact().currentVersion!, versionNumber: 3 } }), 'cover', '封面')).toBe('封面 v3')
  })

  it('derives card status from run and content', () => {
    expect(cardStatus(undefined, undefined)).toBe('idle')
    expect(cardStatus(artifact({ currentVersion: null }), undefined)).toBe('draft')
    expect(cardStatus(artifact(), { status: 'running' } as never)).toBe('running')
    expect(cardStatus(artifact(), undefined)).toBe('completed')
  })

  it('keeps default sizes close to real card geometry', () => {
    expect(NODE_DEFAULT_SIZE.TextNode).toEqual({ width: 260, height: 168 })
    expect(NODE_DEFAULT_SIZE.CollectionNode).toEqual({ width: 440, height: 236 })
    expect(NODE_DEFAULT_SIZE.RecipeNode).toEqual({ width: 208, height: 108 })
  })
})
