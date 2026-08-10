import { chmod, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'

export class SecretStore {
  private readonly path: string
  constructor(dataDirectory: string) { this.path = join(dataDirectory, 'secrets.json') }
  async set(ref: string, value: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const values = await this.readAll()
    values[ref] = value
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(values), { mode: 0o600 })
    await rename(temporary, this.path)
    await chmod(this.path, 0o600)
  }
  async has(ref: string | null): Promise<boolean> { return ref !== null && Object.hasOwn(await this.readAll(), ref) }
  private async readAll(): Promise<Record<string, string>> {
    try { return JSON.parse(await readFile(this.path, 'utf8')) as Record<string, string> } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}
      throw error
    }
  }
}

