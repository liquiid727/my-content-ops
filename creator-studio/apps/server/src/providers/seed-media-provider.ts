import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

import type { GenerationProvider, GenerationRequest, GenerationResult, MediaCapability, MediaResult, ProviderCapability } from './generation-provider.js'

/** 最小 PNG 编码器：RGB 纯色图，供 Seed 图片占位。 */
function createSolidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const stride = 1 + width * 3
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
    }
  }
  const idat = deflateSync(raw, { level: 6 })

  const crc32 = (data: Buffer): number => {
    let c = 0xffffffff
    for (let i = 0; i < data.length; i += 1) c = (c >>> 8) ^ CRC_TABLE[(c ^ (data[i] ?? 0)) & 0xff]!
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'ascii')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// zlib CRC32 表（0..255）
const CRC_TABLE: number[] = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    table[n] = c >>> 0
  }
  return table
})()

/** 最小 WAV 编码器：16-bit PCM 单声道静音，供 Seed 音频占位。 */
function createSilentWav(seconds = 0.5, sampleRate = 8000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate)
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function colorFromPrompt(prompt: string): [number, number, number] {
  const digest = createHash('sha256').update(prompt).digest()
  return [digest[0] ?? 90, digest[1] ?? 140, digest[2] ?? 200]
}

/** 最小 MP4 容器：结构合法的空视频轨道（无样本帧），供 Seed 视频占位。 */
function createPlaceholderMp4(width = 640, height = 360): Buffer {
  const box = (type: string, ...payload: Buffer[]): Buffer => {
    const body = Buffer.concat(payload)
    const out = Buffer.alloc(8 + body.length)
    out.writeUInt32BE(8 + body.length, 0)
    out.write(type, 4, 'ascii')
    body.copy(out, 8)
    return out
  }
  const fullBox = (type: string, version: number, flags: number, ...payload: Buffer[]): Buffer => {
    const header = Buffer.from([version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff])
    return box(type, header, ...payload)
  }
  const u16 = (value: number): Buffer => { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b }
  const u32 = (value: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b }

  const matrix = Buffer.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const ftyp = box('ftyp', Buffer.from('isom', 'ascii'), u32(0), Buffer.from('isom', 'ascii'), Buffer.from('iso2', 'ascii'), Buffer.from('mp41', 'ascii'))

  const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x00010000), u16(0x0100), Buffer.alloc(2), Buffer.alloc(8), matrix, Buffer.alloc(24), u32(2))
  const tkhd = fullBox('tkhd', 0, 0x000007, u32(0), u32(0), u32(1), Buffer.alloc(4), u32(0), Buffer.alloc(8), u16(0), u16(0), u16(0), Buffer.alloc(2), matrix, u32(width << 16), u32(height << 16))
  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), u16(0x55c4), u16(0))
  const hdlr = fullBox('hdlr', 0, 0, u32(0), Buffer.from('vide', 'ascii'), Buffer.alloc(12), Buffer.from('VideoHandler\0', 'ascii'))
  const vmhd = fullBox('vmhd', 0, 1, u16(0), Buffer.alloc(6))
  const dref = fullBox('dref', 0, 0, u32(1), box('url ', Buffer.from([0, 0, 0, 1])))
  const dinf = box('dinf', dref)

  // avc1 样本条目 + 极简 avcC（Baseline SPS/PPS 占位）。
  const sps = Buffer.from([0x67, 0x42, 0x00, 0x1e, 0xe9, 0x80, 0x50, 0x0f, 0x42, 0x01, 0x6e, 0x18, 0x38])
  const pps = Buffer.from([0x68, 0xce, 0x38, 0x80])
  const avcC = box(
    'avcC',
    Buffer.from([1, 66, 0, 30, 0xff, 0xe1]),
    u16(sps.length),
    sps,
    Buffer.from([1]),
    u16(pps.length),
    pps,
  )
  const avc1 = box(
    'avc1',
    Buffer.alloc(6),
    u16(1),
    u16(0),
    Buffer.alloc(2),
    Buffer.alloc(12),
    u16(width),
    u16(height),
    u32(0x00480000),
    u32(0x00480000),
    Buffer.alloc(4),
    u16(1),
    Buffer.alloc(32),
    u16(0x0018),
    u16(0xffff),
    avcC,
  )
  const stsd = fullBox('stsd', 0, 0, u32(1), avc1)
  const stts = fullBox('stts', 0, 0, u32(0))
  const stsc = fullBox('stsc', 0, 0, u32(0))
  const stsz = fullBox('stsz', 0, 0, u32(0), u32(0))
  const stco = fullBox('stco', 0, 0, u32(0))
  const stbl = box('stbl', stsd, stts, stsc, stsz, stco)
  const minf = box('minf', vmhd, dinf, stbl)
  const mdia = box('mdia', mdhd, hdlr, minf)
  const trak = box('trak', tkhd, mdia)
  const moov = box('moov', mvhd, trak)
  const mdat = box('mdat', Buffer.alloc(0))
  return Buffer.concat([ftyp, moov, mdat])
}

/** 媒体能力的确定性占位 provider：产出合法 PNG/WAV/MP4 文件，落 assets/file store。 */
export class SeedMediaProvider implements GenerationProvider {
  readonly key = 'seed-media'
  readonly capabilities = new Set<ProviderCapability>(['image_generation', 'audio_generation', 'video_generation'])

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    throw new Error(`SeedMediaProvider does not support text generation (prompt: ${request.prompt.length} chars)`)
  }

  async generateMedia(capability: MediaCapability, request: GenerationRequest, signal: AbortSignal): Promise<MediaResult> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 2)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('Media generation cancelled')) }, { once: true })
    })
    if (capability === 'image_generation') {
      const [r, g, b] = colorFromPrompt(request.prompt)
      const bytes = createSolidPng(64, 64, [r, g, b])
      return { model: 'seed-image-v1', mimeType: 'image/png', bytes, width: 64, height: 64, usage: { inputUnits: request.prompt.length, outputUnits: bytes.byteLength } }
    }
    if (capability === 'audio_generation') {
      const bytes = createSilentWav()
      return { model: 'seed-audio-v1', mimeType: 'audio/wav', bytes, durationMs: 500, usage: { inputUnits: request.prompt.length, outputUnits: bytes.byteLength } }
    }
    if (capability === 'video_generation') {
      const bytes = createPlaceholderMp4()
      return { model: 'seed-video-v1', mimeType: 'video/mp4', bytes, width: 640, height: 360, durationMs: 0, usage: { inputUnits: request.prompt.length, outputUnits: bytes.byteLength } }
    }
    throw new Error(`SeedMediaProvider does not support capability ${capability}`)
  }
}
