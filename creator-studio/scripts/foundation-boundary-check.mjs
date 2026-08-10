import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const scanRoots = ['apps', 'packages']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json'])
const forbidden = ['gpt_image_playground/', 'gpt_image_playground\\']
const violations = []

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { await scan(path); continue }
    if (!sourceExtensions.has(extname(entry.name))) continue
    const content = await readFile(path, 'utf8')
    if (forbidden.some((value) => content.includes(value))) violations.push(relative(root, path))
  }
}

for (const directory of scanRoots) await scan(join(root, directory))
if (violations.length > 0) throw new Error(`Legacy gpt_image_playground dependency found in: ${violations.join(', ')}`)
console.log('Creator Studio source boundary: clean')
