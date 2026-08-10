// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { get, update, render: renderPreview } = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  render: vi.fn(),
}))

vi.mock('../modules/creator-profile/creator-profile-api', () => ({
  creatorProfileApi: { get, update, render: renderPreview },
}))

import CreatorProfilePage from './creator-profile-page'

const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

const PROFILE = {
  id: PROFILE_ID,
  workspaceId: '01ARZ3NDEKTSV4RRFFQ69G5FAA',
  displayName: '阿篓的AI篓子',
  avatarAssetId: null,
  bio: 'AI 应用创作者',
  profile: {
    identity: { creatorName: '阿篓', nicknames: { 公众号: 'AI晚点' }, currentRole: '', background: '', personalStory: '', mission: '' },
    positioning: { summary: '', nicheTags: [], differentiation: '', valueProposition: '', channels: [] },
    audience: { primaryAudience: '', knowledgeLevel: '', painPoints: [], goals: [] },
    voice: { tone: { like: [], avoid: [] }, writingStyle: { preferredAspects: [], sentencePatterns: [] }, vocabulary: { common: [], banned: [] } },
    knowledge: { domains: [], toolsAndSkills: [], strengths: [] },
    memory: { pastWorks: [] },
    rules: { principles: [], likedStructures: [], likedHooks: [], bannedWords: [] },
  },
  injection: { enabled: true, sections: { identity: true, positioning: true, audience: true, voice: true, knowledge: true, memory: false, rules: true } },
  revision: 1,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CreatorProfilePage', () => {
  it('loads the profile, shows a client-side injection preview, and saves via revisioned patch', async () => {
    get.mockResolvedValue({ data: PROFILE, meta: { requestId: REQUEST_ID } })
    update.mockResolvedValue({ data: { ...PROFILE, displayName: '新名字', revision: 2 }, meta: { requestId: REQUEST_ID } })

    render(<CreatorProfilePage />)

    const displayName = await screen.findByDisplayValue('阿篓的AI篓子')
    expect(displayName).toBeTruthy()

    const preview = screen.getByText(/以下是创作者的风格与背景，请遵循/)
    expect(preview.textContent).toContain('阿篓')

    fireEvent.change(displayName, { target: { value: '新名字' } })
    fireEvent.click(screen.getByRole('button', { name: '保存画像' }))

    expect(update).toHaveBeenCalledWith(PROFILE_ID, 1, expect.objectContaining({ displayName: '新名字', bio: 'AI 应用创作者' }))
  })
})
