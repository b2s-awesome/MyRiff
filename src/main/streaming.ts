import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import fsSync from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AppSettings, DownloadFormat, DownloadProgress, SearchResult, StreamSource } from '../shared/types'
import { addDownload } from './db'

const ALLOWED_HOSTS = ['youtube.com', 'youtu.be', 'music.youtube.com', 'soundcloud.com', 'm.soundcloud.com']
function validateUrl(value: string) {
  let u: URL
  try { u = new URL(value) } catch { throw new Error('Enter a valid http(s) URL.') }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are supported.')
  if (!ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) throw new Error('This URL is not from YouTube, YouTube Music, or SoundCloud.')
  return u.toString()
}
function bin(settings: AppSettings) { return settings.ytDlpPath?.trim() || 'yt-dlp' }

// yt-dlp enables Deno by default, but Node must be selected explicitly.
// Deno 2.3+ is preferred; if it is unavailable, use the Node 22+ runtime installed by setup.
let cachedJsRuntimeArgs: string[] | undefined
function jsRuntimeArgs(): string[] {
  if (cachedJsRuntimeArgs) return cachedJsRuntimeArgs
  const probe = (command: string, args: string[]) => {
    try {
      const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 2500 })
      if (result.error || result.status !== 0) return ''
      return `${result.stdout || ''}\n${result.stderr || ''}`.trim()
    } catch { return '' }
  }
  const denoText = probe('deno', ['--version'])
  const deno = denoText.match(/\bdeno\s+(\d+)\.(\d+)\.(\d+)/i)
  if (deno) {
    const major = Number(deno[1]); const minor = Number(deno[2])
    if (major > 2 || (major === 2 && minor >= 3)) {
      cachedJsRuntimeArgs = [] // Deno is yt-dlp's default runtime
      return cachedJsRuntimeArgs
    }
  }
  const nodeText = probe('node', ['--version'])
  const node = nodeText.match(/\bv?(\d+)\./i)
  if (node && Number(node[1]) >= 22) {
    cachedJsRuntimeArgs = ['--js-runtimes', 'node']
    return cachedJsRuntimeArgs
  }
  // Leave runtime selection to yt-dlp so it can still report its native diagnostic.
  cachedJsRuntimeArgs = []
  return cachedJsRuntimeArgs
}
function runJson(executable: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { windowsHide: true, shell: false })
    let stdout = ''; let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > 32_000_000) proc.kill() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', e => reject(new Error(`Could not start yt-dlp (${executable}). Install yt-dlp or set its path in Settings. ${e.message}`)))
    proc.on('close', code => {
      if (code !== 0 && !stdout.trim()) return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`))
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error(`yt-dlp returned invalid JSON. ${stderr.slice(-500)}`)) }
    })
  })
}
export async function searchStreams(query: string, source: StreamSource, settings: AppSettings): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const prefix = source === 'SoundCloud' ? 'scsearch12:' : 'ytsearch12:'
  const json = await runJson(bin(settings), [...jsRuntimeArgs(), '--dump-single-json', '--flat-playlist', '--no-warnings', '--skip-download', '--ignore-errors', `${prefix}${q}`])
  const entries = Array.isArray(json.entries) ? json.entries : [json]
  return entries.filter((x: any) => x && (x.url || x.webpage_url || x.id)).slice(0, 12).map((x: any) => {
    const webpageUrl = x.webpage_url || x.original_url || (source === 'SoundCloud' ? x.url : `https://www.youtube.com/watch?v=${x.id}`)
    return { id: String(x.id || webpageUrl), title: x.title || 'Unknown title', artist: x.uploader || x.artist || x.channel || '', album: x.album || '', duration: Number(x.duration || 0), webpageUrl, thumbnail: x.thumbnail || null, source }
  })
}

let streamServer: Server | null = null
let streamPort = 0
const liveChildren = new Set<ChildProcess>()
export async function startStreamServer(settingsGetter: () => AppSettings) {
  if (streamServer && streamPort) return streamPort
  streamServer = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1')
    if (u.pathname !== '/stream' || req.method !== 'GET') { res.writeHead(404).end(); return }
    let url: string
    try { url = validateUrl(u.searchParams.get('url') || '') } catch { res.writeHead(400).end('Invalid stream URL'); return }
    const settings = settingsGetter()
    const child = spawn(bin(settings), [...jsRuntimeArgs(), '--no-warnings', '--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', '-', url], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    liveChildren.add(child)
    let began = false
    child.stdout.on('data', chunk => { if (!began) { began = true; res.writeHead(200, { 'Content-Type': 'audio/webm', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' }) } res.write(chunk) })
    child.stderr.on('data', () => { /* diagnostics stay out of the media response */ })
    child.on('error', () => { if (!began && !res.headersSent) res.writeHead(502).end('Could not start yt-dlp. Check its path in Settings.'); else res.end() })
    child.on('close', code => { liveChildren.delete(child); if (!res.writableEnded) { if (!began) res.writeHead(code === 0 ? 204 : 502); res.end() } })
    req.on('close', () => { if (!child.killed) child.kill('SIGTERM') })
  })
  await new Promise<void>((resolve, reject) => {
    streamServer!.once('error', reject)
    streamServer!.listen(0, '127.0.0.1', () => { const a = streamServer!.address(); if (a && typeof a === 'object') streamPort = a.port; resolve() })
  })
  return streamPort
}
export function streamUrl(url: string) {
  if (!streamPort) throw new Error('Streaming service is not ready yet.')
  return `http://127.0.0.1:${streamPort}/stream?url=${encodeURIComponent(validateUrl(url))}`
}
export function stopStreamServer() {
  for (const child of liveChildren) child.kill('SIGTERM')
  liveChildren.clear(); streamServer?.close(); streamServer = null; streamPort = 0
}

export type RemotePlaylistPreview = {
  title: string
  uploader: string
  total: number
  entries: Array<{ id: string; title: string; artist: string; duration: number; thumbnail: string | null; url: string; localPath: string | null }>
  truncated: boolean
}

export async function previewRemotePlaylist(urlInput: string, settings: AppSettings, localTracks: { path: string; title: string; artist: string; duration?: number }[]): Promise<RemotePlaylistPreview> {
  let url: URL
  try { url = new URL(urlInput) } catch { throw new Error('Paste a valid public playlist URL.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public http(s) playlist URLs are supported.')
  const json = await runJson(bin(settings), [...jsRuntimeArgs(), '--dump-single-json', '--flat-playlist', '--no-warnings', '--skip-download', '--ignore-errors', '--playlist-end', '500', url.toString()])
  const entries = Array.isArray(json.entries) ? json.entries : (json.title ? [json] : [])
  if (!entries.length) throw new Error('No playlist entries were returned. The playlist may be private, unsupported, empty, or unavailable to yt-dlp.')
  const normalize = (value: unknown) => String(value ?? '').toLocaleLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  const mapped = entries.map((entry: any, index: number) => {
    const title = String(entry.title || entry.track || `Untitled item ${index + 1}`).trim()
    const artist = String(entry.artist || entry.uploader || entry.channel || entry.creator || '').trim()
    const target = normalize(`${artist} ${title}`)
    let best: { path: string; score: number } | null = null
    for (const track of localTracks) {
      const key = normalize(`${track.artist} ${track.title}`)
      const titleMatch = normalize(track.title) === normalize(title)
      const overlap = target.split(' ').filter(word => word.length > 2 && key.split(' ').includes(word)).length / Math.max(1, target.split(' ').filter(word => word.length > 2).length)
      const score = key === target ? 1 : titleMatch ? 0.9 : overlap
      if (!best || score > best.score) best = { path: track.path, score }
    }
    const entryUrl = entry.webpage_url || entry.original_url || entry.url || (entry.id && /youtube|youtu\.be|soundcloud/i.test(url.hostname) ? `https://www.youtube.com/watch?v=${entry.id}` : url.toString())
    const thumbs = Array.isArray(entry.thumbnails) ? entry.thumbnails : []
    return { id: String(entry.id || entryUrl || index), title, artist, duration: Number(entry.duration || 0), thumbnail: entry.thumbnail || thumbs.at(-1)?.url || null, url: String(entryUrl), localPath: best && best.score >= 0.76 ? best.path : null }
  })
  return { title: String(json.title || json.playlist_title || 'Playlist preview'), uploader: String(json.uploader || json.channel || ''), total: Number(json.playlist_count || json.n_entries || entries.length), entries: mapped, truncated: entries.length >= 500 }
}

export async function importRemotePlaylist(urlInput: string, name: string, settings: AppSettings, localTracks: { path: string; title: string; artist: string }[], create: (name: string) => number, add: (id: number, paths: string[]) => void) {
  let url: URL
  try { url = new URL(urlInput) } catch { throw new Error('Enter a valid public playlist URL.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public http(s) playlist URLs can be imported.')
  // yt-dlp covers public YouTube, YouTube Music and SoundCloud playlists when the current extractor supports them.
  const json = await runJson(bin(settings), [...jsRuntimeArgs(), '--dump-single-json', '--flat-playlist', '--no-warnings', '--skip-download', '--ignore-errors', '--playlist-end', '500', url.toString()])
  const entries = Array.isArray(json.entries) ? json.entries : []
  if (!entries.length) throw new Error('No playlist entries were returned. This provider may require API access or may not be supported by your yt-dlp version.')
  const normalize = (s: string) => s.toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  const matched: string[] = []; const missing: string[] = []
  for (const entry of entries) {
    const title = String(entry.title || '').trim()
    const artist = String(entry.artist || entry.uploader || entry.channel || '').trim()
    if (!title) continue
    const target = normalize(`${artist} ${title}`)
    let best: { path: string; score: number } | null = null
    for (const t of localTracks) {
      const key = normalize(`${t.artist} ${t.title}`)
      if (key === target || normalize(t.title) === normalize(title)) { best = { path: t.path, score: key === target ? 1 : 0.9 }; break }
      const overlap = target.split(' ').filter(w => w.length > 2 && key.split(' ').includes(w)).length / Math.max(1, target.split(' ').filter(w => w.length > 2).length)
      if (overlap > (best?.score ?? 0.72)) best = { path: t.path, score: overlap }
    }
    if (best && best.score >= 0.72 && !matched.includes(best.path)) matched.push(best.path)
    else missing.push(artist ? `${artist} — ${title}` : title)
  }
  const playlistId = create(name.trim() || json.title || 'Imported playlist')
  add(playlistId, matched)
  return { playlistId, playlistName: name.trim() || json.title || 'Imported playlist', total: entries.length, found: matched.length, missing };
}

const activeDownloads = new Map<string, ChildProcess>()
const cancelledDownloads = new Set<string>()
const pausedDownloads = new Set<string>()
const pendingDownloads = new Map<string, () => void>()
const queuedProgress = new Map<string, (progress: DownloadProgress) => void>()
const downloadSettings = new Map<string, { concurrency: number; title: string; url: string; format: DownloadFormat }>()

function pumpDownloadQueue() {
  while (pendingDownloads.size) {
    const [id, launch] = pendingDownloads.entries().next().value as [string, () => void]
    const opts = downloadSettings.get(id)
    const limit = Math.max(1, Math.min(4, opts?.concurrency ?? 2))
    if (activeDownloads.size >= limit) return
    pendingDownloads.delete(id)
    launch()
  }
}

export function pauseDownload(id: string) {
  const queued = pendingDownloads.delete(id)
  if (queued) {
    const opts = downloadSettings.get(id); const onProgress = queuedProgress.get(id)
    if (opts && onProgress) onProgress({ id, status: 'paused', title: opts.title, percent: 0, speed: '', eta: '', url: opts.url, format: opts.format, error: 'Paused before the download started. Resume to start it again.' })
    queuedProgress.delete(id); downloadSettings.delete(id); pumpDownloadQueue(); return true
  }
  const proc = activeDownloads.get(id)
  if (!proc) return false
  pausedDownloads.add(id)
  try { proc.kill('SIGTERM') } catch { /* process may have exited */ }
  return true
}

export function cancelDownload(id: string) {
  const queued = pendingDownloads.delete(id)
  if (queued) {
    const opts = downloadSettings.get(id); const onProgress = queuedProgress.get(id)
    if (opts && onProgress) onProgress({ id, status: 'cancelled', title: opts.title, percent: 0, speed: '', eta: '', url: opts.url, format: opts.format, error: 'Cancelled before the download started.' })
    queuedProgress.delete(id); downloadSettings.delete(id); pumpDownloadQueue(); return true
  }
  const proc = activeDownloads.get(id)
  if (!proc) return false
  cancelledDownloads.add(id)
  try { proc.kill('SIGTERM') } catch { /* process may have exited */ }
  return true
}

export function startDownload(
  urlInput: string,
  format: DownloadFormat,
  settings: AppSettings,
  onProgress: (progress: DownloadProgress) => void,
  onFinished: (path: string, title: string, id: string, url: string, format: string) => void,
  includePlaylist = false
) {
  const url = validateUrl(urlInput)
  const id = randomUUID()
  const outputDir = path.resolve(settings.downloadFolder?.trim() || path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), 'Music', 'MyRiff Downloads'))
  fsSync.mkdirSync(outputDir, { recursive: true })
  const outTemplate = path.join(outputDir, '%(title).160B [%(id)s].%(ext)s')
  const archiveFile = path.join(outputDir, `.myriff-${format}-download-archive.txt`)
  let latestTitle = includePlaylist ? 'Playlist queued' : url
  downloadSettings.set(id, { concurrency: Math.max(1, Math.min(4, settings.downloadConcurrency || 2)), title: latestTitle, url, format })
  queuedProgress.set(id, onProgress)

  const launch = () => {
    const args = [
      ...jsRuntimeArgs(), '--no-warnings', '--newline', '--continue', '--no-overwrites',
      ...(includePlaylist ? ['--yes-playlist', '--download-archive', archiveFile] : ['--no-playlist']),
      '--retries', String(Math.max(0, Math.min(10, settings.downloadRetries ?? 3))),
      '--fragment-retries', String(Math.max(0, Math.min(10, settings.downloadRetries ?? 3))),
      '-x', '--audio-format', format, '--audio-quality', settings.downloadQuality || '0',
      '--embed-metadata', '--embed-thumbnail',
      '--progress-template', 'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s',
      '--print', 'after_move:filepath', '-o', outTemplate, url
    ]
    let proc: ChildProcess
    try { proc = spawn(bin(settings), args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) {
      queuedProgress.delete(id); downloadSettings.delete(id)
      onProgress({ id, status: 'error', title: latestTitle, percent: 0, speed: '', eta: '', url, format, error: error instanceof Error ? error.message : String(error) })
      pumpDownloadQueue(); return
    }
    activeDownloads.set(id, proc); queuedProgress.delete(id)
    let stdoutBuffer = ''; let stderrBuffer = ''; let stdout = ''; let stderr = ''; let currentPercent = 0
    let currentSpeed = ''; let currentEta = ''; let playlistTotal = 0; let playlistCompleted = 0
    const outputRows: Array<{ filePath: string; title: string }> = []
    const seenPaths = new Set<string>()
    const parseLines = (text: string, isStdout: boolean) => {
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue
        if (line.startsWith('download:')) {
          const parts = line.slice(9).split('|')
          currentPercent = Number((parts[0] || '').replace(/[^0-9.]/g, '')) || 0
          currentSpeed = (parts[1] || '').trim(); currentEta = (parts[2] || '').trim(); latestTitle = (parts[3] || latestTitle).trim()
          const opt = downloadSettings.get(id); if (opt) opt.title = latestTitle
          onProgress({ id, status: 'downloading', title: latestTitle, percent: currentPercent, speed: currentSpeed, eta: currentEta, url, format, completed: playlistCompleted, total: playlistTotal || undefined })
        }
        const itemMatch = line.match(/Downloading item\s+(\d+)\s+of\s+(\d+)/i)
        if (itemMatch) { playlistCompleted = Math.max(playlistCompleted, Number(itemMatch[1]) - 1); playlistTotal = Number(itemMatch[2]) }
        if (isStdout && path.isAbsolute(line) && /\.(mp3|flac|opus|m4a|wav|ogg|aac)$/i.test(line) && !seenPaths.has(line)) {
          seenPaths.add(line); outputRows.push({ filePath: line, title: latestTitle })
          if (includePlaylist) playlistCompleted = Math.min(playlistTotal || Number.MAX_SAFE_INTEGER, playlistCompleted + 1)
          onProgress({ id, status: 'downloading', title: latestTitle, percent: currentPercent, speed: currentSpeed, eta: currentEta, url, format, completed: playlistCompleted, total: playlistTotal || undefined })
        }
      }
    }
    proc.stdout?.on('data', (chunk: Buffer) => { const value = chunk.toString(); stdout = (stdout + value).slice(-1000000); stdoutBuffer += value; const lines = stdoutBuffer.split(/\r?\n/); stdoutBuffer = lines.pop() || ''; parseLines(lines.join('\n'), true) })
    proc.stderr?.on('data', (chunk: Buffer) => { const value = chunk.toString(); stderr = (stderr + value).slice(-12000); stderrBuffer += value; const lines = stderrBuffer.split(/\r?\n/); stderrBuffer = lines.pop() || ''; parseLines(lines.join('\n'), false) })
    proc.on('error', error => {
      activeDownloads.delete(id); downloadSettings.delete(id)
      const paused = pausedDownloads.delete(id)
      onProgress({ id, status: paused ? 'paused' : 'error', title: latestTitle, percent: currentPercent, speed: '', eta: '', url, format, error: paused ? 'Paused. Resume to continue from the retained partial download.' : `Could not start yt-dlp: ${error.message}` })
      pumpDownloadQueue()
    })
    proc.on('close', code => {
      activeDownloads.delete(id)
      downloadSettings.delete(id)
      if (pausedDownloads.delete(id)) {
        onProgress({ id, status: 'paused', title: latestTitle, percent: currentPercent, speed: '', eta: '', url, format, completed: playlistCompleted, total: playlistTotal || undefined, error: 'Paused. Resume to continue from the retained partial download.' })
        pumpDownloadQueue(); return
      }
      if (cancelledDownloads.delete(id)) {
        onProgress({ id, status: 'cancelled', title: latestTitle, percent: currentPercent, speed: '', eta: '', url, format, completed: playlistCompleted, total: playlistTotal || undefined, error: 'Cancelled. Retrying the same URL can resume partial files.' })
        pumpDownloadQueue(); return
      }
      if (stdoutBuffer.trim()) parseLines(stdoutBuffer, true)
      if (stderrBuffer.trim()) parseLines(stderrBuffer, false)
      if (code === 0) {
        if (!outputRows.length) {
          const matches = [...`${stderr}\n${stdout}`.matchAll(/(?:Destination|after_move:filepath|\[download\] Destination):\s*(.+)/g)]
          const candidate = matches.at(-1)?.[1]?.trim() || ''
          if (candidate && path.isAbsolute(candidate) && /\.(mp3|flac|opus|m4a|wav|ogg|aac)$/i.test(candidate)) outputRows.push({ filePath: candidate, title: latestTitle })
        }
        if (!outputRows.length && includePlaylist && /already been downloaded|download archive|has already been recorded/i.test(`${stderr}\n${stdout}`)) {
          onProgress({ id, status: 'finished', title: 'Playlist is up to date — no new tracks', percent: 100, speed: '', eta: '', url, format, completed: 0, total: 0 })
        } else if (!outputRows.length) {
          onProgress({ id, status: 'error', title: latestTitle, percent: 100, speed: '', eta: '', url, format, error: 'yt-dlp completed without reporting output files. Check the log and source availability.' })
        } else {
          outputRows.forEach((row, index) => onFinished(row.filePath, row.title || path.basename(row.filePath), index === 0 ? id : randomUUID(), url, format))
          onProgress({ id, status: 'finished', title: outputRows.length > 1 ? `${outputRows.length} tracks downloaded` : outputRows[0].title, percent: 100, speed: '', eta: '', filePath: outputRows.at(-1)?.filePath, url, format, completed: outputRows.length, total: outputRows.length })
        }
      } else {
        onProgress({ id, status: 'error', title: latestTitle, percent: currentPercent, speed: '', eta: '', url, format, completed: playlistCompleted, total: playlistTotal || undefined, error: stderr.trim().slice(-1200) || `yt-dlp exited with code ${code}` })
      }
      pumpDownloadQueue()
    })
  }
  pendingDownloads.set(id, launch)
  onProgress({ id, status: 'queued', title: latestTitle, percent: 0, speed: '', eta: '', url, format })
  pumpDownloadQueue()
  return id
}
