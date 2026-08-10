import {
  sectionKeys,
  type Audience,
  type ContentRules,
  type CreatorIdentity,
  type InjectScope,
  type InjectionSettings,
  type Knowledge,
  type Memory,
  type PersonalStyle,
  type Positioning,
  type SectionKey,
  type Voice,
} from './creator-profile.js'

const SECTION_TITLES: Record<SectionKey, string> = {
  identity: '身份',
  positioning: '定位',
  audience: '受众',
  voice: '声音',
  knowledge: '知识',
  memory: '记忆',
  rules: '规则',
}

const SCOPE_INTENTS: Record<InjectScope, string> = {
  project: '项目整体创作方向与定位',
  topic: '选题方向与角度',
  outline: '内容大纲结构',
  script: '口播脚本撰写',
  cover: '封面与标题创作',
  voice: '配音与口吻表达',
  video: '视频画面与剪辑',
  publish: '发布与分发文案',
}

function renderIdentity(identity: CreatorIdentity): string {
  const lines: string[] = []
  if (identity.creatorName) lines.push(`- 创作者：${identity.creatorName}`)
  const nicknames = Object.entries(identity.nicknames)
  if (nicknames.length > 0) lines.push(`- 平台昵称：${nicknames.map(([platform, name]) => `${platform}=${name}`).join('、')}`)
  if (identity.currentRole) lines.push(`- 当前角色：${identity.currentRole}`)
  if (identity.background) lines.push(`- 背景：${identity.background}`)
  if (identity.personalStory) lines.push(`- 个人故事：${identity.personalStory}`)
  if (identity.mission) lines.push(`- 使命：${identity.mission}`)
  return lines.join('\n')
}

function renderPositioning(positioning: Positioning): string {
  const lines: string[] = []
  if (positioning.summary) lines.push(`- 一句话定位：${positioning.summary}`)
  if (positioning.nicheTags.length > 0) lines.push(`- 细分标签：${positioning.nicheTags.join('、')}`)
  if (positioning.differentiation) lines.push(`- 差异化：${positioning.differentiation}`)
  if (positioning.valueProposition) lines.push(`- 价值主张：${positioning.valueProposition}`)
  if (positioning.channels.length > 0) lines.push(`- 发布渠道：${positioning.channels.map((channel) => `${channel.platform}（${channel.focus}）`).join('、')}`)
  return lines.join('\n')
}

function renderAudience(audience: Audience): string {
  const lines: string[] = []
  if (audience.primaryAudience) lines.push(`- 核心受众：${audience.primaryAudience}`)
  if (audience.knowledgeLevel) lines.push(`- 认知水平：${audience.knowledgeLevel}`)
  if (audience.painPoints.length > 0) lines.push(`- 痛点：${audience.painPoints.join('、')}`)
  if (audience.goals.length > 0) lines.push(`- 目标：${audience.goals.join('、')}`)
  return lines.join('\n')
}

function renderVoice(voice: Voice): string {
  const lines: string[] = []
  if (voice.tone.like.length > 0) lines.push(`- 语气偏好：${voice.tone.like.join('、')}`)
  if (voice.tone.avoid.length > 0) lines.push(`- 避免语气：${voice.tone.avoid.join('、')}`)
  if (voice.writingStyle.preferredAspects.length > 0) lines.push(`- 写作偏好：${voice.writingStyle.preferredAspects.join('、')}`)
  if (voice.writingStyle.sentencePatterns.length > 0) lines.push(`- 句式偏好：${voice.writingStyle.sentencePatterns.join('、')}`)
  if (voice.vocabulary.common.length > 0) lines.push(`- 常用词：${voice.vocabulary.common.join('、')}`)
  if (voice.vocabulary.banned.length > 0) lines.push(`- 禁用词：${voice.vocabulary.banned.join('、')}`)
  return lines.join('\n')
}

function renderKnowledge(knowledge: Knowledge): string {
  const lines: string[] = []
  if (knowledge.domains.length > 0) lines.push(`- 领域：${knowledge.domains.join('、')}`)
  if (knowledge.toolsAndSkills && knowledge.toolsAndSkills.length > 0) lines.push(`- 工具技能：${knowledge.toolsAndSkills.join('、')}`)
  if (knowledge.strengths && knowledge.strengths.length > 0) lines.push(`- 优势：${knowledge.strengths.join('、')}`)
  return lines.join('\n')
}

function renderMemory(memory: Memory): string {
  const lines: string[] = []
  for (const work of memory.pastWorks) {
    const label = work.platform ? `${work.title}（${work.platform}）` : work.title
    lines.push(work.reflections ? `- 过往作品：${label}：${work.reflections}` : `- 过往作品：${label}`)
  }
  if (memory.learnings && memory.learnings.length > 0) lines.push(`- 经验教训：${memory.learnings.join('、')}`)
  return lines.join('\n')
}

function renderRules(rules: ContentRules): string {
  const lines: string[] = []
  if (rules.principles.length > 0) lines.push(`- 原则：${rules.principles.join('、')}`)
  if (rules.likedStructures && rules.likedStructures.length > 0) lines.push(`- 喜欢的结构：${rules.likedStructures.join('、')}`)
  if (rules.likedHooks && rules.likedHooks.length > 0) lines.push(`- 喜欢的开头：${rules.likedHooks.join('、')}`)
  if (rules.bannedWords && rules.bannedWords.length > 0) lines.push(`- 禁用词：${rules.bannedWords.join('、')}`)
  return lines.join('\n')
}

function renderSection(key: SectionKey, profile: PersonalStyle): string {
  switch (key) {
    case 'identity': return renderIdentity(profile.identity)
    case 'positioning': return renderPositioning(profile.positioning)
    case 'audience': return renderAudience(profile.audience)
    case 'voice': return renderVoice(profile.voice)
    case 'knowledge': return renderKnowledge(profile.knowledge)
    case 'memory': return renderMemory(profile.memory)
    case 'rules': return renderRules(profile.rules)
  }
}

/**
 * renderContext（spec §5.1）：按 injection 开关收集启用区块，每区块渲染一段带标题的 markdown，
 * 用固定模板（系统提示头 + scope 意图）拼成单一注入文本。总开关关或无可渲染内容 → 空文本。
 * canvas-runtime 的 Context Assembler 与 web 端注入预览共用此函数。
 */
export function renderContext(profile: PersonalStyle, injection: InjectionSettings, scope: InjectScope): string {
  if (!injection.enabled) return ''

  const blocks = sectionKeys
    .filter((key) => injection.sections[key] === true)
    .map((key) => ({ title: SECTION_TITLES[key], text: renderSection(key, profile) }))
    .filter((block) => block.text !== '')

  if (blocks.length === 0) return ''

  const body = blocks.map((block) => `## ${block.title}\n${block.text}`).join('\n\n')
  return `以下是创作者的风格与背景，请遵循。\n\n创作场景：${SCOPE_INTENTS[scope]}\n\n${body}`
}
