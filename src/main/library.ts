import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseFile } from 'music-metadata'
import type { Track } from '../shared/types'
import { addArtwork, getArtworkDir, upsertTrack, listTracks } from './db'

const EXTENSIONS = new Set(['.flac', '.mp3', '.wav', '.ogg', '.m4a', '.opus', '.aac', '.aiff', '.wma'])
const mimeExtension: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }

async function walk(folder: string, found: string[]) {
  let entries
  try { entries = await fs.readdir(folder, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || ['node_modules', '$RECYCLE.BIN', 'System Volume Information'].includes(entry.name)) continue
    const full = path.join(folder, entry.name)
    try {
      if (entry.isDirectory()) await walk(full, found)
      else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(full)
    } catch { /* inaccessible entries are skipped */ }
  }
}

async function cacheArtwork(pictures: { data: Uint8Array; format: string }[] | undefined): Promise<string | null> {
  if (!pictures?.length) return null
  const picture = pictures.find(p => p.data?.length && /^image\/(jpeg|png|webp|gif)$/i.test(p.format))
  if (!picture) return null
  const key = crypto.createHash('sha1').update(picture.data).digest('hex')
  const ext = mimeExtension[picture.format.toLowerCase()] ?? '.img'
  const filePath = path.join(getArtworkDir(), `${key}${ext}`)
  try { await fs.access(filePath) } catch { await fs.writeFile(filePath, picture.data) }
  addArtwork(key, filePath, picture.format.toLowerCase())
  return key
}

export async function scanMusicFolder(root: string, onProgress?: (done: number, total: number, current: string) => void) {
  const stat = await fs.stat(root).catch(() => null)
  if (!stat?.isDirectory()) throw new Error('Choose a folder that exists and can be read.')
  const paths: string[] = []
  await walk(root, paths)
  const seen: string[] = []
  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i]
    try {
      const metadata = await parseFile(filePath, { duration: true, skipCovers: false })
      const common = metadata.common
      const key = await cacheArtwork(common.picture)
      const title = common.title?.trim() || path.basename(filePath, path.extname(filePath))
      const t: Omit<Track, 'artworkUrl' | 'source'> & { artworkKey?: string | null } = {
        path: filePath, title, artist: common.artist || common.albumartist || '', album: common.album || '',
        trackNo: common.track.no ?? null, genre: common.genre?.[0] || '', year: common.year ?? null,
        duration: metadata.format.duration || 0, folder: path.dirname(filePath), addedAt: Date.now(), artworkKey: key, fileSize: (await fs.stat(filePath)).size
      }
      upsertTrack(t); seen.push(filePath)
    } catch {
      // Keep the scan resilient: a corrupt tag or unreadable file should not stop the folder scan.
      try {
        const fallback = path.basename(filePath, path.extname(filePath))
        upsertTrack({ path: filePath, title: fallback, artist: '', album: '', trackNo: null, genre: '', year: null, duration: 0, folder: path.dirname(filePath), addedAt: Date.now(), artworkKey: null, fileSize: (await fs.stat(filePath).catch(() => ({ size: 0 }))).size })
        seen.push(filePath)
      } catch { /* the file may have disappeared during the scan */ }
    }
    onProgress?.(i + 1, paths.length, path.basename(filePath))
  }
  return { scanned: paths.length, tracks: listTracks(), root, presentPaths: seen }
}

import { watch as watchFs, type FSWatcher } from 'chokidar'
import { createReadStream } from 'node:fs'

const activeWatchers = new Map<string, FSWatcher>()
const watchDebounce = new Map<string, NodeJS.Timeout>()
export async function watchMusicFolder(root: string, onChange: () => void) {
  const normalized = path.resolve(root)
  const old = activeWatchers.get(normalized)
  if (old) await old.close()
  const watcher = watchFs(normalized, {
    ignoreInitial: true, persistent: true, followSymlinks: false,
    ignored: /(^|[\\/])(?:\.git|node_modules|\.cache|\$RECYCLE\.BIN|System Volume Information)([\\/]|$)/,
    awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 150 }
  })
  const schedule = () => {
    const existing = watchDebounce.get(normalized)
    if (existing) clearTimeout(existing)
    watchDebounce.set(normalized, setTimeout(() => { watchDebounce.delete(normalized); onChange() }, 1400))
  }
  watcher.on('add', filename => { if (filename && EXTENSIONS.has(path.extname(filename).toLowerCase())) schedule() })
  watcher.on('change', filename => { if (filename && EXTENSIONS.has(path.extname(filename).toLowerCase())) schedule() })
  watcher.on('unlink', filename => { if (filename && EXTENSIONS.has(path.extname(filename).toLowerCase())) schedule() })
  watcher.on('error', error => console.warn('MyRiff library watcher error:', error))
  activeWatchers.set(normalized, watcher)
  return async () => { const timer = watchDebounce.get(normalized); if (timer) clearTimeout(timer); watchDebounce.delete(normalized); await watcher.close(); activeWatchers.delete(normalized) }
}

export async function findDuplicateTracks(mode: 'hash' | 'metadata' | 'both' = 'both') {
  const tracks = listTracks()
  const groups: import('../shared/types').DuplicateGroup[] = []
  const seen = new Map<string, Track[]>()
  if (mode === 'hash' || mode === 'both') {
    for (const track of tracks) {
      try {
        const hash = crypto.createHash('sha256')
        await new Promise<void>((resolve, reject) => {
          const input = createReadStream(track.path)
          input.on('data', chunk => hash.update(chunk))
          input.on('error', reject)
          input.on('end', resolve)
        })
        const key = hash.digest('hex')
        const collection = seen.get(key) ?? []; collection.push(track); seen.set(key, collection)
      } catch { /* missing/locked files are skipped, not fatal to the whole report */ }
    }
    for (const [signature, matches] of seen) if (matches.length > 1) groups.push({ kind: 'identical-file', signature, tracks: matches.map(t => ({ path: t.path, title: t.title, artist: t.artist, album: t.album, duration: t.duration, fileSize: t.fileSize })) })
  }
  if (mode === 'metadata' || mode === 'both') {
    const normalize = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
    const map = new Map<string, Track[]>()
    for (const track of tracks) {
      if (!track.title.trim() || !track.artist.trim()) continue
      const key = `${normalize(track.artist)}|${normalize(track.title)}|${Math.round(track.duration / 3)}`
      const collection = map.get(key) ?? []; collection.push(track); map.set(key, collection)
    }
    for (const [signature, matches] of map) if (matches.length > 1) {
      const unique = matches.filter((t, i, all) => all.findIndex(x => x.path === t.path) === i)
      if (unique.length > 1 && !groups.some(g => g.kind === 'identical-file' && unique.every(t => g.tracks.some(d => d.path === t.path))))
        groups.push({ kind: 'metadata-match', signature, tracks: unique.map(t => ({ path: t.path, title: t.title, artist: t.artist, album: t.album, duration: t.duration, fileSize: t.fileSize })) })
    }
  }
  return groups
}
