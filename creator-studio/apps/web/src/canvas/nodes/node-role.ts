import {
  AudioLines,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Lightbulb,
  ListTree,
  Mic,
  Send,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'

import type { ArtifactDetail } from '@creator-studio/contracts'

import type { RunSummary } from '../runtime/run-store'

export type NodeTone = 'inspiration' | 'topic' | 'structure' | 'script' | 'image' | 'audio' | 'video' | 'action'

export const NODE_TONE_CLASS: Record<NodeTone, string> = {
  inspiration: 'text-node-inspiration',
  topic: 'text-node-topic',
  structure: 'text-node-structure',
  script: 'text-node-script',
  image: 'text-node-image',
  audio: 'text-node-audio',
  video: 'text-node-video',
  action: 'text-node-action',
}

export const NODE_TONE_BAR: Record<NodeTone, string> = {
  inspiration: 'bg-node-inspiration',
  topic: 'bg-node-topic',
  structure: 'bg-node-structure',
  script: 'bg-node-script',
  image: 'bg-node-image',
  audio: 'bg-node-audio',
  video: 'bg-node-video',
  action: 'bg-node-action',
}

export const NODE_TONE_SOFT: Record<NodeTone, string> = {
  inspiration: 'bg-node-inspiration/10',
  topic: 'bg-node-topic/10',
  structure: 'bg-node-structure/10',
  script: 'bg-node-script/10',
  image: 'bg-node-image/10',
  audio: 'bg-node-audio/10',
  video: 'bg-node-video/10',
  action: 'bg-node-action/10',
}

const ROLE_TONE: Record<string, NodeTone> = {
  inspiration: 'inspiration',
  idea: 'inspiration',
  topic: 'topic',
  outline: 'structure',
  brief: 'structure',
  research: 'structure',
  title: 'structure',
  keyword: 'structure',
  script: 'script',
  article: 'script',
  cover: 'image',
  illustration: 'image',
  image: 'image',
  collection: 'image',
  voice: 'audio',
  audio: 'audio',
  video: 'video',
  publish: 'action',
  action: 'action',
}

const KIND_TONE: Record<string, NodeTone> = {
  text: 'topic',
  image: 'image',
  collection: 'image',
  audio: 'audio',
  video: 'video',
  action: 'action',
}

const ROLE_ICON: Record<string, LucideIcon> = {
  inspiration: Lightbulb,
  idea: Lightbulb,
  topic: Target,
  outline: ListTree,
  brief: ListTree,
  research: ListTree,
  title: Sparkles,
  keyword: Sparkles,
  script: Mic,
  article: FileText,
  cover: ImageIcon,
  illustration: ImageIcon,
  image: ImageIcon,
  collection: LayoutGrid,
  voice: AudioLines,
  audio: AudioLines,
  video: Clapperboard,
  publish: Send,
  action: Send,
}

const KIND_ICON: Record<string, LucideIcon> = {
  text: FileText,
  image: ImageIcon,
  collection: LayoutGrid,
  audio: AudioLines,
  video: Clapperboard,
  action: Send,
}

export const NODE_DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  TextNode: { width: 260, height: 168 },
  ImageNode: { width: 240, height: 268 },
  AudioNode: { width: 240, height: 156 },
  VideoNode: { width: 260, height: 196 },
  CollectionNode: { width: 440, height: 236 },
  ActionNode: { width: 240, height: 132 },
  RecipeNode: { width: 208, height: 108 },
}

export function nodeTone(role: string, kind = ''): NodeTone {
  return ROLE_TONE[role] ?? KIND_TONE[kind] ?? 'topic'
}

export function nodeIcon(role: string, kind = ''): LucideIcon {
  return ROLE_ICON[role] ?? KIND_ICON[kind] ?? FileText
}

/** 直接返回可渲染的 icon element（渲染期只创建 element，不创建组件，满足 react-hooks/static-components）。 */
export function nodeIconElement(role: string, kind = '', className = 'h-3.5 w-3.5') {
  return createElement(nodeIcon(role, kind), { 'aria-hidden': true, className })
}

export function roleLabelKey(role: string): string {
  return `nodeRole.${role}`
}

export function inlineText(artifact: ArtifactDetail | undefined): string {
  const ref = artifact?.currentVersion?.contentRef
  return ref?.type === 'inline' ? ref.text : ''
}

export function metadataString(artifact: ArtifactDetail | undefined, key: string): string {
  const value = artifact?.currentVersion?.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

export function artifactTitle(artifact: ArtifactDetail | undefined, role: string, fallback: string): string {
  const titled = metadataString(artifact, 'title')
  if (titled) return titled
  const firstLine = inlineText(artifact).split('\n').find((line) => line.trim())
  if (role === 'topic' && firstLine && firstLine.length <= 36) return firstLine.trim()
  return fallback
}

export function displayTitle(artifact: ArtifactDetail | undefined, role: string, fallback: string): string {
  const title = artifactTitle(artifact, role, fallback)
  const version = artifact?.currentVersion?.versionNumber
  if (version && version > 1 && (artifact?.kind === 'image' || artifact?.kind === 'collection' || role === 'cover' || role === 'script')) {
    return `${title} v${version}`
  }
  return title
}

export type CardStatus = 'draft' | 'running' | 'completed' | 'failed' | 'idle'

export function cardStatus(artifact: ArtifactDetail | undefined, run: RunSummary | undefined): CardStatus {
  if (run?.status === 'queued' || run?.status === 'running' || run?.status === 'waiting_review') return 'running'
  if (run?.status === 'failed') return 'failed'
  if (artifact?.currentVersion?.contentRef) return 'completed'
  if (run?.status === 'completed') return 'completed'
  return artifact ? 'draft' : 'idle'
}
