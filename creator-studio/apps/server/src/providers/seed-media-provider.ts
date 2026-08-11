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

/** 媒体能力的确定性占位 provider：产出合法 PNG/WAV 文件，落 assets/file store。 */
export class SeedMediaProvider implements GenerationProvider {
  readonly key = 'seed-media'
  readonly capabilities = new Set<ProviderCapability>(['image_generation', 'audio_generation'])

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
    throw new Error(`SeedMediaProvider does not support capability ${capability}`)
  }
}
