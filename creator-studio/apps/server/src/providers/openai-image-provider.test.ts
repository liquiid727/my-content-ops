import { describe, expect, it, vi } from 'vitest'
import { OpenAIImageProvider } from './openai-image-provider.js'

describe('OpenAIImageProvider', () => {
  it('uses configured model for generation and decodes base64 output', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const provider = new OpenAIImageProvider({ key: 'openai', apiKey: 'secret', model: 'configured-image-model', baseUrl: 'https://provider.test/v1' }, { fetch })
    const result = await provider.generateMedia('image_generation', { prompt: 'cover', config: { size: '1024x1024' } }, new AbortController().signal)
    expect(result.model).toBe('configured-image-model')
    expect(Buffer.from(result.bytes).toString()).toBe('image')
    expect(fetch).toHaveBeenCalledWith('https://provider.test/v1/images/generations', expect.objectContaining({ method: 'POST' }))
  })

  it('uses multipart edit when source images are supplied', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const provider = new OpenAIImageProvider({ key: 'openai', apiKey: 'secret', model: 'image-model' }, { fetch })
    await provider.generateMedia('image_generation', { prompt: 'edit', config: { inputImages: [{ bytes: new Uint8Array([1, 2]), mimeType: 'image/png' }] } }, new AbortController().signal)
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/images/edits', expect.objectContaining({ body: expect.any(FormData) }))
  })
})
