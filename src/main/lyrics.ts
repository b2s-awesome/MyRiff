import fs from 'node:fs/promises'
import { dialog, type BrowserWindow } from 'electron'
import type { LyricsResult, LyricLine } from '../shared/types'

function parseTimestamp(raw: string) {
  const m = raw.match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/)
  if (!m) return null
  const seconds = Number(m[1]) * 60 + Number(m[2]) + Number((m[3] || '0').padEnd(3, '0')) / 1000
  return seconds
}
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g)]
    const lyric = raw.replace(/\[[^\]]+\]/g, '').trim()
    if (tags.length) for (const tag of tags) { const time = parseTimestamp(tag[1]); if (time !== null) lines.push({ time, text: lyric }) }
    else if (lyric && !/^\w+:/i.test(lyric)) lines.push({ time: null, text: lyric })
  }
  return lines.sort((a, b) => (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER))
}
export async function fetchLyrics(title: string, artist: string, album: string, duration: number): Promise<LyricsResult | null> {
  const qs = new URLSearchParams({ track_name: title, artist_name: artist })
  if (album) qs.set('album_name', album)
  if (duration > 0) qs.set('duration', String(Math.round(duration)))
  const response = await fetch(`https://lrclib.net/api/get?${qs}`, { headers: { 'User-Agent': 'MyRiff/0.1.0 (desktop music player)' }, signal: AbortSignal.timeout(12_000) }).catch(() => null)
  if (!response?.ok) {
    const search = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, { headers: { 'User-Agent': 'MyRiff/0.1.0' }, signal: AbortSignal.timeout(12_000) }).catch(() => null)
    if (!search?.ok) return null
    const results = await search.json() as any[]
    const found = results?.[0]
    if (!found) return null
    const synced = String(found.syncedLyrics || '')
    const plain = String(found.plainLyrics || '')
    const lines = synced ? parseLrc(synced) : plain.split(/\r?\n/).filter(Boolean).map(text => ({ time: null, text }))
    return { synced: Boolean(synced), lines, provider: 'LRCLIB', source: found.id ? `https://lrclib.net` : undefined }
  }
  const result = await response.json() as any
  const synced = String(result.syncedLyrics || '')
  const plain = String(result.plainLyrics || '')
  return { synced: Boolean(synced), lines: synced ? parseLrc(synced) : plain.split(/\r?\n/).filter(Boolean).map(text => ({ time: null, text })), provider: 'LRCLIB', source: 'https://lrclib.net' }
}
export async function chooseAndParseLrc(parent?: BrowserWindow | null) {
  const options = { title: 'Import LRC lyrics', properties: ['openFile'] as Array<'openFile'>, filters: [{ name: 'Lyrics', extensions: ['lrc', 'txt'] }] }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  const content = await fs.readFile(result.filePaths[0], 'utf8')
  return { lines: parseLrc(content), path: result.filePaths[0], synced: /\[\d{1,2}:\d{2}/.test(content) }
}
