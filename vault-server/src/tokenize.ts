const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'but',
  'with', 'by', 'from', 'this', 'that', 'are', 'was', 'be', 'as', 'not', 'have', 'has',
  '的', '了', '是', '在', '我', '他', '她', '它', '们', '这', '那', '和', '与', '及',
  '或', '但', '也', '都', '不', '就', '会', '能', '要', '可以', '一个', '一些',
])

export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const normalized = text.toLowerCase().replace(/[^一-鿿぀-ヿa-z0-9_]/g, ' ')
  const words = normalized.split(/\s+/).filter(Boolean)

  for (const word of words) {
    if (STOP_WORDS.has(word) || word.length < 2) continue

    if (/[一-鿿]/.test(word)) {
      // Chinese: unigrams + bigrams
      for (let i = 0; i < word.length; i++) {
        const ch = word[i]
        if (/[一-鿿]/.test(ch)) {
          if (!STOP_WORDS.has(ch)) tokens.push(ch)
          if (i + 1 < word.length && /[一-鿿]/.test(word[i + 1])) {
            const bigram = ch + word[i + 1]
            if (!STOP_WORDS.has(bigram)) tokens.push(bigram)
          }
        } else if (/[a-z0-9]/.test(ch)) {
          // Latin embedded in Chinese text — collect as a word
          let j = i
          while (j < word.length && /[a-z0-9_]/.test(word[j])) j++
          const latin = word.slice(i, j)
          if (latin.length >= 2 && !STOP_WORDS.has(latin)) tokens.push(latin)
          i = j - 1
        }
      }
    } else {
      // Latin / alphanumeric word
      if (word.length >= 2 && !STOP_WORDS.has(word)) tokens.push(word)
    }
  }

  return tokens
}
