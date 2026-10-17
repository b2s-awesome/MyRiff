import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type { AppSettings, PlaybackState, Playlist, PlaylistFolder, Track, SmartPlaylist, SmartPlaylistRule, TrackBookmark, ListeningHistoryItem, AudioProfile, DownloadProgress, SavedPlaylistSource } from '../shared/types'

const defaults: AppSettings = {
  musicFolder: '', theme: 'dark', accent: '#b69cff', dynamicAccent: true, downloadFormat: 'opus', downloadQuality: '0',
  downloadFolder: '', downloadConcurrency: 2, downloadRetries: 3, playlistAutoSync: false, playlistSyncIntervalHours: 24,
  streamPriority: ['YouTube Music', 'YouTube', 'SoundCloud'], lyricsProvider: 'lrclib', saveLyricsLocally: true,
  discordRpc: false, discordClientId: '', ffmpegPath: '', ytDlpPath: '', denoPath: '', customCss: '', bannerPath: '', inhibitSleep: false,
  eqPreset: 'Flat', eqBands: Array(10).fill(0), effectTempo: 1, effectPitch: 0, effectReverb: 0, effectDistortion: 0,
  effectChain: ['eq', 'distortion', 'reverb'], effectsBypass: false, crossfadeSeconds: 0, normalizeLoudness: false, loudnessTargetLufs: -14,
  audioOutputDeviceId: '', sleepTimerMinutes: 0, viewMode: 'grid', groupBy: 'album', autoWatchFolders: false, duplicateScanMode: 'both',
  uiDensity: 'comfortable', cornerRadius: 14, uiScale: 100, sidebarWidth: 238, gridColumns: 0, animationsEnabled: true,
  showArtworkBackground: true, showVisualizer: true, visualizerStyle: 'bars', visualizerSensitivity: 1, defaultPage: 'library',
  showTrackNumbers: true, showYear: true, showGenre: true, confirmDestructiveActions: true,
  keyboardShortcuts: { playPause: 'Space', next: 'MediaTrackNext', previous: 'MediaTrackPrevious', search: 'Ctrl+K', queue: 'Q', favorite: 'F' },
  audioProfiles: [], historyEnabled: true, historyLimit: 500, autoEnrichMetadata: false, metadataProvider: 'musicbrainz',
  playlistImportMatchThreshold: 0.76, portableMode: false, useSystemTitlebar: false
}

let db: Database.Database
let artworkDir = ''
export function initDatabase(userDataDir: string) {
  fs.mkdirSync(userDataDir, { recursive: true })
  artworkDir = path.join(userDataDir, 'artwork')
  fs.mkdirSync(artworkDir, { recursive: true })
  db = new Database(path.join(userDataDir, 'myriff.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      path TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', album TEXT NOT NULL DEFAULT '',
      track_no INTEGER, genre TEXT NOT NULL DEFAULT '', year INTEGER, duration REAL NOT NULL DEFAULT 0,
      artwork_key TEXT, folder TEXT NOT NULL DEFAULT '', added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artworks (key TEXT PRIMARY KEY, path TEXT NOT NULL, mime TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS playlist_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      parent_id INTEGER REFERENCES playlist_folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
      folder_id INTEGER REFERENCES playlist_folders(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_path TEXT NOT NULL REFERENCES tracks(path) ON DELETE CASCADE,
      position INTEGER NOT NULL, PRIMARY KEY (playlist_id, track_path)
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lyrics (track_path TEXT PRIMARY KEY, content_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, file_path TEXT NOT NULL, source_url TEXT NOT NULL,
      format TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS track_stats (
      path TEXT PRIMARY KEY REFERENCES tracks(path) ON DELETE CASCADE,
      favorite INTEGER NOT NULL DEFAULT 0, rating INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0, last_played INTEGER, replay_gain_db REAL, file_size INTEGER
    );
    CREATE TABLE IF NOT EXISTS listening_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, track_path TEXT, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'local', played_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, track_path TEXT NOT NULL REFERENCES tracks(path) ON DELETE CASCADE,
      position REAL NOT NULL, label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS smart_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, rules_json TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'all', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS download_jobs (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', progress REAL NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, total INTEGER, file_path TEXT, include_playlist INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS library_roots (path TEXT PRIMARY KEY, watched INTEGER NOT NULL DEFAULT 0, last_scan INTEGER);
    CREATE TABLE IF NOT EXISTS playlist_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, format TEXT NOT NULL DEFAULT 'opus', last_synced INTEGER, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_history_played ON listening_history(played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_playlist_position ON playlist_tracks(playlist_id, position);
  `)
  // Migrate library schema for existing MyRiff databases.
  try { db.exec('ALTER TABLE playlists ADD COLUMN folder_id INTEGER REFERENCES playlist_folders(id) ON DELETE SET NULL') } catch { /* Column already exists. */ }
  db.exec('CREATE INDEX IF NOT EXISTS idx_playlist_folder ON playlists(folder_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_playlist_folder_parent ON playlist_folders(parent_id)')
  // Migrate download job columns for databases created by earlier MyRiff builds.
  for (const statement of [
    'ALTER TABLE download_jobs ADD COLUMN completed INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE download_jobs ADD COLUMN total INTEGER',
    'ALTER TABLE download_jobs ADD COLUMN file_path TEXT',
    'ALTER TABLE download_jobs ADD COLUMN include_playlist INTEGER NOT NULL DEFAULT 0'
  ]) { try { db.exec(statement) } catch { /* Column already exists. */ } }
  return db
}
export function database() { if (!db) throw new Error('Database has not been initialized'); return db }
export function getArtworkDir() { return artworkDir }
export function getArtworkPath(key: string) { return (db.prepare('SELECT path FROM artworks WHERE key = ?').get(key) as { path: string } | undefined)?.path }
export function addArtwork(key: string, filePath: string, mime: string) {
  db.prepare('INSERT OR REPLACE INTO artworks(key,path,mime) VALUES(?,?,?)').run(key, filePath, mime)
}
export function getArtworkMime(key: string) { return (db.prepare('SELECT mime FROM artworks WHERE key = ?').get(key) as { mime: string } | undefined)?.mime ?? 'image/jpeg' }
export function upsertTrack(t: Omit<Track, 'artworkUrl' | 'source'> & { artworkKey?: string | null }) {
  db.prepare(`INSERT INTO tracks(path,title,artist,album,track_no,genre,year,duration,artwork_key,folder,added_at)
    VALUES(@path,@title,@artist,@album,@trackNo,@genre,@year,@duration,@artworkKey,@folder,@addedAt)
    ON CONFLICT(path) DO UPDATE SET title=excluded.title,artist=excluded.artist,album=excluded.album,
    track_no=excluded.track_no,genre=excluded.genre,year=excluded.year,duration=excluded.duration,
    artwork_key=excluded.artwork_key,folder=excluded.folder`).run({ ...t, artworkKey: t.artworkKey ?? null })
  db.prepare('INSERT INTO track_stats(path,file_size) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET file_size=COALESCE(excluded.file_size,track_stats.file_size)')
    .run(t.path, t.fileSize ?? null)
}
export function removeMissingTracks(paths: string[]) {
  if (!paths.length) return
  const existing = db.prepare('SELECT path FROM tracks').all() as { path: string }[]
  const keep = new Set(paths)
  const del = db.prepare('DELETE FROM tracks WHERE path=?')
  const tx = db.transaction(() => existing.filter(x => !keep.has(x.path)).forEach(x => del.run(x.path)))
  tx()
}
export function listTracks(): Track[] {
  return (db.prepare(`SELECT t.*, a.key AS art_key, COALESCE(s.favorite,0) AS favorite, COALESCE(s.rating,0) AS rating,
    COALESCE(s.play_count,0) AS play_count, s.last_played, s.replay_gain_db, s.file_size
    FROM tracks t LEFT JOIN artworks a ON t.artwork_key=a.key LEFT JOIN track_stats s ON s.path=t.path
    ORDER BY lower(t.artist), lower(t.album), t.track_no, lower(t.title)`).all() as any[]).map(r => ({
    path: r.path, title: r.title, artist: r.artist, album: r.album, trackNo: r.track_no,
    genre: r.genre, year: r.year, duration: r.duration, artworkUrl: r.art_key ? `myriff-art://${r.art_key}` : null,
    folder: r.folder, addedAt: r.added_at, source: 'local', favorite: Boolean(r.favorite), rating: Number(r.rating || 0),
    playCount: Number(r.play_count || 0), lastPlayed: r.last_played ?? null, replayGainDb: r.replay_gain_db ?? null, fileSize: r.file_size ?? undefined
  }))
}
export function getTrack(pathName: string): Track | undefined { return listTracks().find(t => t.path === pathName) }
export function isKnownTrack(pathName: string): boolean { return Boolean(db.prepare('SELECT 1 FROM tracks WHERE path=?').get(pathName)) }
export function removeTrack(pathName: string) { db.prepare('DELETE FROM playlist_tracks WHERE track_path=?').run(pathName); db.prepare('DELETE FROM lyrics WHERE track_path=?').run(pathName); db.prepare('DELETE FROM tracks WHERE path=?').run(pathName) }
export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key,value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, unknown> = {}
  for (const row of rows) { try { stored[row.key] = JSON.parse(row.value) } catch { stored[row.key] = row.value } }
  return { ...defaults, ...stored } as AppSettings
}
export function setSettings(patch: Partial<AppSettings>) {
  const stmt = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  const tx = db.transaction(() => Object.entries(patch).forEach(([key, value]) => stmt.run(key, JSON.stringify(value))))
  tx(); return getSettings()
}
export function getPlayback(): PlaybackState {
  const raw = db.prepare("SELECT value FROM settings WHERE key='__playback'").get() as { value: string } | undefined
  const fallback: PlaybackState = { path: null, position: 0, volume: 0.75, shuffle: false, repeat: 'off', queuePaths: [] }
  if (!raw) return fallback
  try { return { ...fallback, ...JSON.parse(raw.value) } } catch { return fallback }
}
export function setPlayback(state: PlaybackState) { db.prepare("INSERT INTO settings(key,value) VALUES('__playback',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(state)) }
export function createPlaylist(name: string): Playlist {
  const clean = name.trim()
  if (!clean) throw new Error('Playlist name cannot be empty')
  const result = db.prepare('INSERT INTO playlists(name,created_at) VALUES(?,?)').run(clean, Date.now())
  return listPlaylists().find(p => p.id === Number(result.lastInsertRowid) )!
}
export function listPlaylists(): Playlist[] {
  return db.prepare(`SELECT p.id,p.name,p.created_at AS createdAt,p.folder_id AS folderId,COUNT(pt.track_path) AS trackCount FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id=p.id GROUP BY p.id ORDER BY p.name COLLATE NOCASE`).all() as Playlist[]
}

export function listPlaylistFolders(): PlaylistFolder[] {
  return db.prepare(`SELECT f.id,f.name,f.parent_id AS parentId,f.created_at AS createdAt,COUNT(p.id) AS playlistCount FROM playlist_folders f LEFT JOIN playlists p ON p.folder_id=f.id GROUP BY f.id ORDER BY f.name COLLATE NOCASE`).all() as PlaylistFolder[]
}

export function createPlaylistFolder(name: string, parentId: number | null = null): PlaylistFolder {
  const clean = name.trim()
  if (!clean || clean.length > 80) throw new Error('Folder names must contain between 1 and 80 characters.')
  if (parentId !== null && !db.prepare('SELECT 1 FROM playlist_folders WHERE id=?').get(parentId)) throw new Error('The parent folder no longer exists.')
  const duplicate = parentId === null
    ? db.prepare('SELECT 1 FROM playlist_folders WHERE parent_id IS NULL AND lower(name)=lower(?)').get(clean)
    : db.prepare('SELECT 1 FROM playlist_folders WHERE parent_id=? AND lower(name)=lower(?)').get(parentId, clean)
  if (duplicate) throw new Error('A folder with this name already exists at that level.')
  const result = db.prepare('INSERT INTO playlist_folders(name,parent_id,created_at) VALUES(?,?,?)').run(clean, parentId, Date.now())
  return listPlaylistFolders().find(folder => folder.id === Number(result.lastInsertRowid))!
}

export function renamePlaylistFolder(id: number, name: string): PlaylistFolder[] {
  const clean = name.trim()
  if (!clean || clean.length > 80) throw new Error('Folder names must contain between 1 and 80 characters.')
  const current = db.prepare('SELECT id,parent_id FROM playlist_folders WHERE id=?').get(id) as {id:number; parent_id:number|null}|undefined
  if (!current) throw new Error('The folder no longer exists.')
  const duplicate = current.parent_id === null
    ? db.prepare('SELECT 1 FROM playlist_folders WHERE parent_id IS NULL AND id<>? AND lower(name)=lower(?)').get(id, clean)
    : db.prepare('SELECT 1 FROM playlist_folders WHERE parent_id=? AND id<>? AND lower(name)=lower(?)').get(current.parent_id, id, clean)
  if (duplicate) throw new Error('A folder with this name already exists at that level.')
  db.prepare('UPDATE playlist_folders SET name=? WHERE id=?').run(clean, id)
  return listPlaylistFolders()
}

export function deletePlaylistFolder(id: number): PlaylistFolder[] {
  if (!db.prepare('SELECT 1 FROM playlist_folders WHERE id=?').get(id)) return listPlaylistFolders()
  const descendants = db.prepare(`WITH RECURSIVE folder_tree(id) AS (
    SELECT id FROM playlist_folders WHERE id=?
    UNION ALL SELECT f.id FROM playlist_folders f JOIN folder_tree parent ON f.parent_id=parent.id
  ) SELECT id FROM folder_tree`).all(id) as {id:number}[]
  const tx = db.transaction(() => {
    // Deleting a folder removes its folder subtree, but preserves every playlist by returning it to Unfiled.
    const clear = db.prepare('UPDATE playlists SET folder_id=NULL WHERE folder_id=?')
    descendants.forEach(folder => clear.run(folder.id))
    db.prepare('DELETE FROM playlist_folders WHERE id=?').run(id)
  })
  tx()
  return listPlaylistFolders()
}

export function movePlaylistToFolder(playlistId: number, folderId: number | null): Playlist[] {
  if (!db.prepare('SELECT 1 FROM playlists WHERE id=?').get(playlistId)) throw new Error('The playlist no longer exists.')
  if (folderId !== null && !db.prepare('SELECT 1 FROM playlist_folders WHERE id=?').get(folderId)) throw new Error('The destination folder no longer exists.')
  db.prepare('UPDATE playlists SET folder_id=? WHERE id=?').run(folderId, playlistId)
  return listPlaylists()
}

export function renamePlaylist(id: number, name: string) {
  if (!name.trim()) throw new Error('Playlist name cannot be empty')
  db.prepare('UPDATE playlists SET name=? WHERE id=?').run(name.trim(), id)
  return listPlaylists()
}
export function deletePlaylist(id: number) { db.prepare('DELETE FROM playlists WHERE id=?').run(id); return listPlaylists() }
export function addPlaylistTracks(id: number, paths: string[]) {
  const insert = db.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_path,position) VALUES(?,?,?)')
  const count = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM playlist_tracks WHERE playlist_id=?').get(id) as { n: number }).n
  const tx = db.transaction(() => paths.forEach((p, i) => insert.run(id, p, count + i)))
  tx(); return getPlaylistTracks(id)
}
export function removePlaylistTrack(id: number, trackPath: string) {
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_path=?').run(id, trackPath)
  const rows = db.prepare('SELECT track_path FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(id) as { track_path: string }[]
  const set = db.prepare('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_path=?')
  const tx = db.transaction(() => rows.forEach((r, i) => set.run(i, id, r.track_path)))
  tx(); return getPlaylistTracks(id)
}
export function getPlaylistTracks(id: number): Track[] {
  return (db.prepare(`SELECT t.*, a.key AS art_key FROM playlist_tracks pt JOIN tracks t ON t.path=pt.track_path LEFT JOIN artworks a ON t.artwork_key=a.key WHERE pt.playlist_id=? ORDER BY pt.position`).all(id) as any[]).map(r => ({
    path: r.path, title: r.title, artist: r.artist, album: r.album, trackNo: r.track_no, genre: r.genre,
    year: r.year, duration: r.duration, artworkUrl: r.art_key ? `myriff-art://${r.art_key}` : null,
    folder: r.folder, addedAt: r.added_at, source: 'local'
  }))
}
export function saveLyrics(trackPath: string, lines: unknown[]) { db.prepare('INSERT INTO lyrics(track_path,content_json,updated_at) VALUES(?,?,?) ON CONFLICT(track_path) DO UPDATE SET content_json=excluded.content_json,updated_at=excluded.updated_at').run(trackPath, JSON.stringify(lines), Date.now()); return true }
export function getLyrics(trackPath: string) { const row = db.prepare('SELECT content_json FROM lyrics WHERE track_path=?').get(trackPath) as { content_json: string } | undefined; if (!row) return null; try { return JSON.parse(row.content_json) } catch { return null } }
export function addDownload(row: { id: string; title: string; filePath: string; sourceUrl: string; format: string }) {
  db.prepare('INSERT OR REPLACE INTO downloads(id,title,file_path,source_url,format,created_at) VALUES(?,?,?,?,?,?)').run(row.id,row.title,row.filePath,row.sourceUrl,row.format,Date.now())
}
export function listDownloads() { return db.prepare('SELECT id,title,file_path AS filePath,source_url AS sourceUrl,format,created_at AS createdAt FROM downloads ORDER BY created_at DESC').all() }
export function forgetDownload(id: string) { db.prepare('DELETE FROM downloads WHERE id=?').run(id) }
export function checkpointDatabase() { if (db?.open) db.pragma('wal_checkpoint(TRUNCATE)') }
export function closeDatabase() { if (db?.open) db.close() }

export function setTrackFavorite(trackPath: string, favorite: boolean) {
  db.prepare('INSERT INTO track_stats(path,favorite) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET favorite=excluded.favorite').run(trackPath, favorite ? 1 : 0)
  return favorite
}
export function setTrackRating(trackPath: string, rating: number) {
  const score = Math.max(0, Math.min(5, Math.round(rating)))
  db.prepare('INSERT INTO track_stats(path,rating) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET rating=excluded.rating').run(trackPath, score)
  return score
}
export function setReplayGain(trackPath: string, gainDb: number | null) {
  db.prepare('INSERT INTO track_stats(path,replay_gain_db) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET replay_gain_db=excluded.replay_gain_db').run(trackPath, gainDb)
  return gainDb
}
export function recordPlayedTrack(input: { trackPath?: string | null; title: string; artist?: string; source?: string }) {
  const now = Date.now()
  if (input.trackPath) {
    db.prepare('INSERT INTO track_stats(path,play_count,last_played) VALUES(?,1,?) ON CONFLICT(path) DO UPDATE SET play_count=track_stats.play_count+1,last_played=excluded.last_played').run(input.trackPath, now)
  }
  const settings = getSettings()
  if (settings.historyEnabled) {
    db.prepare('INSERT INTO listening_history(track_path,title,artist,source,played_at) VALUES(?,?,?,?,?)')
      .run(input.trackPath ?? null, input.title, input.artist ?? '', input.source ?? 'local', now)
    db.prepare('DELETE FROM listening_history WHERE id NOT IN (SELECT id FROM listening_history ORDER BY played_at DESC LIMIT ?)').run(Math.max(20, Math.min(10000, settings.historyLimit)))
  }
  return true
}
export function listListeningHistory(limit = 100): ListeningHistoryItem[] {
  return db.prepare('SELECT id,track_path AS trackPath,title,artist,source,played_at AS playedAt FROM listening_history ORDER BY played_at DESC LIMIT ?')
    .all(Math.max(1, Math.min(1000, Math.floor(limit)))) as ListeningHistoryItem[]
}
export function clearListeningHistory() { db.prepare('DELETE FROM listening_history').run(); return true }
export function addBookmark(trackPath: string, position: number, label = '') {
  if (!isKnownTrack(trackPath)) throw new Error('Bookmarks can only be created for local library tracks.')
  const result = db.prepare('INSERT INTO bookmarks(track_path,position,label,created_at) VALUES(?,?,?,?)').run(trackPath, Math.max(0, position), label.trim() || `Bookmark ${Math.floor(position)}s`, Date.now())
  return db.prepare('SELECT id,track_path AS trackPath,position,label,created_at AS createdAt FROM bookmarks WHERE id=?').get(Number(result.lastInsertRowid)) as TrackBookmark
}
export function listBookmarks(trackPath?: string): TrackBookmark[] {
  const sql = 'SELECT id,track_path AS trackPath,position,label,created_at AS createdAt FROM bookmarks'
  return (trackPath ? db.prepare(`${sql} WHERE track_path=? ORDER BY position`).all(trackPath) : db.prepare(`${sql} ORDER BY created_at DESC`).all()) as TrackBookmark[]
}
export function deleteBookmark(id: number) { db.prepare('DELETE FROM bookmarks WHERE id=?').run(id); return true }
export function createSmartPlaylist(name: string, rules: SmartPlaylistRule[], match: 'all'|'any' = 'all') {
  const clean = name.trim()
  if (!clean) throw new Error('Smart playlist name cannot be empty.')
  if (!Array.isArray(rules) || !rules.length) throw new Error('Add at least one rule to a smart playlist.')
  const result = db.prepare('INSERT INTO smart_playlists(name,rules_json,match_mode,created_at) VALUES(?,?,?,?)').run(clean, JSON.stringify(rules), match, Date.now())
  return listSmartPlaylists().find(x => x.id === Number(result.lastInsertRowid))!
}
export function listSmartPlaylists(): SmartPlaylist[] {
  return (db.prepare('SELECT id,name,rules_json,match_mode,created_at FROM smart_playlists ORDER BY name COLLATE NOCASE').all() as any[]).map(row => ({
    id: row.id, name: row.name, rules: safeJson(row.rules_json, []), match: row.match_mode === 'any' ? 'any' : 'all', createdAt: row.created_at
  }))
}
export function deleteSmartPlaylist(id: number) { db.prepare('DELETE FROM smart_playlists WHERE id=?').run(id); return true }
function safeJson<T>(raw: string, fallback: T): T { try { return JSON.parse(raw) as T } catch { return fallback } }
export function getSmartPlaylistTracks(id: number): Track[] {
  const playlist = listSmartPlaylists().find(x => x.id === id)
  if (!playlist) return []
  const normal = (v: unknown) => String(v ?? '').toLocaleLowerCase().trim()
  const matchesRule = (track: Track, rule: SmartPlaylistRule) => {
    const value = (track as unknown as Record<string, unknown>)[rule.field]
    if (rule.operator === 'isTrue') return Boolean(value) === true
    if (rule.operator === 'isFalse') return !Boolean(value)
    if (rule.operator === 'beforeDays') { const dateValue = rule.field === 'addedAt' ? track.addedAt : track.lastPlayed; return Boolean(dateValue) && Number(dateValue) <= Date.now() - Number(rule.value) * 86400000 }
    if (rule.operator === 'contains') return normal(value).includes(normal(rule.value))
    if (rule.operator === 'equals') return typeof value === 'number' ? Number(value) === Number(rule.value) : normal(value) === normal(rule.value)
    if (rule.operator === 'notEquals') return typeof value === 'number' ? Number(value) !== Number(rule.value) : normal(value) !== normal(rule.value)
    if (rule.operator === 'greaterThan') return Number(value || 0) > Number(rule.value)
    if (rule.operator === 'lessThan') return Number(value || 0) < Number(rule.value)
    return false
  }
  return listTracks().filter(track => playlist.match === 'all' ? playlist.rules.every(r => matchesRule(track, r)) : playlist.rules.some(r => matchesRule(track, r)))
}
export function upsertLibraryRoot(folder: string, watched: boolean) {
  db.prepare('INSERT INTO library_roots(path,watched,last_scan) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET watched=excluded.watched,last_scan=excluded.last_scan').run(folder, watched ? 1 : 0, Date.now())
}
export function listLibraryRoots() { return db.prepare('SELECT path,watched,last_scan AS lastScan FROM library_roots ORDER BY path').all() as { path: string; watched: number; lastScan: number | null }[] }
export function exportBackupObject() {
  return {
    format: 'myriff-backup', version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), playback: getPlayback(),
    tracks: db.prepare('SELECT * FROM tracks').all(), artworks: db.prepare('SELECT * FROM artworks').all(),
    trackStats: db.prepare('SELECT * FROM track_stats').all(), playlistFolders: db.prepare('SELECT * FROM playlist_folders').all(), playlists: db.prepare('SELECT * FROM playlists').all(),
    playlistTracks: db.prepare('SELECT * FROM playlist_tracks').all(), smartPlaylists: db.prepare('SELECT * FROM smart_playlists').all(),
    bookmarks: db.prepare('SELECT * FROM bookmarks').all(), history: db.prepare('SELECT * FROM listening_history').all(),
    lyrics: db.prepare('SELECT * FROM lyrics').all(), downloads: db.prepare('SELECT * FROM downloads').all()
  }
}
export function restoreBackupObject(backup: any) {
  if (!backup || backup.format !== 'myriff-backup' || backup.version !== 1) throw new Error('This is not a supported MyRiff backup.')
  const transaction = db.transaction(() => {
    for (const row of Array.isArray(backup.tracks) ? backup.tracks : []) {
      db.prepare(`INSERT OR IGNORE INTO tracks(path,title,artist,album,track_no,genre,year,duration,artwork_key,folder,added_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run(row.path,row.title,row.artist,row.album,row.track_no,row.genre,row.year,row.duration,row.artwork_key,row.folder,row.added_at)
    }
    for (const row of Array.isArray(backup.artworks) ? backup.artworks : []) db.prepare('INSERT OR IGNORE INTO artworks(key,path,mime) VALUES(?,?,?)').run(row.key,row.path,row.mime)
    for (const row of Array.isArray(backup.trackStats) ? backup.trackStats : []) if (isKnownTrack(row.path)) db.prepare('INSERT OR REPLACE INTO track_stats(path,favorite,rating,play_count,last_played,replay_gain_db,file_size) VALUES(?,?,?,?,?,?,?)').run(row.path,row.favorite,row.rating,row.play_count,row.last_played,row.replay_gain_db,row.file_size)
    for (const [key,value] of Object.entries(backup.settings ?? {})) if (key in defaults) db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))
    if (backup.playback) setPlayback(backup.playback)
    const pendingFolders = Array.isArray(backup.playlistFolders) ? [...backup.playlistFolders].sort((a, b) => Number(a.id) - Number(b.id)) : []
    while (pendingFolders.length) {
      const before = pendingFolders.length
      for (let i = pendingFolders.length - 1; i >= 0; i--) {
        const row = pendingFolders[i]
        const parentId = row.parent_id ?? null
        if (parentId !== null && !db.prepare('SELECT 1 FROM playlist_folders WHERE id=?').get(parentId)) continue
        db.prepare('INSERT OR IGNORE INTO playlist_folders(id,name,parent_id,created_at) VALUES(?,?,?,?)').run(row.id,row.name,parentId,row.created_at)
        pendingFolders.splice(i, 1)
      }
      if (pendingFolders.length === before) break // Skip malformed orphaned folder records instead of blocking the entire restore.
    }
    for (const row of Array.isArray(backup.playlists) ? backup.playlists : []) {
      const requestedFolderId = row.folder_id ?? null
      const folderId = requestedFolderId !== null && db.prepare('SELECT 1 FROM playlist_folders WHERE id=?').get(requestedFolderId) ? requestedFolderId : null
      db.prepare('INSERT OR IGNORE INTO playlists(id,name,created_at,folder_id) VALUES(?,?,?,?)').run(row.id,row.name,row.created_at,folderId)
    }
    for (const row of Array.isArray(backup.playlistTracks) ? backup.playlistTracks : []) if (isKnownTrack(row.track_path)) db.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_path,position) VALUES(?,?,?)').run(row.playlist_id,row.track_path,row.position)
    for (const row of Array.isArray(backup.smartPlaylists) ? backup.smartPlaylists : []) db.prepare('INSERT OR IGNORE INTO smart_playlists(id,name,rules_json,match_mode,created_at) VALUES(?,?,?,?,?)').run(row.id,row.name,row.rules_json,row.match_mode,row.created_at)
    for (const row of Array.isArray(backup.bookmarks) ? backup.bookmarks : []) if (isKnownTrack(row.track_path)) db.prepare('INSERT OR IGNORE INTO bookmarks(id,track_path,position,label,created_at) VALUES(?,?,?,?,?)').run(row.id,row.track_path,row.position,row.label,row.created_at)
    for (const row of Array.isArray(backup.history) ? backup.history : []) db.prepare('INSERT OR IGNORE INTO listening_history(id,track_path,title,artist,source,played_at) VALUES(?,?,?,?,?,?)').run(row.id,row.track_path,row.title,row.artist,row.source,row.played_at)
    for (const row of Array.isArray(backup.lyrics) ? backup.lyrics : []) if (isKnownTrack(row.track_path)) db.prepare('INSERT OR REPLACE INTO lyrics(track_path,content_json,updated_at) VALUES(?,?,?)').run(row.track_path,row.content_json,row.updated_at)
    for (const row of Array.isArray(backup.downloads) ? backup.downloads : []) db.prepare('INSERT OR IGNORE INTO downloads(id,title,file_path,source_url,format,created_at) VALUES(?,?,?,?,?,?)').run(row.id,row.title,row.file_path,row.source_url,row.format,row.created_at)
  })
  transaction()
  return true
}
export function exportPlaylistEntries(id: number) {
  const playlist = listPlaylists().find(x => x.id === id)
  if (!playlist) throw new Error('Playlist not found.')
  return { playlist, tracks: getPlaylistTracks(id) }
}

export function removeTracks(paths: string[]) {
  const tx = db.transaction(() => paths.forEach(trackPath => db.prepare('DELETE FROM tracks WHERE path=?').run(trackPath)))
  tx(); return paths.length
}
export function removeMissingTracksWithinRoot(root: string, presentPaths: string[]) {
  const rootResolved = path.resolve(root)
  const existing = db.prepare('SELECT path FROM tracks').all() as { path: string }[]
  const keep = new Set(presentPaths.map(p => path.resolve(p)))
  const missing = existing.map(x => x.path).filter(p => {
    const resolved = path.resolve(p)
    return (resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)) && !keep.has(resolved)
  })
  const tx = db.transaction(() => missing.forEach(trackPath => db.prepare('DELETE FROM tracks WHERE path=?').run(trackPath)))
  tx(); return missing
}


export function saveDownloadJob(progress: DownloadProgress) {
  const id = progress.id
  db.prepare(`INSERT INTO download_jobs(id,url,format,status,title,progress,error,updated_at,completed,total,file_path,include_playlist)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,format=excluded.format,status=excluded.status,
    title=excluded.title,progress=excluded.progress,error=excluded.error,updated_at=excluded.updated_at,completed=excluded.completed,
    total=excluded.total,file_path=COALESCE(excluded.file_path,download_jobs.file_path),include_playlist=excluded.include_playlist`)
    .run(id, progress.url || '', progress.format || 'opus', progress.status, progress.title || '', progress.percent || 0,
      progress.error || '', Date.now(), progress.completed || 0, progress.total ?? null, progress.filePath || null, progress.includePlaylist ? 1 : 0)
  return true
}
export function listDownloadJobs(): (DownloadProgress & { updatedAt: number })[] {
  return (db.prepare(`SELECT id,url,format,status,title,progress AS percent,error,updated_at AS updatedAt,completed,total,file_path AS filePath,include_playlist AS includePlaylist
    FROM download_jobs ORDER BY updated_at DESC LIMIT 100`).all() as any[]).map(row => ({
      id: row.id, url: row.url, format: row.format, status: row.status, title: row.title, percent: Number(row.percent || 0),
      error: row.error || undefined, updatedAt: row.updatedAt, completed: Number(row.completed || 0), total: row.total ?? undefined,
      filePath: row.filePath || undefined, includePlaylist: Boolean(row.includePlaylist), speed: '', eta: ''
    }))
}
export function markInterruptedDownloadJobs() {
  db.prepare(`UPDATE download_jobs SET status='paused', error='Interrupted when MyRiff closed. Retry to resume partial downloads.', updated_at=? WHERE status IN ('queued','downloading')`).run(Date.now())
}


export function savePlaylistSource(name: string, url: string, format: 'mp3'|'flac'|'opus'): SavedPlaylistSource {
  const cleanName = name.trim() || url.trim()
  const cleanUrl = url.trim()
  if (!cleanUrl) throw new Error('Playlist URL cannot be empty.')
  db.prepare(`INSERT INTO playlist_sources(name,url,format,created_at) VALUES(?,?,?,?)
    ON CONFLICT(url) DO UPDATE SET name=excluded.name,format=excluded.format`).run(cleanName, cleanUrl, format, Date.now())
  return listPlaylistSources().find(item => item.url === cleanUrl)!
}
export function listPlaylistSources(): SavedPlaylistSource[] {
  return db.prepare(`SELECT id,name,url,format,last_synced AS lastSynced,created_at AS createdAt FROM playlist_sources ORDER BY COALESCE(last_synced,0) DESC,created_at DESC`).all() as SavedPlaylistSource[]
}
export function deletePlaylistSource(id: number) { db.prepare('DELETE FROM playlist_sources WHERE id=?').run(id); return true }
export function touchPlaylistSource(id: number) { db.prepare('UPDATE playlist_sources SET last_synced=? WHERE id=?').run(Date.now(), id); return listPlaylistSources() }
