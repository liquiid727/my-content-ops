import { tokenize } from './tokenize.js'

const K1 = 1.5
const B = 0.75

export interface DocMeta {
  id: string
  path: string
  title: string
  excerpt: string
  content: string
  tags: string[]
  folder: string
  mtime: number
}

interface IndexedDoc {
  meta: DocMeta
  termFreqs: Map<string, number>
  length: number
}

export interface SearchResult {
  meta: DocMeta
  score: number
}

export class BM25Index {
  private docs = new Map<string, IndexedDoc>()
  private df = new Map<string, number>()
  private totalLength = 0

  add(meta: DocMeta): void {
    if (this.docs.has(meta.id)) this.remove(meta.id)

    const tokens = tokenize(meta.title + ' ' + meta.title + ' ' + meta.content)
    const termFreqs = new Map<string, number>()
    for (const t of tokens) termFreqs.set(t, (termFreqs.get(t) ?? 0) + 1)

    for (const term of termFreqs.keys()) {
      this.df.set(term, (this.df.get(term) ?? 0) + 1)
    }

    this.docs.set(meta.id, { meta, termFreqs, length: tokens.length })
    this.totalLength += tokens.length
  }

  remove(id: string): void {
    const doc = this.docs.get(id)
    if (!doc) return
    for (const term of doc.termFreqs.keys()) {
      const count = (this.df.get(term) ?? 1) - 1
      if (count <= 0) this.df.delete(term)
      else this.df.set(term, count)
    }
    this.totalLength -= doc.length
    this.docs.delete(id)
  }

  search(query: string, topK = 8): SearchResult[] {
    const queryTerms = tokenize(query)
    if (queryTerms.length === 0) return []

    const N = this.docs.size
    if (N === 0) return []

    const avgdl = this.totalLength / N
    const scores = new Map<string, number>()

    for (const term of queryTerms) {
      const df = this.df.get(term) ?? 0
      if (df === 0) continue
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)

      for (const [id, doc] of this.docs) {
        const tf = doc.termFreqs.get(term) ?? 0
        if (tf === 0) continue
        const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * doc.length / avgdl))
        scores.set(id, (scores.get(id) ?? 0) + idf * norm)
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => ({ meta: this.docs.get(id)!.meta, score }))
  }

  get size(): number {
    return this.docs.size
  }
}
