import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

import type { KnowledgeSource } from '@creator-studio/contracts'

import { HttpError } from '../http/errors.js'
import type { CommandRunner } from './command-runner.js'
import { runCommand } from './command-runner.js'

export const LOCAL_MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown', '.mdx': 'text/markdown', '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.heic': 'image/heic',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
}

export const SUPPORTED_EXTENSIONS = new Set(Object.keys(LOCAL_MIME_TYPES))

export function localResourceKind(extension: string): KnowledgeSource['kind'] {
  if (['.csv', '.tsv', '.xlsx'].includes(extension)) return 'spreadsheet'
  if (['.png', '.jpg', '.jpeg', '.webp', '.heic'].includes(extension)) return 'image'
  if (['.mp3', '.m4a', '.wav', '.aac', '.flac'].includes(extension)) return 'audio'
  if (['.mp4', '.mov', '.mkv', '.webm'].includes(extension)) return 'video'
  return 'document'
}

function cleanXml(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/?>/g, '\t')
    .replace(/<w:br\s*\/?>|<a:br\s*\/?>/g, '\n')
    .replace(/<\/w:p>|<\/a:p>|<\/row>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function cleanHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}

async function requireCommand(runner: CommandRunner, command: string, args: string[], message: string): Promise<string> {
  let result
  try { result = await runner(command, args, { timeoutMs: 5 * 60_000 }) } catch { throw new HttpError({ status: 503, code: 'CONNECTOR_UNAVAILABLE', message }) }
  if (result.exitCode !== 0) throw new HttpError({ status: 422, code: 'RESOURCE_EXTRACTION_FAILED', message })
  return result.stdout.trim()
}

async function officeXml(path: string, pattern: string, runner: CommandRunner): Promise<string> {
  return cleanXml(await requireCommand(runner, 'unzip', ['-p', path, pattern], '无法提取 Office 文档，请确认文件未损坏。'))
}

async function transcribe(path: string, runner: CommandRunner): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'creator-studio-media-'))
  const wav = join(directory, 'audio.wav')
  try {
    await requireCommand(runner, 'ffmpeg', ['-nostdin', '-y', '-i', path, '-ar', '16000', '-ac', '1', wav], '本地媒体处理需要 ffmpeg。请先在设置中安装媒体工具。')
    const model = process.env.CREATOR_STUDIO_WHISPER_MODEL
    if (!model) throw new HttpError({ status: 503, code: 'CONNECTOR_UNAVAILABLE', message: '尚未配置本地 Whisper 模型，请在设置中安装媒体工具。' })
    await requireCommand(runner, 'whisper-cli', ['-m', model, '-f', wav, '-otxt', '-of', join(directory, 'transcript')], '本地转写需要 whisper-cli 和已下载的模型。')
    return readFile(join(directory, 'transcript.txt'), 'utf8')
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

export interface ExtractedLocalResource {
  title: string
  kind: KnowledgeSource['kind']
  mimeType: string
  text: string
  sourceVersion: string
  modifiedAt: number
  metadata: Record<string, unknown>
}

export async function extractLocalResource(path: string, runner: CommandRunner = runCommand): Promise<ExtractedLocalResource> {
  const extension = extname(path).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw new HttpError({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: `暂不支持 ${extension || '未知'} 文件。` })
  const info = await stat(path)
  if (!info.isFile()) throw new HttpError({ status: 422, code: 'VALIDATION_FAILED', message: '资源必须是文件。' })
  if (info.size > 2 * 1024 * 1024 * 1024) throw new HttpError({ status: 413, code: 'FILE_TOO_LARGE', message: '外部资源超过 2 GB 限制。' })

  let text: string
  if (['.md', '.mdx', '.txt', '.csv', '.tsv'].includes(extension)) text = await readFile(path, 'utf8')
  else if (['.html', '.htm'].includes(extension)) text = cleanHtml(await readFile(path, 'utf8'))
  else if (extension === '.pdf') text = await requireCommand(runner, 'pdftotext', [path, '-'], '本地 PDF 提取需要 pdftotext。请先在设置中安装媒体工具。')
  else if (extension === '.docx') text = await officeXml(path, 'word/document.xml', runner)
  else if (extension === '.pptx') text = await officeXml(path, 'ppt/slides/slide*.xml', runner)
  else if (extension === '.xlsx') text = await officeXml(path, 'xl/*.xml', runner)
  else if (localResourceKind(extension) === 'image') text = await requireCommand(runner, 'tesseract', [path, 'stdout', '-l', 'chi_sim+eng'], '本地图片 OCR 需要 Tesseract 中英文模型。请先在设置中安装媒体工具。')
  else text = await transcribe(path, runner)

  return {
    title: basename(path, extension), kind: localResourceKind(extension), mimeType: LOCAL_MIME_TYPES[extension] ?? 'application/octet-stream', text,
    sourceVersion: `${Math.trunc(info.mtimeMs)}:${info.size}`, modifiedAt: info.mtimeMs,
    metadata: { extension, size: info.size },
  }
}
