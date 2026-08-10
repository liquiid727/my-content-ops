import type { InjectionSettings, PersonalStyle } from '@creator-studio/contracts'

/**
 * 阿篓（AI晚点）默认画像 seed（spec §4.1 `GET /creator-profile/default`，Issue #6 用作新建 workspace 的默认画像）。
 * 与 `creator-profile` 契约对齐：七块 + injection 开关。
 */
export const ALAOS_PROFILE: PersonalStyle = {
  identity: {
    creatorName: '阿篓',
    nicknames: {
      公众号: 'AI晚点',
      小红书: '阿篓的AI篓子',
      抖音: '阿篓的AI篓子',
      B站: '阿篓的AI篓子',
    },
    currentRole: 'AI 应用独立开发者',
    background: '白天写代码，晚上写 AI 内容。',
    personalStory: '从零开始折腾 AI 小工具，把踩坑过程讲给普通人听。',
    mission: '让普通人用上、用懂 AI 应用。',
  },
  positioning: {
    summary: '面向普通人的 AI 应用开发与工具测评，用故事把技术讲明白。',
    nicheTags: ['AI Coding', 'AI 工具', '独立开发'],
    differentiation: '老番茄式节奏 + 笨蛋美人人设，先讲故事再讲原理。',
    valueProposition: '看完就能动手搭一个自己的 AI 小工具。',
    channels: [
      { platform: '公众号', focus: '深度长文' },
      { platform: '小红书', focus: '干货卡片' },
      { platform: '抖音', focus: '口播短剧' },
      { platform: 'B站', focus: '视频教程' },
    ],
  },
  audience: {
    primaryAudience: '想用 AI 提升效率的普通人',
    knowledgeLevel: '零基础到入门',
    painPoints: ['不知道从哪开始', '怕被割韭菜', '代码恐惧'],
    goals: ['学会搭一个自己的 AI 小工具', '建立对 AI 的判断力'],
  },
  voice: {
    tone: { like: ['轻松', '口语化', '有梗'], avoid: ['营销感', '鸡汤感', '术语轰炸'] },
    writingStyle: { preferredAspects: ['第一人称', '先问后析结'], sentencePatterns: ['反差开头', '短句推进'] },
    vocabulary: { common: ['干就完了', '说白了'], banned: ['赋能', '抓手', '闭环'] },
  },
  knowledge: {
    domains: ['AI 应用开发', 'AI 工具测评', '提示词工程'],
    toolsAndSkills: ['Cursor', 'Claude', 'Python', 'Next.js'],
    strengths: ['把复杂讲简单', '动手快'],
  },
  memory: {
    pastWorks: [{ title: '普通人如何搭建第一个 AI Agent', platform: '公众号' }],
    learnings: ['故事优先于技术', '标题决定打开率'],
  },
  rules: {
    principles: ['故事优先', '不写口水文', '每个视频至少一个可实操的点'],
    likedStructures: ['反差开头 → 场景铺垫 → 原理拆解 → 实操演示'],
    likedHooks: ['「我靠 AI 干了件 XX 的事」'],
    bannedWords: ['赋能', '闭环'],
  },
}

export const ALAOS_INJECTION: InjectionSettings = {
  enabled: true,
  sections: {
    identity: true,
    positioning: true,
    audience: true,
    voice: true,
    knowledge: true,
    memory: false,
    rules: true,
  },
}

export const ALAOS_DISPLAY_NAME = '阿篓的AI篓子'
export const ALAOS_BIO = 'AI 应用独立开发者，让普通人用上、用懂 AI。'
