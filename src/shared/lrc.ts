import type { LyricLine, LyricWord } from './types'

function parseTimestamp(raw: string): number | null {
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2]) + Number((match[3] || '0').padEnd(3, '0')) / 1000
}

/** Parse standard LRC and Enhanced LRC with absolute word start times. */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const lineTags = [...rawLine.matchAll(/\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g)]
    const body = rawLine.replace(/\[[^\]]+\]/g, '').trim()
    if (!body || (!lineTags.length && /^\w+:/i.test(body))) continue

    const wordTags = [...body.matchAll(/<(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)>/g)]
    const words: LyricWord[] = []
    for (let i = 0; i < wordTags.length; i++) {
      const tag = wordTags[i]
      const time = parseTimestamp(tag[1])
      if (time === null) continue
      const start = (tag.index ?? 0) + tag[0].length
      const end = i + 1 < wordTags.length ? (wordTags[i + 1].index ?? body.length) : body.length
      const prefix = i === 0 ? body.slice(0, tag.index ?? 0) : ''
      words.push({ time, text: prefix + body.slice(start, end) })
    }
    const cleanText = body.replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim()
    if (lineTags.length) {
      for (const tag of lineTags) {
        const time = parseTimestamp(tag[1])
        if (time !== null) lines.push({ time, text: cleanText, ...(words.length ? { words: words.map(word => ({ ...word })) } : {}) })
      }
    } else if (cleanText) {
      lines.push({ time: words[0]?.time ?? null, text: cleanText, ...(words.length ? { words } : {}) })
    }
  }
  return lines.sort((a, b) => (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER))
}
