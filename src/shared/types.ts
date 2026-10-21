export type RepeatMode = 'off' | 'all' | 'one'
export type ThemeMode = 'dark' | 'light' | 'system'
export type DownloadFormat = 'mp3' | 'flac' | 'opus'
export type StreamSource = 'YouTube' | 'YouTube Music' | 'SoundCloud'
export type VisualizerStyle = 'bars' | 'wave' | 'mirror' | 'spectrum' | 'dots'
export interface VisualizerLayout { id: string; name: string; style: VisualizerStyle; sensitivity: number; enabled: boolean; createdAt: number }
export type UiDensity = 'comfortable' | 'compact' | 'cozy'
export type EffectName = 'eq' | 'distortion' | 'reverb'

export interface Track {
  path: string
  title: string
  artist: string
  album: string
  trackNo: number | null
  genre: string
  year: number | null
  duration: number
  artworkUrl: string | null
  folder: string
  addedAt: number
  source?: 'local'
  favorite?: boolean
  rating?: number
  playCount?: number
  lastPlayed?: number | null
  replayGainDb?: number | null
  fileSize?: number
}

export interface PlaylistFolder {
  id: number
  name: string
  parentId: number | null
  createdAt: number
  playlistCount: number
}

export interface Playlist {
  id: number
  name: string
  createdAt: number
  trackCount: number
  folderId: number | null
}

export interface SmartPlaylist {
  id: number
  name: string
  rules: SmartPlaylistRule[]
  match: 'all' | 'any'
  createdAt: number
}

export interface SmartPlaylistRule {
  field: 'title' | 'artist' | 'album' | 'genre' | 'year' | 'rating' | 'playCount' | 'lastPlayed' | 'addedAt' | 'duration' | 'favorite'
  operator: 'contains' | 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'beforeDays' | 'isTrue' | 'isFalse'
  value: string | number | boolean
}

export interface TrackBookmark {
  id: number
  trackPath: string
  position: number
  label: string
  createdAt: number
}

export interface ListeningHistoryItem {
  id: number
  trackPath: string | null
  title: string
  artist: string
  source: string
  playedAt: number
}

export interface SavedPlaylistSource { id: number; name: string; url: string; format: DownloadFormat; lastSynced: number | null; createdAt: number }

export interface RemotePlaylistPreview {
  title: string
  uploader: string
  total: number
  entries: Array<{ id: string; title: string; artist: string; duration: number; thumbnail: string | null; url: string; localPath: string | null }>
  truncated: boolean
}

export interface SearchResult {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  webpageUrl: string
  thumbnail: string | null
  source: StreamSource
}

export interface DownloadProgress {
  id: string
  status: 'queued' | 'downloading' | 'paused' | 'finished' | 'error' | 'cancelled'
  title: string
  percent: number
  speed: string
  eta: string
  filePath?: string
  error?: string
  url?: string
  format?: DownloadFormat
  completed?: number
  total?: number
  includePlaylist?: boolean
}

export interface LyricsResult { synced: boolean; lines: LyricLine[]; provider: string; source?: string }
export interface LyricWord { time: number; text: string }
export interface LyricLine { time: number | null; text: string; words?: LyricWord[] }

export interface AudioProfile {
  id: string
  name: string
  matchBy: 'manual' | 'genre' | 'artist' | 'device'
  matchValue: string
  eqBands: number[]
  eqFrequencies?: number[]
  eqQ?: number
  stereoWidth?: number
  tempo: number
  pitch: number
  reverb: number
  distortion: number
  enabled: boolean
}

export interface AppSettings {
  musicFolder: string
  theme: ThemeMode
  accent: string
  dynamicAccent: boolean
  downloadFormat: DownloadFormat
  downloadQuality: string
  downloadFolder: string
  downloadConcurrency: number
  downloadRetries: number
  playlistAutoSync: boolean
  playlistSyncIntervalHours: number
  streamPriority: StreamSource[]
  lyricsProvider: 'lrclib' | 'local-first'
  saveLyricsLocally: boolean
  discordRpc: boolean
  discordClientId: string
  ffmpegPath: string
  ytDlpPath: string
  denoPath: string
  customCss: string
  bannerPath: string
  inhibitSleep: boolean
  eqPreset: string
  eqBands: number[]
  eqFrequencies: number[]
  eqQ: number
  stereoWidth: number
  effectTempo: number
  effectPitch: number
  effectReverb: number
  effectDistortion: number
  effectChain: EffectName[]
  effectsBypass: boolean
  crossfadeSeconds: number
  normalizeLoudness: boolean
  loudnessTargetLufs: number
  audioOutputDeviceId: string
  sleepTimerMinutes: number
  viewMode: 'grid' | 'list'
  groupBy: 'folder' | 'artist' | 'album' | 'genre'
  autoWatchFolders: boolean
  duplicateScanMode: 'hash' | 'metadata' | 'both'
  uiDensity: UiDensity
  cornerRadius: number
  uiScale: number
  sidebarWidth: number
  gridColumns: number
  animationsEnabled: boolean
  showArtworkBackground: boolean
  showVisualizer: boolean
  visualizerStyle: VisualizerStyle
  visualizerSensitivity: number
  visualizerLayouts: VisualizerLayout[]
  defaultPage: 'library' | 'playlists' | 'search' | 'downloads' | 'playlist-studio' | 'power-tools' | 'radio' | 'editor' | 'lyrics' | 'sound' | 'settings'
  showTrackNumbers: boolean
  showYear: boolean
  showGenre: boolean
  confirmDestructiveActions: boolean
  keyboardShortcuts: Record<string, string>
  globalShortcutsEnabled: boolean
  globalKeyboardShortcuts: Record<string, string>
  audioProfiles: AudioProfile[]
  historyEnabled: boolean
  historyLimit: number
  autoEnrichMetadata: boolean
  metadataProvider: 'musicbrainz' | 'off'
  playlistImportMatchThreshold: number
  portableMode: boolean
  useSystemTitlebar: boolean
}

export interface PlaybackState {
  path: string | null
  position: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  queuePaths: string[]
}

export interface EditorSession {
  trackPath: string
  start: number
  end: number
  speed: number
  reverb: number
  distortion: number
  eqBands: number[]
  updatedAt: number
}

export interface EditorRequest {
  inputPath: string
  outputPath: string
  start: number
  end?: number
  speed?: number
  reverb?: number
  distortion?: number
  eqGain?: number
  eqBands?: number[]
  eqFrequencies?: number[]
  eqQ?: number
  stereoWidth?: number
  effectChain?: EffectName[]
}

export interface ImportResult {
  playlistId: number
  playlistName: string
  total: number
  found: number
  missing: string[]
}

export interface DuplicateGroup {
  kind: 'identical-file' | 'metadata-match'
  signature: string
  tracks: Array<Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'duration' | 'fileSize'>>
}

export interface MetadataSuggestion {
  provider: string
  title: string
  artist: string
  album: string
  year: number | null
  musicBrainzRecordingId?: string
  musicBrainzReleaseId?: string
  artworkUrl?: string | null
  confidence: number
}
