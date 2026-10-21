import { app, ipcMain, dialog, shell, BrowserWindow, powerSaveBlocker, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type { AppSettings, EditorRequest, EditorSession, PlaybackState, StreamSource, DownloadFormat } from '../shared/types'
import * as store from './db'
import { scanMusicFolder } from './library'
import { startDownload, searchStreams, streamUrl, importRemotePlaylist, previewRemotePlaylist, cancelDownload, pauseDownload } from './streaming'
import { exportEditedAudio, exportMetadataTaggedCopy } from './editor'
import { chooseAndParseLrc, fetchLyrics } from './lyrics'
import { updateDiscord } from './discord'
import { findDuplicateTracks, watchMusicFolder } from './library'
import { generateWaveform } from './waveform'
import { searchMusicBrainz } from './metadata'
import { createSmartPlaylist, listSmartPlaylists, deleteSmartPlaylist, getSmartPlaylistTracks, setTrackFavorite, setTrackRating, recordPlayedTrack, listListeningHistory, clearListeningHistory, addBookmark, listBookmarks, deleteBookmark, upsertLibraryRoot, exportBackupObject, restoreBackupObject, removeTracks, removeMissingTracksWithinRoot, saveDownloadJob, listDownloadJobs, savePlaylistSource, listPlaylistSources, deletePlaylistSource, touchPlaylistSource, checkpointDatabase } from './db'
import { basename, extname, resolve, dirname } from 'node:path'
import { analyseReplayGain as analyseTrackLoudness } from './audioAnalysis'
import { standardUserDataPath, portableMarkerPath, portableUserDataPath } from './appPaths'

let blockerId: number | null = null
let playingNow = false
let stopLibraryWatch: (() => Promise<void>) | null = null
let watcherRoot = ''
let playlistSchedulerTimer: ReturnType<typeof setInterval> | null = null
const scheduledPlaylistSources = new Set<number>()
async function indexDownloadedFile(filePath: string) {
  try { await scanMusicFolder(path.dirname(filePath)) }
  catch (error) { console.warn('Downloaded file metadata scan failed:', error) }
  const settings = store.getSettings()
  if (settings.autoEnrichMetadata && settings.metadataProvider === 'musicbrainz') store.enqueueMetadataReview(filePath)
}
function configurePlaylistScheduler(getWindow: () => BrowserWindow | null) {
  if (playlistSchedulerTimer) clearInterval(playlistSchedulerTimer)
  playlistSchedulerTimer = setInterval(() => {
    const settings = store.getSettings()
    if (!settings.playlistAutoSync) return
    const intervalMs = Math.max(1, Math.min(720, Number(settings.playlistSyncIntervalHours) || 24)) * 60 * 60 * 1000
    for (const source of listPlaylistSources()) {
      if (scheduledPlaylistSources.has(source.id)) continue
      if (source.lastSynced && Date.now() - source.lastSynced < intervalMs) continue
      scheduledPlaylistSources.add(source.id)
      try {
        startDownload(source.url, source.format, settings, progress => {
          saveDownloadJob({ ...progress, includePlaylist: true })
          const window = getWindow()
          if (window && !window.isDestroyed()) window.webContents.send('download:progress', { ...progress, includePlaylist: true })
          if (['finished','error','cancelled','paused'].includes(progress.status)) {
            scheduledPlaylistSources.delete(source.id)
            if (progress.status === 'finished') touchPlaylistSource(source.id)
          }
        }, async (filePath, title, downloadId, sourceUrl, format) => {
          store.addDownload({ id: downloadId, title, filePath, sourceUrl, format })
          await indexDownloadedFile(filePath)
        }, true)
      } catch (error) {
        scheduledPlaylistSources.delete(source.id)
        console.warn(`Scheduled playlist sync failed for ${source.name}:`, error)
      }
    }
  }, 60_000)
  playlistSchedulerTimer.unref?.()
}
function refreshPowerBlocker(settings: AppSettings, playing: boolean) {
  if (settings.inhibitSleep && playing && (blockerId === null || !powerSaveBlocker.isStarted(blockerId))) blockerId = powerSaveBlocker.start('prevent-app-suspension')
  if ((!settings.inhibitSleep || !playing) && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null }
}
export function registerIpc(win: () => BrowserWindow | null, mini: (enabled: boolean) => void, getStreamPort: () => number) {
  const showOpenDialog = (options: OpenDialogOptions) => { const window = win(); return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options) }
  const showSaveDialog = (options: SaveDialogOptions) => { const window = win(); return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options) }
  configurePlaylistScheduler(win)
  const configureWatcher = async (settings: AppSettings) => {
    if (settings.autoWatchFolders && settings.musicFolder && stopLibraryWatch && watcherRoot === settings.musicFolder) return
    if (stopLibraryWatch) { await stopLibraryWatch(); stopLibraryWatch = null; watcherRoot = '' }
    if (!settings.autoWatchFolders || !settings.musicFolder) return
    try {
      stopLibraryWatch = await watchMusicFolder(settings.musicFolder, async () => {
        try {
          const latest = await scanMusicFolder(settings.musicFolder)
          removeMissingTracksWithinRoot(settings.musicFolder, latest.presentPaths ?? latest.tracks.map(t => t.path))
          const window = win()
          if (window && !window.isDestroyed()) window.webContents.send('library:updated', store.listTracks())
        } catch (error) { console.warn('Automatic library refresh failed:', error) }
      })
      watcherRoot = settings.musicFolder
      upsertLibraryRoot(settings.musicFolder, true)
    } catch (error) { console.warn('Could not watch the selected music folder:', error) }
  }
  ipcMain.handle('dialog:download-folder', async () => {
    const r = await showOpenDialog({ title: 'Choose download destination', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:music-folder', async () => {
    const r = await showOpenDialog({ title: 'Choose your music folder', properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:save-audio', async (_e, suggested: string) => {
    const r = await showSaveDialog({ title: 'Export audio', defaultPath: suggested, filters: [{ name: 'Audio files', extensions: ['mp3','flac','opus','wav','m4a'] }] })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('dialog:banner', async () => {
    const r = await showOpenDialog({ title: 'Choose profile banner', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp'] }] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:executable', async (_e, title: string) => {
    const r = await showOpenDialog({ title, properties: ['openFile'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('tools:diagnostics', async () => {
    const settings = store.getSettings()
    const probe = (name: string, command: string, args: string[]) => new Promise<{ name: string; command: string; installed: boolean; version: string }>(resolveResult => {
      let output = ''; let settled = false
      const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const finish = (value: { name: string; command: string; installed: boolean; version: string }) => { if (!settled) { settled = true; resolveResult(value) } }
      const timeout = setTimeout(() => { child.kill(); finish({ name, command, installed: false, version: 'Timed out while checking' }) }, 5000)
      child.stdout.on('data', d => { output = (output + d.toString()).slice(0, 1500) })
      child.stderr.on('data', d => { output = (output + d.toString()).slice(0, 1500) })
      child.on('error', err => { clearTimeout(timeout); finish({ name, command, installed: false, version: err.message }) })
      child.on('close', code => { clearTimeout(timeout); const trimmed = output.trim().split(/\r?\n/).find(Boolean) || ''; finish({ name, command, installed: code === 0, version: trimmed || (code === 0 ? 'Available' : `Exited ${code}`) }) })
    })
    const results = await Promise.all([
      probe('Node.js runtime', process.execPath, ['--version']),
      probe('yt-dlp', settings.ytDlpPath.trim() || 'yt-dlp', ['--version']),
      probe('FFmpeg', settings.ffmpegPath.trim() || 'ffmpeg', ['-version']),
      probe('Deno', settings.denoPath.trim() || 'deno', ['--version'])
    ])
    return { appVersion: app.getVersion(), platform: process.platform, architecture: process.arch, userDataPath: app.getPath('userData'), tools: results }
  })
  ipcMain.handle('diagnostics:export', async () => {
    const settings = store.getSettings()
    const probe = (name: string, command: string, args: string[]) => new Promise<{ name: string; command: string; installed: boolean; version: string }>(resolveResult => {
      let output = ''; const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const timeout = setTimeout(() => child.kill(), 4000)
      child.stdout.on('data', d => output = (output + d.toString()).slice(0,1000)); child.stderr.on('data', d => output = (output + d.toString()).slice(0,1000))
      child.on('error', err => { clearTimeout(timeout); resolveResult({ name, command, installed:false, version:err.message }) })
      child.on('close', code => { clearTimeout(timeout); resolveResult({ name, command, installed:code===0, version:output.trim().split(/\r?\n/)[0]||`exit ${code}` }) })
    })
    const tools = await Promise.all([probe('Node.js',process.execPath,['--version']),probe('yt-dlp',settings.ytDlpPath.trim()||'yt-dlp',['--version']),probe('FFmpeg',settings.ffmpegPath.trim()||'ffmpeg',['-version']),probe('Deno',settings.denoPath.trim()||'deno',['--version'])])
    const report = { generatedAt:new Date().toISOString(), version:app.getVersion(), platform:process.platform, architecture:process.arch, userDataPath:app.getPath('userData'), settings: { theme:settings.theme, musicFolder:settings.musicFolder, downloadFolder:settings.downloadFolder, autoWatchFolders:settings.autoWatchFolders }, tools }
    const result = await showSaveDialog({ title:'Export MyRiff diagnostics', defaultPath:'MyRiff-Diagnostics.json', filters:[{name:'JSON report',extensions:['json']}] })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, JSON.stringify(report,null,2), 'utf8'); return result.filePath
  })
  ipcMain.handle('library:scan', async (event, folder: string) => {
    const result = await scanMusicFolder(folder, (done, total, current) => event.sender.send('library:scan-progress', { done, total, current }))
    const settings = store.getSettings(); if (!settings.musicFolder) store.setSettings({ musicFolder: folder })
    const missing = removeMissingTracksWithinRoot(folder, result.presentPaths ?? result.tracks.map(t => t.path))
    upsertLibraryRoot(folder, settings.autoWatchFolders)
    await configureWatcher({ ...settings, musicFolder: settings.musicFolder || folder })
    return { ...result, tracks: store.listTracks(), missingRemoved: missing.length }
  })
  ipcMain.handle('library:tracks', () => store.listTracks())
  ipcMain.handle('library:media-url', (_e, filePath: string) => {
    if (!store.isKnownTrack(filePath) && store.getSettings().bannerPath !== filePath) throw new Error('That file is not in the library or selected profile banner.')
    return `myriff-media://local?path=${encodeURIComponent(filePath)}`
  })
  ipcMain.handle('library:artwork-url', (_e, key: string) => `myriff-art://${key}`)
  ipcMain.handle('settings:get', async () => { const settings = store.getSettings(); await configureWatcher(settings); return settings })
  ipcMain.handle('settings:set', async (_e, patch: Partial<AppSettings>) => {
    const before = store.getSettings()
    if (patch.eqQ !== undefined && (!Number.isFinite(patch.eqQ) || patch.eqQ < 0.3 || patch.eqQ > 8)) throw new Error('EQ bandwidth must be between 0.3 and 8.')
    if (patch.eqFrequencies !== undefined && (!Array.isArray(patch.eqFrequencies) || patch.eqFrequencies.length !== 10 || patch.eqFrequencies.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 20 || v > 20000))) throw new Error('EQ centre frequencies must contain ten values between 20 and 20000 Hz.')
    if (patch.stereoWidth !== undefined && (!Number.isFinite(patch.stereoWidth) || patch.stereoWidth < 0 || patch.stereoWidth > 2)) throw new Error('Stereo width must be between 0 and 2.')
    const settings = store.setSettings(patch)
    if (patch.inhibitSleep !== undefined) refreshPowerBlocker(settings, playingNow)
    if (patch.autoWatchFolders !== undefined || patch.musicFolder !== undefined) await configureWatcher(settings)
    if (patch.playlistAutoSync !== undefined || patch.playlistSyncIntervalHours !== undefined) configurePlaylistScheduler(win)
    if (patch.portableMode !== undefined && patch.portableMode !== before.portableMode) {
      try {
        checkpointDatabase()
        if (patch.portableMode) {
          fsSync.mkdirSync(portableUserDataPath, { recursive: true })
          fsSync.cpSync(app.getPath('userData'), portableUserDataPath, { recursive: true, force: true })
          fsSync.writeFileSync(portableMarkerPath, 'MyRiff portable data mode enabled. Keep this file next to MyRiff to use portable data.\n', 'utf8')
        } else {
          fsSync.mkdirSync(standardUserDataPath, { recursive: true })
          fsSync.cpSync(app.getPath('userData'), standardUserDataPath, { recursive: true, force: true })
          fsSync.rmSync(portableMarkerPath, { force: true })
        }
        setTimeout(() => { app.relaunch(); app.exit(0) }, 800)
      } catch (error) {
        store.setSettings({ portableMode: before.portableMode })
        throw new Error(`Could not switch portable data mode. The install folder may not be writable; choose a user-writable folder for MyRiff. ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return settings
  })
  ipcMain.handle('playback:get', () => store.getPlayback())
  ipcMain.handle('playback:set', (_e, state: PlaybackState) => { store.setPlayback(state); return true })
  ipcMain.handle('playback:status', (_e, playing: boolean) => { playingNow = playing; refreshPowerBlocker(store.getSettings(), playingNow); return true })
  ipcMain.handle('playlist:list', () => store.listPlaylists())
  ipcMain.handle('playlist:get-tracks', (_e, id: number) => store.getPlaylistTracks(id))
  ipcMain.handle('playlist:create', (_e, name: string) => store.createPlaylist(name))
  ipcMain.handle('playlist:rename', (_e, id: number, name: string) => store.renamePlaylist(id, name))
  ipcMain.handle('playlist:delete', (_e, id: number) => store.deletePlaylist(id))
  ipcMain.handle('playlist:folder-list', () => store.listPlaylistFolders())
  ipcMain.handle('playlist:folder-create', (_e, name: string, parentId: number | null = null) => store.createPlaylistFolder(name, parentId))
  ipcMain.handle('playlist:folder-rename', (_e, id: number, name: string) => store.renamePlaylistFolder(id, name))
  ipcMain.handle('playlist:folder-delete', (_e, id: number) => store.deletePlaylistFolder(id))
  ipcMain.handle('playlist:move-to-folder', (_e, playlistId: number, folderId: number | null) => store.movePlaylistToFolder(playlistId, folderId))
  ipcMain.handle('playlist:add', (_e, id: number, paths: string[]) => store.addPlaylistTracks(id, paths))
  ipcMain.handle('playlist:remove', (_e, id: number, trackPath: string) => store.removePlaylistTrack(id, trackPath))
  ipcMain.handle('playlist:reorder', (_e, id: number, orderedPaths: unknown) => {
    if (!Number.isInteger(id) || id < 1) throw new Error('Choose a valid playlist.')
    if (!Array.isArray(orderedPaths) || orderedPaths.length > 5000 || orderedPaths.some(p => typeof p !== 'string' || !p || p.length > 32768)) throw new Error('The playlist order is invalid or too large.')
    return store.reorderPlaylistTracks(id, orderedPaths as string[])
  })
  ipcMain.handle('playlist:source-list', () => listPlaylistSources())
  ipcMain.handle('playlist:source-save', (_e, name: string, urlInput: string, format: DownloadFormat) => {
    const parsed = new URL(urlInput.trim())
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const supported = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'soundcloud.com' || host.endsWith('.soundcloud.com')
    if (parsed.protocol !== 'https:' || !supported) throw new Error('Saved sync sources must be HTTPS YouTube, YouTube Music, or SoundCloud playlist URLs.')
    if (!['mp3','flac','opus'].includes(format)) throw new Error('Unsupported download format.')
    return savePlaylistSource(name, parsed.toString(), format)
  })
  ipcMain.handle('playlist:source-delete', (_e, id: number) => deletePlaylistSource(id))
  ipcMain.handle('playlist:source-sync', (event, id: number) => {
    const source = listPlaylistSources().find(item => item.id === id)
    if (!source) throw new Error('Saved playlist source not found.')
    const jobId = startDownload(source.url, source.format, store.getSettings(), progress => {
      const p = { ...progress, includePlaylist: true }
      saveDownloadJob(p)
      if (!event.sender.isDestroyed()) event.sender.send('download:progress', p)
      // Do not advance last-synced until the actual download completes.
      if (p.status === 'finished') touchPlaylistSource(id)
    }, async (filePath, title, downloadId, sourceUrl, fmt) => {
      store.addDownload({ id: downloadId, title, filePath, sourceUrl, format: fmt })
      await indexDownloadedFile(filePath)
    }, true)
    return jobId
  })
  ipcMain.handle('stream:search', async (_e, query: string, source: StreamSource) => searchStreams(query, source, store.getSettings()))
  ipcMain.handle('stream:play', async (_e, url: string) => {
    if (!getStreamPort()) throw new Error('Stream proxy has not started.')
    return streamUrl(url)
  })
  ipcMain.handle('stream:preview-playlist', async (_e, url: string) => previewRemotePlaylist(url, store.getSettings(), store.listTracks().map(t => ({ path: t.path, title: t.title, artist: t.artist, duration: t.duration }))))
  ipcMain.handle('stream:import-playlist', async (_e, url: string, name: string) => importRemotePlaylist(url, name, store.getSettings(), store.listTracks().map(t => ({ path: t.path, title: t.title, artist: t.artist })), n => store.createPlaylist(n).id, (id, paths) => { store.addPlaylistTracks(id, paths) }))
  ipcMain.handle('download:start', async (event, url: string, format: 'mp3'|'flac'|'opus', includePlaylist = false) => {
    // The stream module reports its own identifier; forward updates as events rather than blocking the renderer.
    const jobId = startDownload(url, format, store.getSettings(), progress => { const p = { ...progress, includePlaylist }; saveDownloadJob(p); if (!event.sender.isDestroyed()) event.sender.send('download:progress', p) }, async (filePath, title, downloadId, sourceUrl, fmt) => {
      store.addDownload({ id: downloadId, title, filePath, sourceUrl, format: fmt })
      await indexDownloadedFile(filePath)
    }, includePlaylist)
    return jobId
  })
  ipcMain.handle('download:list', () => store.listDownloads())
  ipcMain.handle('download:jobs', () => listDownloadJobs())
  ipcMain.handle('download:cancel', (_e, id: string) => cancelDownload(id))
  ipcMain.handle('download:pause', (_e, id: string) => pauseDownload(id))
  ipcMain.handle('download:open', async (_e, filePath: string) => { await shell.showItemInFolder(filePath); return true })
  ipcMain.handle('download:delete', async (_e, id: string, deleteFile: boolean) => {
    const row = (store.listDownloads() as any[]).find(d => d.id === id)
    if (!row) return false
    if (deleteFile) { await fs.unlink(row.filePath).catch(() => undefined); store.removeTrack(row.filePath) }
    store.forgetDownload(id); return true
  })
  ipcMain.handle('editor-session:get', (_e, trackPath: string) => store.getEditorSession(String(trackPath || '')))
  ipcMain.handle('editor-session:save', (_e, session: Omit<EditorSession, 'updatedAt'>) => {
    if (!session || typeof session !== 'object') throw new Error('Invalid editor session.')
    return store.saveEditorSession(session)
  })
  ipcMain.handle('editor-session:list', () => store.listEditorSessions())
  ipcMain.handle('editor-session:delete', (_e, trackPath: string) => store.deleteEditorSession(String(trackPath || '')))
  ipcMain.handle('editor:export', async (event, request: EditorRequest) => exportEditedAudio(request, store.getSettings(), percent => event.sender.send('editor:progress', percent)))
  ipcMain.handle('lyrics:search', async (_e, title: string, artist: string, album: string, duration: number) => fetchLyrics(title, artist, album, duration))
  ipcMain.handle('lyrics:import', async () => chooseAndParseLrc(win()))
  ipcMain.handle('lyrics:get', (_e, trackPath: string) => store.getLyrics(trackPath))
  ipcMain.handle('lyrics:save', (_e, trackPath: string, lines: unknown[]) => store.saveLyrics(trackPath, lines))
  ipcMain.handle('discord:update', async (_e, track) => {
    const s = store.getSettings(); await updateDiscord(s.discordRpc, s.discordClientId, track); return true
  })
  ipcMain.handle('track:favorite', (_e, trackPath: string, favorite: boolean) => setTrackFavorite(trackPath, favorite))
  ipcMain.handle('track:rating', (_e, trackPath: string, rating: number) => setTrackRating(trackPath, rating))
  ipcMain.handle('track:played', (_e, info: { trackPath?: string | null; title: string; artist?: string; source?: string }) => recordPlayedTrack(info))
  ipcMain.handle('history:list', (_e, limit?: number) => listListeningHistory(limit))
  ipcMain.handle('history:clear', () => clearListeningHistory())
  ipcMain.handle('bookmark:add', (_e, trackPath: string, position: number, label: string) => addBookmark(trackPath, position, label))
  ipcMain.handle('bookmark:list', (_e, trackPath?: string) => listBookmarks(trackPath))
  ipcMain.handle('bookmark:delete', (_e, id: number) => deleteBookmark(id))
  ipcMain.handle('smart-playlist:create', (_e, name: string, rules: any[], match: 'all'|'any') => createSmartPlaylist(name, rules, match))
  ipcMain.handle('smart-playlist:list', () => listSmartPlaylists())
  ipcMain.handle('smart-playlist:delete', (_e, id: number) => deleteSmartPlaylist(id))
  ipcMain.handle('smart-playlist:tracks', (_e, id: number) => getSmartPlaylistTracks(id))
  ipcMain.handle('library:duplicates', () => findDuplicateTracks(store.getSettings().duplicateScanMode))
  ipcMain.handle('library:missing', async () => {
    const all = store.listTracks(); const missing: string[] = []
    for (const track of all) { try { await fs.access(track.path) } catch { missing.push(track.path) } }
    return missing
  })
  ipcMain.handle('library:remove-missing', (_e, paths: string[]) => removeTracks(paths))
  ipcMain.handle('library:remove-index', (_e, paths: string[]) => removeTracks(paths))
  ipcMain.handle('metadata:export-copy', async (_e, trackPath: string, suggestion: { title: string; artist: string; album: string; year: number | null }) => {
    const track = store.getTrack(trackPath)
    if (!track) throw new Error('Track is not in the local library.')
    const ext = extname(track.path) || '.mp3'
    const defaultPath = `${basename(track.path, ext)} - tagged${ext}`
    const result = await showSaveDialog({ title: 'Export metadata-enriched copy', defaultPath, filters: [{ name: 'Audio file', extensions: [ext.replace(/^\./, '')] }] })
    if (result.canceled || !result.filePath) return false
    await exportMetadataTaggedCopy(track.path, result.filePath, suggestion, store.getSettings())
    return result.filePath
  })
  ipcMain.handle('metadata:bulk-export-copies', async (_e, trackPaths: string[], overrides: { artist?: string; album?: string; year?: number | null; titleTemplate?: string }) => {
    if (!Array.isArray(trackPaths) || trackPaths.length < 1 || trackPaths.length > 1000 || trackPaths.some(p => typeof p !== 'string')) throw new Error('Select between 1 and 1,000 library tracks.')
    overrides = overrides && typeof overrides === 'object' ? overrides : {}
    for (const value of [overrides.artist, overrides.album, overrides.titleTemplate]) if (value !== undefined && (typeof value !== 'string' || value.length > 300)) throw new Error('Tag fields must be text shorter than 300 characters.')
    if (overrides.year !== undefined && overrides.year !== null && (!Number.isInteger(overrides.year) || overrides.year < 1880 || overrides.year > 2100)) throw new Error('Enter a valid release year between 1880 and 2100.')
    const folderDialog = await showOpenDialog({ title: 'Choose destination for tagged copies', properties: ['openDirectory', 'createDirectory'] })
    if (folderDialog.canceled || !folderDialog.filePaths[0]) return null
    const outputFolder = folderDialog.filePaths[0]
    const settings = store.getSettings()
    const tracks = new Map(store.listTracks().map(track => [track.path, track]))
    const successes: string[] = []
    const failures: Array<{ path: string; error: string }> = []
    const used = new Set<string>()
    for (const trackPath of [...new Set(trackPaths)]) {
      const track = tracks.get(trackPath)
      if (!track || !store.isKnownTrack(trackPath)) { failures.push({ path: trackPath, error: 'Track is no longer in the library.' }); continue }
      const extension = extname(track.path) || '.mp3'
      const base = basename(track.path, extension) + ' - tagged'
      let outputPath = resolve(outputFolder, `${base}${extension}`)
      let suffix = 2
      while (fsSync.existsSync(outputPath) || used.has(outputPath.toLowerCase())) outputPath = resolve(outputFolder, `${base} (${suffix++})${extension}`)
      used.add(outputPath.toLowerCase())
      const title = overrides.titleTemplate?.trim() ? overrides.titleTemplate.replace(/\{(title|artist|album|year)\}/gi, (_match, key: string) => String(({ title: track.title, artist: track.artist, album: track.album, year: track.year ?? '' } as Record<string, string | number>)[key.toLowerCase()] ?? '')).slice(0, 300) : track.title
      const tags = { title, artist: overrides.artist?.trim() || track.artist, album: overrides.album?.trim() || track.album, year: overrides.year ?? track.year }
      try { await exportMetadataTaggedCopy(track.path, outputPath, tags, settings); successes.push(outputPath) }
      catch (error) { failures.push({ path: track.path, error: error instanceof Error ? error.message : String(error) }) }
    }
    if (successes.length) { try { await scanMusicFolder(outputFolder) } catch (error) { console.warn('Bulk tagged-copy indexing deferred:', error) } }
    return { folder: outputFolder, successes, failures }
  })
  ipcMain.handle('metadata:review-queue', () => store.listMetadataReviewQueue())
  ipcMain.handle('metadata:review-complete', (_e, trackPath: string) => store.completeMetadataReview(String(trackPath || '')))
  ipcMain.handle('metadata:search', (_e, trackPath: string) => {
    const settings = store.getSettings()
    if (settings.metadataProvider === 'off') throw new Error('Metadata lookup is disabled in Settings.')
    const track = store.getTrack(trackPath)
    if (!track) throw new Error('Track is not in the local library.')
    return searchMusicBrainz(track)
  })
  ipcMain.handle('audio:waveform', async (_e, trackPath: string, count?: number) => {
    const track = store.getTrack(trackPath)
    if (!track) throw new Error('Waveform source must be a local library track.')
    return generateWaveform(track.path, track.duration, store.getSettings(), count)
  })
  ipcMain.handle('audio:analyse-loudness', async (_e, trackPath: string) => {
    const track = store.getTrack(trackPath)
    if (!track) throw new Error('Choose a local library track.')
    const result = await analyseTrackLoudness(track.path, store.getSettings())
    store.setReplayGain(track.path, result.gainDb)
    return { ...result, tracks: store.listTracks() }
  })
  ipcMain.handle('playlist:export-file', async (_e, id: number, format: 'm3u'|'csv'|'txt') => {
    const { playlist, tracks } = store.exportPlaylistEntries(id)
    const filters = format === 'm3u' ? [{ name: 'M3U playlist', extensions: ['m3u8','m3u'] }] : format === 'csv' ? [{ name: 'CSV playlist', extensions: ['csv'] }] : [{ name: 'Text list', extensions: ['txt'] }]
    const result = await showSaveDialog({ title: 'Export playlist', defaultPath: `${playlist.name}.${format === 'm3u' ? 'm3u8' : format}`, filters })
    if (result.canceled || !result.filePath) return false
    const q = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    let content = ''
    if (format === 'm3u') content = '#EXTM3U\n' + tracks.map(t => `#EXTINF:${Math.floor(t.duration || -1)},${t.artist ? `${t.artist} - ` : ''}${t.title}\n${t.path}`).join('\n') + '\n'
    else if (format === 'csv') content = 'title,artist,album,duration,path\n' + tracks.map(t => [t.title,t.artist,t.album,t.duration,t.path].map(q).join(',')).join('\n') + '\n'
    else content = tracks.map(t => `${t.artist ? `${t.artist} - ` : ''}${t.title}`).join('\n') + '\n'
    await fs.writeFile(result.filePath, content, 'utf8'); return result.filePath
  })
  ipcMain.handle('playlist:import-file', async () => {
    const result = await showOpenDialog({ title: 'Import playlist or track list', properties: ['openFile'], filters: [{ name: 'Playlist files', extensions: ['m3u','m3u8','csv','txt'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]; const raw = await fs.readFile(filePath, 'utf8'); const ext = extname(filePath).toLowerCase(); const tracks = store.listTracks()
    const normalize = (v: string) => v.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
    const matchTrack = (candidate: string, artist = '') => {
      const trimmed = candidate.trim(); if (!trimmed) return null
      const exactPath = resolve(dirname(filePath), trimmed)
      const byPath = tracks.find(t => resolve(t.path).toLowerCase() === exactPath.toLowerCase() || resolve(t.path).toLowerCase() === trimmed.toLowerCase())
      if (byPath) return byPath
      const target = normalize(`${artist} ${trimmed}`)
      let best: { track: typeof tracks[number]; score: number } | null = null
      for (const t of tracks) {
        const full = normalize(`${t.artist} ${t.title}`); const title = normalize(t.title)
        const score = full === target || title === normalize(trimmed) ? 1 : target.split(' ').filter(x => x.length > 2 && full.split(' ').includes(x)).length / Math.max(1, target.split(' ').filter(x => x.length > 2).length)
        if (!best || score > best.score) best = { track: t, score }
      }
      const threshold = store.getSettings().playlistImportMatchThreshold
      return best && best.score >= threshold ? best.track : null
    }
    const entries: Array<{ candidate: string; artist?: string }> = []
    if (ext === '.m3u' || ext === '.m3u8') {
      let pendingTitle = ''
      for (const line of raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
        if (line.startsWith('#EXTINF:')) { pendingTitle = line.slice(line.indexOf(',') + 1); continue }
        if (line.startsWith('#')) continue
        const titleMatch = pendingTitle.match(/^(.*?)\s+-\s+(.*)$/)
        entries.push({ candidate: line, artist: titleMatch?.[1] || '' }); pendingTitle = ''
      }
    } else if (ext === '.csv') {
      const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
      const split = (line: string) => { const fields: string[] = []; let v = ''; let quoted = false; for (let i=0;i<line.length;i++) { const c=line[i]; if (c==='"' && line[i+1]==='"' && quoted) { v+='"'; i++ } else if(c==='"') quoted=!quoted; else if(c===',' && !quoted) { fields.push(v);v='' } else v+=c } fields.push(v); return fields }
      const header = (split(lines.shift() || '')).map(x => x.trim().toLowerCase())
      for (const line of lines) { const cells = split(line); const get = (...names: string[]) => { const index = header.findIndex(h => names.includes(h)); return index >= 0 ? cells[index] || '' : '' }; const title = get('title','track','track name','name'); if (title) entries.push({ candidate: title, artist: get('artist','artists','artist name') }) }
    } else {
      for (const line of raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) { if (line.startsWith('#')) continue; const pair = line.match(/^(.*?)\s+-\s+(.*)$/); entries.push(pair ? { artist: pair[1], candidate: pair[2] } : { candidate: line }) }
    }
    const matched: string[] = []; const missing: string[] = []
    for (const entry of entries) { const track = matchTrack(entry.candidate, entry.artist); if (track && !matched.includes(track.path)) matched.push(track.path); else if (!track) missing.push(`${entry.artist ? `${entry.artist} — ` : ''}${entry.candidate}`) }
    let playlistName = basename(filePath, ext).replace(/[._]+/g, ' ').trim() || 'Imported playlist'
    let uniqueName = playlistName; let n = 2; const existing = new Set(store.listPlaylists().map(p => p.name.toLowerCase())); while (existing.has(uniqueName.toLowerCase())) uniqueName = `${playlistName} (${n++})`
    const playlist = store.createPlaylist(uniqueName); store.addPlaylistTracks(playlist.id, matched)
    return { playlistId: playlist.id, playlistName: uniqueName, total: entries.length, found: matched.length, missing }
  })
  ipcMain.handle('external:open-tunemymusic', async () => { await shell.openExternal('https://www.tunemymusic.com/'); return true })
  ipcMain.handle('backup:export', async () => {
    const result = await showSaveDialog({ title: 'Export MyRiff backup', defaultPath: `MyRiff-Backup-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: 'MyRiff backup', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, JSON.stringify(exportBackupObject(), null, 2), 'utf8'); return result.filePath
  })
  ipcMain.handle('backup:import', async () => {
    const result = await showOpenDialog({ title: 'Restore MyRiff backup', properties: ['openFile'], filters: [{ name: 'MyRiff backup', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return false
    const text = await fs.readFile(result.filePaths[0], 'utf8'); restoreBackupObject(JSON.parse(text)); return true
  })
  ipcMain.handle('settings-profile:export', async () => {
    const settings = store.getSettings()
    const profileKeys = [
      'theme','accent','dynamicAccent','customCss','uiDensity','cornerRadius','uiScale','sidebarWidth','gridColumns',
      'animationsEnabled','showArtworkBackground','showVisualizer','visualizerStyle','visualizerSensitivity','viewMode',
      'groupBy','showTrackNumbers','showYear','showGenre','defaultPage','useSystemTitlebar','eqPreset','eqBands','eqFrequencies',
      'effectTempo','effectPitch','effectReverb','effectDistortion','eqQ','stereoWidth','effectChain','effectsBypass','crossfadeSeconds',
      'normalizeLoudness','loudnessTargetLufs','audioOutputDeviceId','audioProfiles','keyboardShortcuts'
    ] as const
    const values: Record<string, unknown> = {}
    for (const key of profileKeys) values[key] = settings[key]
    const payload = { format: 'myriff-settings-profile', version: 1, exportedAt: new Date().toISOString(), settings: values }
    const result = await showSaveDialog({ title: 'Export customisation profile', defaultPath: 'MyRiff-Profile.json', filters: [{ name: 'MyRiff settings profile', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return result.filePath
  })
  ipcMain.handle('settings-profile:import', async () => {
    const result = await showOpenDialog({ title: 'Import customisation profile', properties: ['openFile'], filters: [{ name: 'MyRiff settings profile', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return false
    const profileStat = await fs.stat(result.filePaths[0])
    if (profileStat.size > 1_000_000) throw new Error('Settings profile is larger than the 1 MB safety limit.')
    const raw = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'))
    if (!raw || raw.format !== 'myriff-settings-profile' || raw.version !== 1 || !raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) {
      throw new Error('This is not a supported MyRiff settings profile.')
    }
    const allowed = new Set([
      'theme','accent','dynamicAccent','customCss','uiDensity','cornerRadius','uiScale','sidebarWidth','gridColumns',
      'animationsEnabled','showArtworkBackground','showVisualizer','visualizerStyle','visualizerSensitivity','viewMode',
      'groupBy','showTrackNumbers','showYear','showGenre','defaultPage','useSystemTitlebar','eqPreset','eqBands','eqFrequencies',
      'effectTempo','effectPitch','effectReverb','effectDistortion','eqQ','stereoWidth','effectChain','effectsBypass','crossfadeSeconds',
      'normalizeLoudness','loudnessTargetLufs','audioOutputDeviceId','audioProfiles','keyboardShortcuts'
    ])
    const current = store.getSettings() as unknown as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(raw.settings as Record<string, unknown>)) {
      if (!allowed.has(key)) continue
      const expected = current[key]
      if (typeof expected === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) continue
      if (typeof expected === 'boolean' && typeof value !== 'boolean') continue
      if (typeof expected === 'string' && typeof value !== 'string') continue
      if (Array.isArray(expected) && !Array.isArray(value)) continue
      if (key === 'theme' && !['dark','light','system'].includes(String(value))) continue
      if (key === 'uiDensity' && !['compact','comfortable','cozy'].includes(String(value))) continue
      if (key === 'visualizerStyle' && !['bars','wave','mirror','spectrum','dots'].includes(String(value))) continue
      if (key === 'viewMode' && !['grid','list'].includes(String(value))) continue
      if (key === 'groupBy' && !['folder','artist','album','genre'].includes(String(value))) continue
      if (key === 'defaultPage' && !['library','playlists','search','downloads','playlist-studio','power-tools','radio','editor','lyrics','sound','settings'].includes(String(value))) continue
      if (key === 'accent' && !/^#[0-9a-f]{6}$/i.test(String(value))) continue
      if (key === 'cornerRadius' && (Number(value) < 0 || Number(value) > 28)) continue
      if (key === 'uiScale' && (Number(value) < 80 || Number(value) > 125)) continue
      if (key === 'sidebarWidth' && (Number(value) < 190 || Number(value) > 340)) continue
      if (key === 'gridColumns' && (Number(value) < 0 || Number(value) > 8)) continue
      if (key === 'visualizerSensitivity' && (Number(value) < 0.1 || Number(value) > 4)) continue
      if (key === 'crossfadeSeconds' && (Number(value) < 0 || Number(value) > 12)) continue
      if (key === 'effectTempo' && (Number(value) < 0.5 || Number(value) > 2)) continue
      if (key === 'eqQ' && (Number(value) < 0.3 || Number(value) > 8)) continue
      if (key === 'stereoWidth' && (Number(value) < 0 || Number(value) > 2)) continue
      if (key === 'effectPitch' && (Number(value) < -24 || Number(value) > 24)) continue
      if (['effectReverb','effectDistortion'].includes(key) && (Number(value) < 0 || Number(value) > 1)) continue
      if (key === 'loudnessTargetLufs' && (Number(value) < -23 || Number(value) > -8)) continue
      if (key === 'customCss' && String(value).length > 200_000) continue
      if (key === 'eqBands' && (!Array.isArray(value) || value.length !== 10 || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < -24 || v > 24))) continue
      if (key === 'eqFrequencies' && (!Array.isArray(value) || value.length !== 10 || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 20 || v > 20000))) continue
      if (key === 'effectChain' && (!Array.isArray(value) || value.length !== 3 || new Set(value).size !== 3 || value.some(v => !['eq','distortion','reverb'].includes(String(v))))) continue
      if (key === 'keyboardShortcuts') {
        const allowedKeys = ['playPause','next','previous','search','queue','favorite']
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value as Record<string, unknown>).some(([shortcut, binding]) => !allowedKeys.includes(shortcut) || typeof binding !== 'string' || binding.length > 80)) continue
      }
      if (key === 'audioProfiles') {
        const profiles = value as unknown[]
        const valid = Array.isArray(profiles) && profiles.length <= 100 && profiles.every((item: any) => item && typeof item === 'object' && typeof item.id === 'string' && item.id.length <= 100 && typeof item.name === 'string' && item.name.length <= 100 && ['manual','genre','artist','device'].includes(item.matchBy) && typeof item.matchValue === 'string' && item.matchValue.length <= 300 && Array.isArray(item.eqBands) && item.eqBands.length === 10 && item.eqBands.every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -24 && v <= 24) && (item.eqFrequencies === undefined || (Array.isArray(item.eqFrequencies) && item.eqFrequencies.length === 10 && item.eqFrequencies.every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 20 && v <= 20000))) && (item.eqQ === undefined || (typeof item.eqQ === 'number' && Number.isFinite(item.eqQ) && item.eqQ >= 0.3 && item.eqQ <= 8)) && (item.stereoWidth === undefined || (typeof item.stereoWidth === 'number' && Number.isFinite(item.stereoWidth) && item.stereoWidth >= 0 && item.stereoWidth <= 2)) && typeof item.tempo === 'number' && Number.isFinite(item.tempo) && item.tempo >= 0.5 && item.tempo <= 2 && typeof item.pitch === 'number' && Number.isFinite(item.pitch) && item.pitch >= -12 && item.pitch <= 12 && typeof item.reverb === 'number' && Number.isFinite(item.reverb) && item.reverb >= 0 && item.reverb <= 1 && typeof item.distortion === 'number' && Number.isFinite(item.distortion) && item.distortion >= 0 && item.distortion <= 1 && typeof item.enabled === 'boolean')
        if (!valid) continue
      }
      patch[key] = value
    }
    if (!Object.keys(patch).length) throw new Error('The profile contained no supported settings.')
    return store.setSettings(patch as Partial<AppSettings>)
  })
  ipcMain.handle('library:export-csv', async () => {
    const result = await showSaveDialog({ title: 'Export library inventory', defaultPath: 'MyRiff-Library.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (result.canceled || !result.filePath) return false
    const q = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = store.listTracks()
    const content = 'title,artist,album,genre,year,duration,rating,favorite,playCount,path\n' + rows.map(t => [t.title,t.artist,t.album,t.genre,t.year,t.duration,t.rating,t.favorite,t.playCount,t.path].map(q).join(',')).join('\n') + '\n'
    await fs.writeFile(result.filePath, content, 'utf8'); return result.filePath
  })
  ipcMain.handle('window:mini', (_e, enabled: boolean) => { mini(enabled); return true })
}
