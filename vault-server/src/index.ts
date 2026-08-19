import { serve } from '@hono/node-server'
import { watch } from 'chokidar'
import { join, relative } from 'node:path'
import { BM25Index } from './bm25.js'
import { scanVault, parseVaultFile } from './vault.js'
import { createApp } from './server.js'

const VAULT_PATH = process.env.VAULT_PATH ?? join(process.env.HOME ?? '', 'Journal/personal_journey')
const PORT = Number(process.env.PORT ?? 3721)

console.log(`[vault-server] Vault: ${VAULT_PATH}`)

const index = new BM25Index()

// --- Initial index build ---
console.log('[vault-server] Scanning vault...')
const t0 = Date.now()
const docs = await scanVault({ vaultPath: VAULT_PATH })
for (const doc of docs) index.add(doc)
console.log(`[vault-server] Indexed ${index.size} notes in ${Date.now() - t0}ms`)

// --- File watcher for live updates ---
const watcher = watch(`${VAULT_PATH}/**/*.md`, {
  ignoreInitial: true,
  ignored: /(\.obsidian|\.trash|\.git|assets|dist|node_modules)/,
  awaitWriteFinish: { stabilityThreshold: 800 },
})

watcher.on('add', async (filePath: string) => {
  const doc = await parseVaultFile(filePath, VAULT_PATH)
  if (doc) { index.add(doc); console.log(`[+] ${doc.path}`) }
})

watcher.on('change', async (filePath: string) => {
  const doc = await parseVaultFile(filePath, VAULT_PATH)
  if (doc) { index.add(doc); console.log(`[~] ${doc.path}`) }
})

watcher.on('unlink', (filePath: string) => {
  const rel = relative(VAULT_PATH, filePath)
  index.remove(rel)
  console.log(`[-] ${rel}`)
})

// --- HTTP server ---
const app = createApp(index, VAULT_PATH)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[vault-server] Listening on http://localhost:${PORT}`)
})
