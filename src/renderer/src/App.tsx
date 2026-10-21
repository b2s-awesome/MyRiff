import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Fuse from 'fuse.js'
import {
  AudioLines, Check, ChevronDown, CircleHelp, Download, FileAudio, FolderOpen, Headphones,
  Home, LibraryBig, ListMusic, LoaderCircle, Moon, Music2, Palette, Pause,
  Play, Plus, Radio, Search, Settings as SettingsIcon, ChevronUp, SlidersHorizontal, Sparkles, Sun,
  Trash2, Upload, X, Pencil, RefreshCw, Heart, Disc3, Music, ArrowUpRight, ExternalLink,
  WandSparkles, History, Star, AudioWaveform, Keyboard, Bookmark, Archive, CheckCircle2
} from 'lucide-react'
import type { AppSettings, DownloadProgress, LyricsResult, LyricLine, Playlist, PlaylistFolder, SearchResult, StreamSource, Track, PlaybackState, VisualizerLayout } from '../../shared/types'
import TrackGrid from './components/TrackGrid'
import PlayerBar from './components/PlayerBar'
import EffectsPanel from './components/EffectsPanel'
import PlaylistStudio from './components/PlaylistStudio'
import PowerToolsPage from './components/PowerToolsPage'
import Visualizer from './components/Visualizer'
import WaveformPreview from './components/WaveformPreview'
import AdvancedSettings from './components/AdvancedSettings'
import LocalRadio from './components/LocalRadio'
import { useAudioEngine } from './useAudioEngine'
import './styles.css'

type Page = 'library' | 'playlists' | 'search' | 'downloads' | 'playlist-studio' | 'power-tools' | 'radio' | 'editor' | 'lyrics' | 'sound' | 'settings'
type PlayableTrack = Track & { streamUrl?: string; streamSource?: StreamSource; originalUrl?: string }
type DownloadRecord = { id: string; title: string; filePath: string; sourceUrl: string; format: string; createdAt: number }
type CrossfadeEntry = { track: PlayableTrack; source: string; phase: 'loading' | 'ready' | 'fading' | 'handoff'; fadeSeconds: number }
const samePlayable = (a: PlayableTrack | null | undefined, b: PlayableTrack | null | undefined) => Boolean(a && b && a.path === b.path && a.streamUrl === b.streamUrl)
const timeLabel = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${String(Math.floor(Math.max(0, value) % 60)).padStart(2, '0')}`
const defaultLines: LyricLine[] = []

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nextAudioRef = useRef<HTMLAudioElement | null>(null)
  const crossfadeRef = useRef<CrossfadeEntry | null>(null)
  const autoPlayRef = useRef(false)
  const pendingPositionRef = useRef<number | null>(null)
  const lastSavedRef = useRef(0)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [crossfadeEpoch, setCrossfadeEpoch] = useState(0)
  const audioEngine = useAudioEngine(audioRef, settings, nextAudioRef)
  const { ensureGraph, analyser, crossfadeToNext, handoffToMain, resetCrossfade } = audioEngine
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [playlistFolders, setPlaylistFolders] = useState<PlaylistFolder[]>([])
  const [playlistFolderFilter, setPlaylistFolderFilter] = useState<'all' | 'unfiled' | number>('all')
  const [downloads, setDownloads] = useState<DownloadRecord[]>([])
  const [page, setPage] = useState<Page>('library')
  const [globalSearch, setGlobalSearch] = useState('')
  const [playlistId, setPlaylistId] = useState<number | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([])
  const [draggedPlaylistTrackPath, setDraggedPlaylistTrackPath] = useState<string | null>(null)
  const [playlistDropTargetPath, setPlaylistDropTargetPath] = useState<string | null>(null)
  const [current, setCurrent] = useState<PlayableTrack | null>(null)
  const [playContext, setPlayContext] = useState<PlayableTrack[]>([])
  const [queue, setQueue] = useState<PlayableTrack[]>([])
  const [audioSrc, setAudioSrc] = useState('')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.75)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<'off'|'all'|'one'>('off')
  const [queueOpen, setQueueOpen] = useState(false)
  const [mini, setMini] = useState(false)
  const [scanState, setScanState] = useState<{done:number;total:number;current:string}|null>(null)
  const [toast, setToast] = useState('')
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const lastRecordedTrackRef = useRef('')
  const lastProfileKeyRef = useRef('')
  const [busy, setBusy] = useState(false)
  const [liveAccent, setLiveAccent] = useState('#b69cff')
  const [bannerUrl, setBannerUrl] = useState('')
  const [streamQuery, setStreamQuery] = useState('')
  const [streamSource, setStreamSource] = useState<StreamSource>('YouTube Music')
  const [streamResults, setStreamResults] = useState<SearchResult[]>([])
  const [streamLoading, setStreamLoading] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importName, setImportName] = useState('')
  const [importReport, setImportReport] = useState<{total:number;found:number;missing:string[]}|null>(null)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloadJobs, setDownloadJobs] = useState<DownloadProgress[]>([])
  const [metadataReviewQueue, setMetadataReviewQueue] = useState<string[]>([])
  const [selectedEditorPath, setSelectedEditorPath] = useState('')
  const [editStart, setEditStart] = useState(0)
  const [editEnd, setEditEnd] = useState(0)
  const [trimUndo, setTrimUndo] = useState<Array<{ start: number; end: number }>>([])
  const [trimRedo, setTrimRedo] = useState<Array<{ start: number; end: number }>>([])
  const [editSpeed, setEditSpeed] = useState(1)
  const [editReverb, setEditReverb] = useState(0)
  const [editDistortion, setEditDistortion] = useState(0)
  const [editEqBands, setEditEqBands] = useState<number[]>(Array(10).fill(0))
  const [editProgress, setEditProgress] = useState<number|null>(null)
  const [editorSessionStatus, setEditorSessionStatus] = useState('Choose a local track to edit.')
  const [visualizerLayoutName, setVisualizerLayoutName] = useState('')
  const editorSessionReadyPathRef = useRef('')
  const editorSessionSaveTokenRef = useRef(0)
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [lyricLines, setLyricLines] = useState<LyricLine[]>(defaultLines)
  const [lyricsBusy, setLyricsBusy] = useState(false)
  const [lyricStatus, setLyricStatus] = useState('')
  const [karaokeMode, setKaraokeMode] = useState(false)
  const [newPlaylistTrack, setNewPlaylistTrack] = useState<Track | null>(null)
  const [showAddPlaylist, setShowAddPlaylist] = useState(false)
  const [addToPlaylistId, setAddToPlaylistId] = useState<number|null>(null)
  const [showEffects, setShowEffects] = useState(false)
  const booted = useRef(false)
  const currentRef = useRef<PlayableTrack|null>(null)
  const queueRef = useRef<PlayableTrack[]>([])
  const playContextRef = useRef<PlayableTrack[]>([])
  currentRef.current = current; queueRef.current = queue; playContextRef.current = playContext

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3400)
  }, [])

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(old => old ? { ...old, ...patch } : old)
    try { const updated = await window.myriff.setSettings(patch); setSettings(updated) }
    catch (e) {
      try { setSettings(await window.myriff.getSettings()) } catch { /* retain the last known settings if recovery fails */ }
      notify(e instanceof Error ? e.message : 'Could not save settings.')
    }
  }, [notify])

  const saveVisualizerLayout = useCallback(async () => {
    const name = visualizerLayoutName.trim().slice(0, 48)
    if (!name || !settings) { notify('Enter a name for this visualiser layout.'); return }
    const layout: VisualizerLayout = {
      id: window.crypto.randomUUID(),
      name,
      style: settings.visualizerStyle,
      sensitivity: settings.visualizerSensitivity,
      enabled: settings.showVisualizer,
      createdAt: Date.now()
    }
    const layouts = [...(settings.visualizerLayouts || []).filter(item => item.name.toLocaleLowerCase() !== name.toLocaleLowerCase()), layout].slice(-30)
    await saveSettings({ visualizerLayouts: layouts })
    setVisualizerLayoutName('')
    notify(`Saved visualiser layout “${name}”.`)
  }, [visualizerLayoutName, settings, saveSettings, notify])

  const applyVisualizerLayout = useCallback(async (layout: VisualizerLayout) => {
    await saveSettings({ visualizerStyle: layout.style, visualizerSensitivity: layout.sensitivity, showVisualizer: layout.enabled })
    notify(`Applied visualiser layout “${layout.name}”.`)
  }, [saveSettings, notify])

  const deleteVisualizerLayout = useCallback(async (layoutId: string) => {
    if (!settings) return
    const layouts = (settings.visualizerLayouts || []).filter(item => item.id !== layoutId)
    await saveSettings({ visualizerLayouts: layouts })
    notify('Visualiser layout deleted.')
  }, [settings, saveSettings, notify])

  const refreshPlaylists = useCallback(async () => {
    const [latestPlaylists, latestFolders] = await Promise.all([window.myriff.listPlaylists(), window.myriff.listPlaylistFolders()])
    setPlaylists(latestPlaylists); setPlaylistFolders(latestFolders)
  }, [])
  const promptCreatePlaylistFolder = useCallback(async (parentId: number | null = null) => {
    const name = prompt(parentId === null ? 'Name your playlist folder' : 'Name your subfolder')
    if (!name?.trim()) return
    try {
      const folder = await window.myriff.createPlaylistFolder(name, parentId)
      await refreshPlaylists(); setPlaylistFolderFilter(folder.id); setPlaylistId(null)
      notify(`Created folder “${folder.name}”.`)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not create folder.') }
  }, [refreshPlaylists, notify])
  const promptRenamePlaylistFolder = useCallback(async (folder: PlaylistFolder) => {
    const name = prompt('Rename folder', folder.name)
    if (!name?.trim()) return
    try { await window.myriff.renamePlaylistFolder(folder.id, name); await refreshPlaylists(); notify('Folder renamed.') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not rename folder.') }
  }, [refreshPlaylists, notify])
  const promptDeletePlaylistFolder = useCallback(async (folder: PlaylistFolder) => {
    if (!confirm(`Delete “${folder.name}” and its subfolders? Playlists inside will be preserved in Unfiled. Audio files will not be deleted.`)) return
    try { await window.myriff.deletePlaylistFolder(folder.id); await refreshPlaylists(); setPlaylistFolderFilter('all'); notify('Folder deleted; playlists were preserved in Unfiled.') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete folder.') }
  }, [refreshPlaylists, notify])
  const movePlaylistToFolder = useCallback(async (playlistIdToMove: number, folderId: number | null) => {
    try {
      await window.myriff.movePlaylistToFolder(playlistIdToMove, folderId)
      await refreshPlaylists()
      setPlaylistFolderFilter(folderId === null ? 'unfiled' : folderId)
      notify(folderId === null ? 'Playlist moved to Unfiled.' : 'Playlist moved into folder.')
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not move playlist.') }
  }, [refreshPlaylists, notify])
  const refreshDownloads = useCallback(async () => { setDownloads(await window.myriff.listDownloads()) }, [])
  const refreshTracks = useCallback(async () => { setTracks(await window.myriff.getTracks()) }, [])
  const toggleFavorite = useCallback(async (track: Track) => { try { await window.myriff.setTrackFavorite(track.path, !track.favorite); await refreshTracks() } catch (e) { notify(e instanceof Error ? e.message : 'Could not update favourite.') } }, [refreshTracks, notify])
  const cycleRating = useCallback(async (track: Track) => { try { await window.myriff.setTrackRating(track.path, ((track.rating || 0) % 5) + 1); await refreshTracks() } catch (e) { notify(e instanceof Error ? e.message : 'Could not update rating.') } }, [refreshTracks, notify])

  const scanFolder = useCallback(async (folder?: string) => {
    const selected = folder || await window.myriff.selectMusicFolder()
    if (!selected) return
    setBusy(true); setScanState({ done: 0, total: 0, current: 'Starting scan…' })
    try {
      const result = await window.myriff.scanFolder(selected)
      setTracks(result.tracks); await refreshPlaylists()
      if (settings && !settings.musicFolder) await saveSettings({ musicFolder: selected })
      notify(`Scanned ${result.scanned.toLocaleString()} audio files.`)
    } catch (e) { notify(e instanceof Error ? e.message : 'The music folder could not be scanned.') }
    finally { setBusy(false); setScanState(null) }
  }, [notify, refreshPlaylists, saveSettings, settings])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      try {
        const [s, lib, pls, folders, saved, dl, savedJobs, reviewQueue] = await Promise.all([window.myriff.getSettings(), window.myriff.getTracks(), window.myriff.listPlaylists(), window.myriff.listPlaylistFolders(), window.myriff.getPlayback(), window.myriff.listDownloads(), window.myriff.getDownloadJobs().catch(() => []), window.myriff.getMetadataReviewQueue().catch(() => [])])
        setSettings(s); setLiveAccent(s.accent); setTracks(lib); setPlaylists(pls); setPlaylistFolders(folders); setDownloads(dl); setDownloadJobs(savedJobs.slice(0, 50)); setMetadataReviewQueue(reviewQueue); setVolume(saved.volume); setShuffle(saved.shuffle); setRepeat(saved.repeat); setPage(s.defaultPage || 'library')
        const all = lib
        if (saved.path) {
          const previous = all.find(t => t.path === saved.path)
          if (previous) { pendingPositionRef.current = saved.position; autoPlayRef.current = false; setCurrent(previous); setPlayContext(all); setQueue(saved.queuePaths.map(p => all.find(t => t.path === p)).filter(Boolean) as Track[]) }
        }
        if (!lib.length && s.musicFolder) {
          try { const result = await window.myriff.scanFolder(s.musicFolder); setTracks(result.tracks) } catch { /* startup must remain usable if drive is unavailable */ }
        }
        if (pls.length) setPlaylistId(pls[0].id)
        if (s.bannerPath) setBannerUrl(await window.myriff.mediaUrl(s.bannerPath))
      } catch (e) { notify(e instanceof Error ? e.message : 'MyRiff could not initialise its library.') }
    })()
  }, [notify])

  useEffect(() => window.myriff.onScanProgress(p => setScanState(p)), [])
  useEffect(() => window.myriff.onLibraryUpdated(latest => setTracks(latest)), [])
  useEffect(() => window.myriff.onDownloadProgress(p => {
    setDownloadJobs(old => [p, ...old.filter(x => x.id !== p.id)])
    if (p.status === 'finished') {
      if (p.filePath) notify(`Downloaded ${p.title}`)
      refreshTracks(); refreshDownloads()
      void window.myriff.getMetadataReviewQueue().then(paths => {
        setMetadataReviewQueue(paths)
        if (paths.length && settings?.autoEnrichMetadata && settings.metadataProvider === 'musicbrainz') setPage('power-tools')
      }).catch(() => undefined)
    }
    if (p.status === 'error') notify(`Download failed: ${p.error || p.title}`)
  }), [notify, refreshTracks, refreshDownloads, settings?.autoEnrichMetadata, settings?.metadataProvider])
  useEffect(() => {
    const trackPath = selectedEditorPath
    if (!trackPath) {
      editorSessionReadyPathRef.current = ''
      setEditorSessionStatus('Choose a local track to edit.')
      return
    }
    let cancelled = false
    editorSessionReadyPathRef.current = ''
    setEditorSessionStatus('Loading saved editor session…')
    const track = tracks.find(item => item.path === trackPath)
    const applyDefaults = () => {
      setEditStart(0)
      setEditEnd(track?.duration || 0)
      setEditSpeed(1)
      setEditReverb(0)
      setEditDistortion(0)
      setEditEqBands(Array(10).fill(0))
      setTrimUndo([])
      setTrimRedo([])
    }
    void window.myriff.getEditorSession(trackPath).then(session => {
      if (cancelled) return
      if (session) {
        setEditStart(session.start)
        setEditEnd(session.end)
        setEditSpeed(session.speed)
        setEditReverb(session.reverb)
        setEditDistortion(session.distortion)
        setEditEqBands(session.eqBands)
        setEditorSessionStatus('Restored the saved edit session for this track.')
      } else {
        applyDefaults()
        setEditorSessionStatus('Editor settings auto-save locally for this track.')
      }
      setTrimUndo([])
      setTrimRedo([])
      editorSessionReadyPathRef.current = trackPath
    }).catch(() => {
      if (cancelled) return
      applyDefaults()
      editorSessionReadyPathRef.current = trackPath
      setEditorSessionStatus('Saved session unavailable; new editor changes will still auto-save.')
    })
    return () => {
      cancelled = true
      if (editorSessionReadyPathRef.current === trackPath) editorSessionReadyPathRef.current = ''
    }
  }, [selectedEditorPath])

  useEffect(() => {
    const trackPath = selectedEditorPath
    if (!trackPath || editorSessionReadyPathRef.current !== trackPath) return
    let cancelled = false
    const saveToken = ++editorSessionSaveTokenRef.current
    setEditorSessionStatus('Unsaved editor changes…')
    const timer = window.setTimeout(() => {
      if (cancelled || saveToken !== editorSessionSaveTokenRef.current || editorSessionReadyPathRef.current !== trackPath) return
      void window.myriff.saveEditorSession({
        trackPath, start: editStart, end: editEnd, speed: editSpeed,
        reverb: editReverb, distortion: editDistortion, eqBands: editEqBands
      }).then(session => {
        if (!cancelled && saveToken === editorSessionSaveTokenRef.current && editorSessionReadyPathRef.current === trackPath) {
          setEditorSessionStatus(`Saved locally at ${new Date(session.updatedAt).toLocaleTimeString()}.`)
        }
      }).catch(error => {
        if (!cancelled && saveToken === editorSessionSaveTokenRef.current && editorSessionReadyPathRef.current === trackPath) {
          setEditorSessionStatus(error instanceof Error ? `Could not save edit session: ${error.message}` : 'Could not save this editor session.')
        }
      })
    }, 500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [selectedEditorPath, editStart, editEnd, editSpeed, editReverb, editDistortion, editEqBands])

  const forgetEditorSession = useCallback(async () => {
    if (!selectedEditorPath) return
    editorSessionSaveTokenRef.current += 1
    try {
      const removed = await window.myriff.deleteEditorSession(selectedEditorPath)
      setEditorSessionStatus(removed ? 'Saved edit session removed. Current controls are unchanged.' : 'There was no saved edit session for this track.')
    } catch (error) {
      setEditorSessionStatus(error instanceof Error ? error.message : 'Could not remove the saved editor session.')
    }
  }, [selectedEditorPath])

  useEffect(() => window.myriff.onEditorProgress(p => setEditProgress(p)), [])
  useEffect(() => window.myriff.onMiniPlayerState(setMini), [])

  useEffect(() => {
    let alive = true
    const refreshOutputs = () => navigator.mediaDevices?.enumerateDevices().then(devices => { if (alive) setAudioOutputs(devices.filter(d => d.kind === 'audiooutput')) }).catch(() => undefined)
    refreshOutputs()
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshOutputs)
    return () => { alive = false; navigator.mediaDevices?.removeEventListener?.('devicechange', refreshOutputs) }
  }, [])
  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (audio && settings?.audioOutputDeviceId && audio.setSinkId) audio.setSinkId(settings.audioOutputDeviceId).catch(e => notify(`Audio output selection failed: ${e instanceof Error ? e.message : 'unsupported device'}`))
  }, [settings?.audioOutputDeviceId, notify])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const gainDb = settings?.normalizeLoudness && Number.isFinite(current?.replayGainDb) ? Number(current?.replayGainDb) : 0
    audio.volume = Math.max(0, Math.min(1, volume * Math.pow(10, gainDb / 20)))
  }, [volume, settings?.normalizeLoudness, current?.path, current?.replayGainDb])
  useEffect(() => {
    const minutes = settings?.sleepTimerMinutes || 0
    if (!minutes || !playing) return
    const timer = window.setTimeout(() => {
      audioRef.current?.pause(); setPlaying(false); saveSettings({ sleepTimerMinutes: 0 }); notify('Sleep timer finished. Playback has been paused.')
    }, minutes * 60_000)
    return () => window.clearTimeout(timer)
  }, [settings?.sleepTimerMinutes, playing, saveSettings, notify])
  useEffect(() => {
    if (!current || !settings?.audioProfiles?.length) return
    const profile = settings.audioProfiles.find(p => p.enabled && ((p.matchBy === 'genre' && p.matchValue && p.matchValue.toLowerCase() === current.genre?.toLowerCase()) || (p.matchBy === 'artist' && p.matchValue && p.matchValue.toLowerCase() === current.artist?.toLowerCase()) || (p.matchBy === 'device' && p.matchValue && ((p.matchValue.toLowerCase() === 'default' && !settings.audioOutputDeviceId) || p.matchValue === settings.audioOutputDeviceId || audioOutputs.some(d => d.deviceId === settings.audioOutputDeviceId && d.label.toLowerCase() === p.matchValue.toLowerCase())))))
    const key = `${current.path}|${profile?.id || 'none'}`
    if (lastProfileKeyRef.current === `profile:${key}`) return
    lastProfileKeyRef.current = `profile:${key}`
    if (profile) saveSettings({ eqBands: profile.eqBands, eqFrequencies: profile.eqFrequencies ?? settings.eqFrequencies, eqQ: profile.eqQ ?? settings.eqQ, stereoWidth: profile.stereoWidth ?? settings.stereoWidth, effectTempo: profile.tempo, effectPitch: profile.pitch, effectReverb: profile.reverb, effectDistortion: profile.distortion, eqPreset: profile.name })
  }, [current?.path, current?.genre, current?.artist, settings?.audioProfiles, settings?.audioOutputDeviceId, audioOutputs, saveSettings])
  const fuzzy = useMemo(() => new Fuse(tracks, { keys: ['title','artist','album','genre','folder','path'], threshold: 0.35, ignoreLocation: true }), [tracks])
  const filteredTracks = useMemo(() => globalSearch.trim() ? fuzzy.search(globalSearch).map(x => x.item) : tracks, [globalSearch, fuzzy, tracks])
  const activePlaylist = playlists.find(p => p.id === playlistId) || null
  const reorderPlaylistEntry = useCallback(async (sourcePath: string, targetPath: string) => {
    if (!activePlaylist || sourcePath === targetPath) return
    const orderedPaths = playlistTracks.map(track => track.path)
    const sourceIndex = orderedPaths.indexOf(sourcePath)
    const targetIndex = orderedPaths.indexOf(targetPath)
    if (sourceIndex < 0 || targetIndex < 0) {
      notify('This playlist changed while you were reordering it. Refresh and try again.')
      return
    }
    orderedPaths.splice(sourceIndex, 1)
    orderedPaths.splice(targetIndex, 0, sourcePath)
    try {
      const reordered = await window.myriff.reorderPlaylistTracks(activePlaylist.id, orderedPaths)
      setPlaylistTracks(reordered)
      await refreshPlaylists()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not reorder the playlist.')
      try { setPlaylistTracks(await window.myriff.getPlaylistTracks(activePlaylist.id)) } catch { /* preserve the last rendered list */ }
    } finally {
      setDraggedPlaylistTrackPath(null)
      setPlaylistDropTargetPath(null)
    }
  }, [activePlaylist?.id, playlistTracks, refreshPlaylists, notify])
  const movePlaylistEntry = useCallback((index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= playlistTracks.length) return
    void reorderPlaylistEntry(playlistTracks[index].path, playlistTracks[target].path)
  }, [playlistTracks, reorderPlaylistEntry])
  const visiblePlaylists = useMemo(() => playlistFolderFilter === 'all' ? playlists : playlistFolderFilter === 'unfiled' ? playlists.filter(p => p.folderId === null || p.folderId === undefined) : playlists.filter(p => p.folderId === playlistFolderFilter), [playlists, playlistFolderFilter])
  const folderChildren = useMemo(() => {
    const byParent = new Map<number | null, PlaylistFolder[]>()
    for (const folder of playlistFolders) { const siblings = byParent.get(folder.parentId) || []; siblings.push(folder); byParent.set(folder.parentId, siblings) }
    return byParent
  }, [playlistFolders])
  const selectPlaylistFolder = useCallback((filter: 'all' | 'unfiled' | number) => {
    setPlaylistFolderFilter(filter)
    const list = filter === 'all' ? playlists : filter === 'unfiled' ? playlists.filter(p => p.folderId === null || p.folderId === undefined) : playlists.filter(p => p.folderId === filter)
    if (!list.some(p => p.id === playlistId)) setPlaylistId(list[0]?.id ?? null)
  }, [playlists, playlistId])
  const playlistFolderPath = (folderId: number): string => {
    const parts: string[] = []; const seen = new Set<number>()
    let folder = playlistFolders.find(item => item.id === folderId)
    while (folder && !seen.has(folder.id)) { seen.add(folder.id); parts.unshift(folder.name); folder = folder.parentId === null ? undefined : playlistFolders.find(item => item.id === folder!.parentId) }
    return parts.join(' / ')
  }
  const renderPlaylistFolder = (folder: PlaylistFolder, depth = 0): ReactNode => <div className="playlist-folder-node" key={folder.id}>
    <div className={`playlist-folder-row ${playlistFolderFilter === folder.id ? 'active' : ''}`} style={{ paddingLeft: `${8 + depth * 13}px` }}>
      <button type="button" className="playlist-folder-select" onClick={() => selectPlaylistFolder(folder.id)} title={`Show playlists in ${playlistFolderPath(folder.id)}`}><FolderOpen size={14}/><span>{folder.name}</span><small>{folder.playlistCount}</small></button>
      <div className="playlist-folder-actions">
        <button className="icon-button" title={`Create subfolder in ${folder.name}`} aria-label={`Create subfolder in ${folder.name}`} onClick={() => void promptCreatePlaylistFolder(folder.id)}><Plus size={12}/></button>
        <button className="icon-button" title={`Rename ${folder.name}`} aria-label={`Rename ${folder.name}`} onClick={() => void promptRenamePlaylistFolder(folder)}><Pencil size={12}/></button>
        <button className="icon-button danger" title={`Delete ${folder.name}`} aria-label={`Delete ${folder.name}`} onClick={() => void promptDeletePlaylistFolder(folder)}><Trash2 size={12}/></button>
      </div>
    </div>
    {(folderChildren.get(folder.id) || []).map(child => renderPlaylistFolder(child, depth + 1))}
  </div>
  useEffect(() => { if (playlistId !== null) window.myriff.getPlaylistTracks(playlistId).then(setPlaylistTracks).catch(() => setPlaylistTracks([])); else setPlaylistTracks([]) }, [playlistId, playlists])
  useEffect(() => {
    let cancelled=false; setLyrics(null); setLyricLines([]); setLyricStatus('')
    if(current && !current.streamUrl) window.myriff.getSavedLyrics(current.path).then((lines:any) => { if(!cancelled && Array.isArray(lines) && lines.length) { setLyricLines(lines); setLyrics({ synced: lines.some((l:LyricLine)=>l.time!==null), lines, provider: 'Saved local lyrics' }); setLyricStatus('Saved local timings') } }).catch(()=>undefined)
    return ()=>{cancelled=true}
  }, [current?.path, current?.streamUrl])

  const clearCrossfade = useCallback(() => {
    crossfadeRef.current = null
    const next = nextAudioRef.current
    if (next) { next.pause(); next.currentTime = 0; next.removeAttribute('src'); next.load() }
    resetCrossfade()
  }, [resetCrossfade])

  const peekNextTrack = useCallback((): PlayableTrack | null => {
    const waiting = queueRef.current
    if (waiting.length) return waiting[0]
    const context = playContextRef.current
    if (!context.length) return null
    const index = context.findIndex(t => t.path === currentRef.current?.path && t.streamUrl === currentRef.current?.streamUrl)
    if (repeat === 'all') return context[(index + 1 + context.length) % context.length] || null
    if (shuffle && context.length > 1) {
      const options = context.filter(t => !samePlayable(t, currentRef.current))
      return options.length ? options[Math.floor(Math.random() * options.length)] : null
    }
    return index >= 0 && index < context.length - 1 ? context[index + 1] : null
  }, [repeat, shuffle])

  const playTrack = useCallback((track: PlayableTrack, context?: PlayableTrack[], autoplay = true) => {
    clearCrossfade()
    autoPlayRef.current = autoplay
    if (context) {
      const all = context
      setPlayContext(all)
      const index = all.findIndex(t => t.path === track.path && t.streamUrl === track.streamUrl)
      const next = index >= 0 ? all.slice(index + 1) : []
      setQueue(shuffle ? [...next].sort(() => Math.random() - 0.5) : next)
    }
    setPosition(0); setDuration(track.duration || 0); pendingPositionRef.current = null
    setCurrent(track)
  }, [shuffle, clearCrossfade])

  useEffect(() => {
    let cancelled = false
    if (!current) { setAudioSrc(''); return }
    const pending = crossfadeRef.current
    if (pending?.phase === 'handoff' && samePlayable(pending.track, current)) { setAudioSrc(pending.source); return }
    ;(async () => {
      try {
        const source = current.streamUrl ? await window.myriff.playStream(current.streamUrl) : await window.myriff.mediaUrl(current.path)
        if (!cancelled) setAudioSrc(source)
      } catch (e) { if (!cancelled) { notify(e instanceof Error ? e.message : 'Could not open this audio source.'); setPlaying(false) } }
    })()
    return () => { cancelled = true }
  }, [current?.path, current?.streamUrl, notify])

  useEffect(() => {
    const secondary = nextAudioRef.current
    if (!secondary) return
    if (crossfadeRef.current?.phase === 'handoff') return
    if (!current || !settings?.crossfadeSeconds || repeat === 'one') { clearCrossfade(); return }
    const track = peekNextTrack()
    if (!track || samePlayable(track, current)) { clearCrossfade(); return }
    const existing = crossfadeRef.current
    if (existing && samePlayable(existing.track, track) && ['loading', 'ready', 'fading'].includes(existing.phase)) return
    clearCrossfade()
    const entry: CrossfadeEntry = { track, source: '', phase: 'loading', fadeSeconds: 0 }
    crossfadeRef.current = entry
    let cancelled = false
    ;(async () => {
      const source = track.streamUrl ? await window.myriff.playStream(track.streamUrl) : await window.myriff.mediaUrl(track.path)
      if (cancelled || crossfadeRef.current !== entry) return
      entry.source = source
      secondary.src = source
      secondary.load()
    })().catch(error => {
      if (!cancelled && crossfadeRef.current === entry) {
        crossfadeRef.current = null
        console.debug('MyRiff crossfade preload failed; normal next-track playback remains available.', error)
      }
    })
    return () => { cancelled = true }
  }, [current?.path, current?.streamUrl, queue, playContext, repeat, shuffle, settings?.crossfadeSeconds, crossfadeEpoch, peekNextTrack, clearCrossfade])

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (!audio.src && current) return
      try { await audioEngine.ensureGraph(); await audio.play(); setPlaying(true) }
      catch (e) { notify(e instanceof Error ? e.message : 'Playback could not start.') }
    } else {
      audio.pause(); setPlaying(false)
      if (crossfadeRef.current?.phase === 'fading') clearCrossfade()
    }
  }, [audioEngine, current, notify, clearCrossfade])

  const nextTrack = useCallback(() => {
    const waiting = queueRef.current
    if (waiting.length) {
      const next = waiting[0]; setQueue(waiting.slice(1)); playTrack(next, undefined, true); return
    }
    const context = playContextRef.current
    if (!context.length) return
    const idx = context.findIndex(t => t.path === currentRef.current?.path && t.streamUrl === currentRef.current?.streamUrl)
    if (repeat === 'all') { playTrack(context[(idx + 1 + context.length) % context.length], undefined, true); return }
    if (shuffle && context.length > 1) {
      const options = context.filter(t => t.path !== currentRef.current?.path)
      playTrack(options[Math.floor(Math.random() * options.length)], undefined, true); return
    }
    if (idx >= 0 && idx < context.length - 1) playTrack(context[idx + 1], undefined, true)
    else setPlaying(false)
  }, [playTrack, repeat, shuffle])
  const previousTrack = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 4) { audio.currentTime = 0; setPosition(0); return }
    const context = playContextRef.current
    const idx = context.findIndex(t => t.path === currentRef.current?.path && t.streamUrl === currentRef.current?.streamUrl)
    if (idx > 0) playTrack(context[idx - 1], undefined, true)
    else if (currentRef.current) { if (audio) audio.currentTime = 0; setPosition(0) }
  }, [playTrack])
  const handleEnded = useCallback(() => {
    const transition = crossfadeRef.current
    const secondary = nextAudioRef.current
    if (transition?.phase === 'fading' && secondary && !secondary.paused && samePlayable(transition.track, peekNextTrack())) {
      transition.phase = 'handoff'
      const waiting = queueRef.current
      if (waiting.length && samePlayable(waiting[0], transition.track)) setQueue(waiting.slice(1))
      pendingPositionRef.current = null
      autoPlayRef.current = true
      setDuration(transition.track.duration || 0)
      setPosition(secondary.currentTime)
      setCurrent(transition.track)
      return
    }
    if (repeat === 'one' && audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => undefined); return }
    nextTrack()
  }, [nextTrack, repeat, peekNextTrack])

  const maybeStartCrossfade = useCallback((audio: HTMLAudioElement) => {
    const transition = crossfadeRef.current
    const secondary = nextAudioRef.current
    const fadeConfigured = Number(settings?.crossfadeSeconds || 0)
    if (!transition || transition.phase !== 'ready' || !secondary || !fadeConfigured || repeat === 'one' || !Number.isFinite(audio.duration)) return
    const remaining = audio.duration - audio.currentTime
    if (remaining > fadeConfigured || remaining <= 0.12) return
    transition.phase = 'fading'
    transition.fadeSeconds = Math.max(0.12, Math.min(fadeConfigured, remaining))
    const gainDb = settings?.normalizeLoudness && Number.isFinite(transition.track.replayGainDb) ? Number(transition.track.replayGainDb) : 0
    secondary.volume = Math.max(0, Math.min(1, volume * Math.pow(10, gainDb / 20)))
    secondary.currentTime = 0
    ensureGraph().then(() => secondary.play()).then(() => {
      if (crossfadeRef.current !== transition) { secondary.pause(); return }
      if (!crossfadeToNext(transition.fadeSeconds)) throw new Error('Crossfade gain graph is unavailable.')
    }).catch(error => {
      if (crossfadeRef.current === transition) {
        crossfadeRef.current = null
        secondary.pause(); secondary.currentTime = 0
        resetCrossfade()
        console.debug('Crossfade could not start; normal next-track playback remains available.', error)
      }
    })
  }, [settings?.crossfadeSeconds, settings?.normalizeLoudness, repeat, volume, ensureGraph, crossfadeToNext, resetCrossfade])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioSrc) return
    audio.src = audioSrc; audio.load()
  }, [audioSrc])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])
  useEffect(() => { if (audioRef.current) audioRef.current.loop = repeat === 'one' }, [repeat])
  useEffect(() => {
    const audio = audioRef.current
    const mediaSession = navigator.mediaSession
    if (!audio || !mediaSession) return
    try {
      mediaSession.metadata = current && typeof MediaMetadata !== 'undefined'
        ? new MediaMetadata({
            title: current.title || 'Unknown track',
            artist: current.artist || 'Unknown artist',
            album: current.album || '',
            artwork: current.artworkUrl ? [{ src: current.artworkUrl, sizes: '512x512' }] : []
          })
        : null
    } catch { /* media metadata artwork and fields differ by platform */ }
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { mediaSession.setActionHandler(action, handler) }
      catch { /* action is unavailable on this platform */ }
    }
    setHandler('play', () => { if (audio.paused) void togglePlay() })
    setHandler('pause', () => { if (!audio.paused) { audio.pause(); setPlaying(false) } })
    setHandler('stop', () => { audio.pause(); audio.currentTime = 0; setPosition(0); setPlaying(false) })
    setHandler('nexttrack', nextTrack)
    setHandler('previoustrack', previousTrack)
    setHandler('seekto', details => {
      if (typeof details.seekTime !== 'number' || !Number.isFinite(details.seekTime)) return
      const target = Math.max(0, Math.min(Number.isFinite(audio.duration) ? audio.duration : details.seekTime, details.seekTime))
      audio.currentTime = target; setPosition(target)
    })
    setHandler('seekbackward', details => {
      const target = Math.max(0, audio.currentTime - Math.max(1, details.seekOffset || 10))
      audio.currentTime = target; setPosition(target)
    })
    setHandler('seekforward', details => {
      const limit = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 10
      const target = Math.min(limit, audio.currentTime + Math.max(1, details.seekOffset || 10))
      audio.currentTime = target; setPosition(target)
    })
    return () => {
      for (const action of ['play','pause','stop','nexttrack','previoustrack','seekto','seekbackward','seekforward'] as MediaSessionAction[]) setHandler(action, null)
    }
  }, [current, togglePlay, nextTrack, previousTrack])

  useEffect(() => {
    const mediaSession = navigator.mediaSession
    if (!mediaSession) return
    mediaSession.playbackState = !current ? 'none' : playing ? 'playing' : 'paused'
    if (!current || !Number.isFinite(duration) || duration <= 0) return
    try {
      mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.max(0, Math.min(duration, Number.isFinite(position) ? position : 0))
      })
    } catch { /* position state is optional and varies across Chromium/platform versions */ }
  }, [current?.path, current?.streamUrl, playing, position, duration])

  useEffect(() => {
    const cleanup = window.myriff.onPlayerAction(action => {
      if (action === 'toggle') togglePlay(); if (action === 'next') nextTrack(); if (action === 'previous') previousTrack(); if (action === 'volume-up') setVolume(v=>Math.min(1, Number((v+0.05).toFixed(2)))); if (action === 'volume-down') setVolume(v=>Math.max(0, Number((v-0.05).toFixed(2))))
    })
    return cleanup
  }, [togglePlay, nextTrack, previousTrack])

  useEffect(() => {
    const bindings = settings?.keyboardShortcuts || {}
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName))) return
      const pressed = `${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.metaKey ? 'Meta+' : ''}${event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key}`
      const action = Object.keys(bindings).find(k => String(bindings[k] || '').toLowerCase() === pressed.toLowerCase())
      if (!action) return
      if (action === 'playPause') { event.preventDefault(); togglePlay() }
      else if (action === 'next') { event.preventDefault(); nextTrack() }
      else if (action === 'previous') { event.preventDefault(); previousTrack() }
      else if (action === 'search') { event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus() }
      else if (action === 'queue') { event.preventDefault(); setQueueOpen(v => !v) }
      else if (action === 'favorite' && current && !current.streamUrl) { event.preventDefault(); window.myriff.setTrackFavorite(current.path, !current.favorite).then(refreshTracks).catch(() => undefined) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settings?.keyboardShortcuts, togglePlay, nextTrack, previousTrack, current, refreshTracks])
  useEffect(() => {
    if (!current) return
    window.myriff.updateDiscord({ title: current.title, artist: current.artist, album: current.album, duration, position, artworkUrl: current.artworkUrl }).catch(() => undefined)
  }, [current?.path, current?.streamUrl, current?.title, current?.artist, current?.album, duration, settings?.discordRpc, settings?.discordClientId])

  useEffect(() => {
    if (!settings?.dynamicAccent || !current?.artworkUrl) { if (settings) setLiveAccent(settings.accent); return }
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = current.artworkUrl
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const buckets = new Map<number, { count:number; r:number; g:number; b:number; saturation:number }>()
        for (let i=0;i<pixels.length;i+=4) {
          const r0=pixels[i],g0=pixels[i+1],b0=pixels[i+2],a=pixels[i+3]
          if(a<170) continue
          const max=Math.max(r0,g0,b0),min=Math.min(r0,g0,b0),sat=max===0?0:(max-min)/max
          if(max>248&&min>242) continue
          const key=((r0>>4)<<8)|((g0>>4)<<4)|(b0>>4)
          const bucket=buckets.get(key)||{count:0,r:0,g:0,b:0,saturation:0};bucket.count++;bucket.r+=r0;bucket.g+=g0;bucket.b+=b0;bucket.saturation+=sat;buckets.set(key,bucket)
        }
        const selected=[...buckets.values()].sort((a,b)=>(b.count*(0.75+b.saturation*0.6))-(a.count*(0.75+a.saturation*0.6)))[0]
        if(!selected) return
        const r=Math.round((selected.r/selected.count*.72)+255*.28),g=Math.round((selected.g/selected.count*.72)+255*.28),b=Math.round((selected.b/selected.count*.72)+255*.28)
        setLiveAccent(`#${[r,g,b].map(x => x.toString(16).padStart(2,'0')).join('')}`)
      } catch { setLiveAccent(settings.accent) }
    }
  }, [current?.artworkUrl, settings?.dynamicAccent, settings?.accent])

  useEffect(() => {
    const el = document.getElementById('myriff-custom-css') as HTMLStyleElement | null
    if (el) el.textContent = settings?.customCss || ''
  }, [settings?.customCss])
  useEffect(() => {
    if (settings?.bannerPath) window.myriff.mediaUrl(settings.bannerPath).then(setBannerUrl).catch(() => setBannerUrl(''))
    else setBannerUrl('')
  }, [settings?.bannerPath])

  const savePlayback = useCallback((at: number, force = false) => {
    const now = Date.now()
    if (!force && now - lastSavedRef.current < 3500) return
    lastSavedRef.current = now
    const saved: PlaybackState = { path: current?.streamUrl ? null : current?.path || null, position: at, volume, shuffle, repeat, queuePaths: queue.filter(t => !t.streamUrl).map(t => t.path) }
    window.myriff.savePlayback(saved).catch(() => undefined)
  }, [current, queue, repeat, shuffle, volume])

  const queueTrack = useCallback((track: PlayableTrack) => { setQueue(old => [...old, track]); notify(`Queued ${track.title}`) }, [notify])
  const playNextTrack = useCallback((track: PlayableTrack) => { setQueue(old => [track, ...old]); notify(`${track.title} will play next`) }, [notify])
  const movePriority = useCallback((index: number, offset: number) => { if (!settings) return; const list=[...settings.streamPriority]; const target=index+offset; if(target<0 || target>=list.length) return; [list[index],list[target]]=[list[target],list[index]]; saveSettings({streamPriority:list}) }, [settings, saveSettings])
  const addTrackToPlaylist = useCallback(async (track: Track) => {
    if (!playlists.length) {
      const name = prompt('Name your first playlist')
      if (!name?.trim()) return
      try { const created = await window.myriff.createPlaylist(name); await window.myriff.addPlaylistTracks(created.id, [track.path]); await refreshPlaylists(); setPlaylistId(created.id); notify(`Created “${created.name}”`) } catch (e) { notify(e instanceof Error ? e.message : 'Could not create playlist') }
      return
    }
    setNewPlaylistTrack(track); setAddToPlaylistId(playlistId ?? playlists[0].id); setShowAddPlaylist(true)
  }, [playlists, playlistId, refreshPlaylists, notify])
  const confirmAddPlaylist = async () => {
    if (!newPlaylistTrack || addToPlaylistId === null) return
    try { await window.myriff.addPlaylistTracks(addToPlaylistId, [newPlaylistTrack.path]); await refreshPlaylists(); notify('Added to playlist'); setShowAddPlaylist(false) }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not add track to playlist') }
  }
  const asPlayable = (r: SearchResult): PlayableTrack => ({
    path: '', title: r.title, artist: r.artist, album: r.album, trackNo: null, genre: '', year: null,
    duration: r.duration, artworkUrl: r.thumbnail, folder: '', addedAt: Date.now(), streamUrl: r.webpageUrl, originalUrl: r.webpageUrl, streamSource: r.source
  })
  const runStreamSearch = async () => {
    if (!streamQuery.trim()) return
    setStreamLoading(true); setStreamResults([])
    try { setStreamResults(await window.myriff.searchStreams(streamQuery, streamSource)) }
    catch (e) { notify(e instanceof Error ? e.message : 'Streaming search failed. Check yt-dlp in Settings.') }
    finally { setStreamLoading(false) }
  }
  const runPlaylistImport = async () => {
    if (!importUrl.trim()) return
    setBusy(true); setImportReport(null)
    try {
      const result = await window.myriff.importPlaylist(importUrl.trim(), importName.trim())
      setImportReport({ total: result.total, found: result.found, missing: result.missing }); await refreshPlaylists(); setPlaylistId(result.playlistId)
      notify(`Imported playlist: ${result.found} of ${result.total} tracks matched locally.`)
    } catch (e) { notify(e instanceof Error ? e.message : 'Playlist import failed.') }
    finally { setBusy(false) }
  }
  const runDownload = async () => {
    if (!downloadUrl.trim()) return
    try {
      const format = settings?.downloadFormat || 'opus'
      const id = await window.myriff.startDownload(downloadUrl.trim(), format)
      setDownloadJobs(old => [{ id, status: 'queued', title: downloadUrl.trim(), percent: 0, speed: '', eta: '', url: downloadUrl.trim(), format }, ...old.filter(j => j.id !== id)])
      setDownloadUrl(''); notify('Download queued.')
    } catch (e) { notify(e instanceof Error ? e.message : 'Download could not start.') }
  }
  const retryDownloadJob = async (job: DownloadProgress) => {
    if (!job.url) { notify('This saved download has no source URL, so it cannot be resumed automatically.'); return }
    const format = job.format || settings?.downloadFormat || 'opus'
    try {
      const id = job.includePlaylist ? await window.myriff.startPlaylistDownload(job.url, format) : await window.myriff.startDownload(job.url, format)
      const resumedJob: DownloadProgress = { ...job, id, status: 'queued', percent: 0, speed: '', eta: '', error: undefined }
      setDownloadJobs(old => [resumedJob, ...old.filter(item => item.id !== job.id && item.id !== id)].slice(0, 50))
      notify(job.status === 'paused' ? 'Resume queued. MyRiff will continue retained partial files where the source supports it.' : 'Download retry queued.')
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not resume this download.') }
  }
  const pauseDownloadJob = async (job: DownloadProgress) => {
    try { const ok = await window.myriff.pauseDownload(job.id); if (!ok) notify('That download is no longer active. Refresh the activity list.') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not pause download.') }
  }
  const cancelDownloadJob = async (job: DownloadProgress) => {
    try { const ok = await window.myriff.cancelDownload(job.id); if (!ok) notify('That download is no longer active. Refresh the activity list.') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not cancel download.') }
  }

  const commitTrimRange = (start: number, end: number) => {
    setTrimUndo(old => [...old.slice(-49), { start: editStart, end: editEnd }])
    setTrimRedo([])
    setEditStart(start); setEditEnd(end)
  }
  const undoTrimRange = () => {
    if (!trimUndo.length) return
    const previous = trimUndo[trimUndo.length - 1]
    setTrimRedo(old => [...old, { start: editStart, end: editEnd }])
    setTrimUndo(old => old.slice(0, -1))
    setEditStart(previous.start); setEditEnd(previous.end)
  }
  const redoTrimRange = () => {
    if (!trimRedo.length) return
    const next = trimRedo[trimRedo.length - 1]
    setTrimUndo(old => [...old, { start: editStart, end: editEnd }])
    setTrimRedo(old => old.slice(0, -1))
    setEditStart(next.start); setEditEnd(next.end)
  }

  const exportEdit = async () => {
    const input = tracks.find(t => t.path === selectedEditorPath)
    if (!input) { notify('Choose a local track first.'); return }
    const output = await window.myriff.selectExportPath(`${input.title} - edit.mp3`)
    if (!output) return
    setEditProgress(0)
    try {
      await window.myriff.exportAudio({ inputPath: input.path, outputPath: output, start: editStart, end: editEnd > editStart ? editEnd : undefined, speed: editSpeed, reverb: editReverb, distortion: editDistortion, eqBands: editEqBands, eqFrequencies: settings?.eqFrequencies, eqQ: settings?.eqQ, stereoWidth: settings?.stereoWidth, effectChain: settings?.effectChain })
      setEditProgress(null); await refreshTracks(); notify('Edited audio exported as a new file. Your source track was left untouched.')
    } catch (e) { setEditProgress(null); notify(e instanceof Error ? e.message : 'Audio export failed. Check FFmpeg in Settings.') }
  }

  const fetchLyrics = async () => {
    if (!current) { notify('Start playing a track to find lyrics.'); return }
    setLyricsBusy(true); setLyricStatus('Searching LRCLIB…')
    try {
      if (settings?.lyricsProvider === 'local-first' && !current.streamUrl) {
        const saved = await window.myriff.getSavedLyrics(current.path) as LyricLine[] | null
        if (saved?.length) { const result = { synced: saved.some(l=>l.time!==null), lines: saved, provider: 'Saved local lyrics' }; setLyrics(result); setLyricLines(saved); setLyricStatus('Loaded saved local lyrics'); setLyricsBusy(false); return }
      }
      const result = await window.myriff.searchLyrics(current.title, current.artist, current.album, current.duration)
      if (result) { setLyrics(result); setLyricLines(result.lines); setLyricStatus(result.lines.some(line => line.words?.length) ? 'Enhanced word-timed lyrics found' : result.synced ? 'Synced lyrics found' : 'Plain lyrics found — timing can be added manually'); if (settings?.saveLyricsLocally && !current.streamUrl) await window.myriff.saveLyrics(current.path, result.lines) }
      else { setLyrics(null); setLyricLines([]); setLyricStatus('No lyrics found for this track.') }
    } catch (e) { setLyricStatus(e instanceof Error ? e.message : 'Lyrics provider could not be reached.') }
    finally { setLyricsBusy(false) }
  }
  const importLyrics = async () => {
    try {
      const result = await window.myriff.importLrc()
      if (!result) return
      setLyrics({ synced: result.synced, lines: result.lines, provider: 'Local LRC', source: result.path }); setLyricLines(result.lines); setLyricStatus(result.lines.some((line: LyricLine) => line.words?.length) ? `Imported ${result.lines.length} lines with word timestamps` : `Imported ${result.lines.length} lines from ${result.path}`)
      if (settings?.saveLyricsLocally && current && !current.streamUrl) await window.myriff.saveLyrics(current.path, result.lines)
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not import lyrics.') }
  }
  const saveLyricTiming = async (lines: LyricLine[]) => { setLyricLines(lines); if (current && !current.streamUrl) await window.myriff.saveLyrics(current.path, lines) }
  const autoTimeLyrics = async () => {
    if (!lyricLines.length || !duration) return
    setLyricsBusy(true)
    try {
      const url = audioRef.current?.src
      if (!url) throw new Error('Load a track before auto-timing lyrics.')
      const response = await fetch(url); const data = await response.arrayBuffer()
      const ctx = new AudioContext(); const buffer = await ctx.decodeAudioData(data)
      const channel = buffer.getChannelData(0); const hop = Math.max(256, Math.floor(buffer.sampleRate * 0.04)); const energy: number[] = []
      for (let i = 0; i < channel.length; i += hop) { let sum = 0; const end = Math.min(channel.length, i + hop); for (let j = i; j < end; j += 4) sum += channel[j] * channel[j]; energy.push(Math.sqrt(sum / Math.max(1, Math.ceil((end-i)/4)))) }
      const peaks: number[] = []
      for (let i = 2; i < energy.length - 2; i++) if (energy[i] > 0.018 && energy[i] >= energy[i-1] && energy[i] > energy[i+1] && (peaks.length === 0 || i * hop / buffer.sampleRate - peaks[peaks.length-1] > 0.48)) peaks.push(i * hop / buffer.sampleRate)
      const lines = lyricLines.map((line, i) => {
        const expected = Math.max(0, Math.min(duration - 0.1, (i / Math.max(1, lyricLines.length)) * duration))
        const nearby = peaks.reduce<number|null>((best, t) => best === null || Math.abs(t - expected) < Math.abs(best - expected) ? t : best, null)
        return { ...line, time: nearby !== null && Math.abs(nearby - expected) < Math.max(2.5, duration / lyricLines.length) ? nearby : expected }
      }).sort((a,b) => (a.time ?? 0) - (b.time ?? 0))
      await ctx.close(); await saveLyricTiming(lines); setLyrics({ synced: true, lines, provider: 'Local onset estimate' }); setLyricStatus('Approximate timing added. Review and adjust individual lines.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Automatic timing could not analyse this audio.') }
    finally { setLyricsBusy(false) }
  }

  const nav: { id: Page; label: string; icon: any; section?: string }[] = [
    { id: 'library', label: 'Library', icon: LibraryBig, section: 'YOUR MUSIC' },
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
    { id: 'search', label: 'Search & stream', icon: Radio, section: 'DISCOVER' },
    { id: 'radio', label: 'Local radio', icon: AudioWaveform },
    { id: 'downloads', label: 'Downloads', icon: Download },
    { id: 'playlist-studio', label: 'Playlist Studio', icon: ArrowUpRight, section: 'WORKFLOWS' },
    { id: 'power-tools', label: 'Library intelligence', icon: WandSparkles },
    { id: 'editor', label: 'Audio editor', icon: FileAudio, section: 'TOOLS' },
    { id: 'lyrics', label: 'Lyrics', icon: AudioLines },
    { id: 'sound', label: 'Sound lab', icon: SlidersHorizontal },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, section: 'APP' }
  ]
  const groupedTracks = useMemo(() => {
    if (!settings || !filteredTracks.length) return [] as [string, Track[]][]
    const key = (t: Track) => settings.groupBy === 'folder' ? (t.folder.split(/[\\/]/).filter(Boolean).at(-1) || 'Music folder') : settings.groupBy === 'artist' ? t.artist || 'Unknown artist' : settings.groupBy === 'genre' ? t.genre || 'Unknown genre' : t.album || 'Singles & unknown albums'
    const groups = new Map<string, Track[]>()
    filteredTracks.forEach(t => { const k = key(t); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t) })
    return [...groups.entries()]
  }, [filteredTracks, settings])

  if (!settings) return <div className="boot-screen"><div className="brand-mark"><Music2 size={28}/></div><h1>MyRiff</h1><p>Warming up your library…</p></div>
  const themeStyle = { '--accent': liveAccent || settings.accent, '--accent-soft': `${liveAccent || settings.accent}24`, '--accent-glow': `${liveAccent || settings.accent}42`, '--radius': `${settings.cornerRadius}px`, '--sidebar': `${settings.sidebarWidth}px`, '--ui-scale': settings.uiScale / 100, '--grid-columns-user': settings.gridColumns > 0 ? String(settings.gridColumns) : 'auto-fill' } as CSSProperties
  const sourceBadge = current?.streamSource

  return <div className={`app-shell theme-${settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme} density-${settings.uiDensity} ${settings.animationsEnabled ? '' : 'animations-off'} ${settings.showArtworkBackground ? 'art-background-on' : ''} ${mini ? 'mini-mode' : ''}`} style={themeStyle}>
    <style id="myriff-custom-css">{settings.customCss}</style>
    <audio ref={audioRef} crossOrigin="anonymous" onCanPlay={() => {
      const audio = audioRef.current
      if (!audio) return
      const transition = crossfadeRef.current
      if (transition?.phase === 'handoff' && samePlayable(transition.track, current)) {
        const secondary = nextAudioRef.current
        if (secondary && Number.isFinite(secondary.currentTime)) { audio.currentTime = secondary.currentTime; setPosition(secondary.currentTime) }
      } else if (pendingPositionRef.current !== null) {
        audio.currentTime = pendingPositionRef.current; setPosition(pendingPositionRef.current); pendingPositionRef.current = null
      }
      if (autoPlayRef.current) {
        autoPlayRef.current = false
        ensureGraph().then(() => audio.play()).then(() => {
          setPlaying(true)
          const handoff = crossfadeRef.current
          if (handoff?.phase === 'handoff' && samePlayable(handoff.track, current)) {
            const secondary = nextAudioRef.current
            const durationMs = 160
            handoffToMain(durationMs / 1000)
            window.setTimeout(() => {
              if (crossfadeRef.current !== handoff) return
              if (secondary) { secondary.pause(); secondary.currentTime = 0; secondary.removeAttribute('src'); secondary.load() }
              crossfadeRef.current = null; resetCrossfade(); setCrossfadeEpoch(value => value + 1)
            }, durationMs + 60)
          }
        }).catch(e => notify(e instanceof Error ? e.message : 'Playback failed.'))
      }
    }} onPlay={() => { setPlaying(true); window.myriff.setPlaybackStatus(true).catch(()=>undefined); const key = `${current?.path || current?.streamUrl || ''}`; if (key && lastRecordedTrackRef.current !== `played:${key}`) { lastRecordedTrackRef.current = `played:${key}`; window.myriff.recordPlayedTrack({ trackPath: current?.streamUrl ? null : current?.path, title: current?.title || '', artist: current?.artist || '', source: current?.streamSource || 'local' }).then(refreshTracks).catch(() => undefined) } }} onPause={() => { if (crossfadeRef.current?.phase === 'fading' || crossfadeRef.current?.phase === 'handoff') { setPlaying(true); return } setPlaying(false); window.myriff.setPlaybackStatus(false).catch(()=>undefined); if(audioRef.current) savePlayback(audioRef.current.currentTime,true) }} onEnded={handleEnded} onDurationChange={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : current?.duration || 0)} onTimeUpdate={e => { const audio=e.currentTarget; const at = audio.currentTime; setPosition(at); savePlayback(at); maybeStartCrossfade(audio); if(page==='editor' && current?.path===selectedEditorPath && editEnd>editStart && at>=editEnd){audio.pause();audio.currentTime=editEnd;setPosition(editEnd);setPlaying(false)} }} onError={() => { if (audioSrc) { setPlaying(false); notify('This source could not be played. Check the file or your yt-dlp version.') } }} />
    <audio ref={nextAudioRef} crossOrigin="anonymous" preload="auto" style={{ display: 'none' }} onCanPlay={() => {
      const entry = crossfadeRef.current
      if (entry?.phase === 'loading' && entry.source && nextAudioRef.current?.currentSrc) entry.phase = 'ready'
    }} onError={() => {
      const entry = crossfadeRef.current
      if (entry?.phase === 'loading' || entry?.phase === 'ready') { crossfadeRef.current = null; resetCrossfade() }
    }} />
    {!mini && <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Music2 size={21}/></div><div><b>MyRiff</b><span>YOUR MUSIC SPACE</span></div></div>
      <button className="scan-button" onClick={() => scanFolder()} disabled={busy}><Plus size={17}/><span>Scan music folder</span>{busy && <LoaderCircle className="spin" size={15}/>}</button>
      <nav className="side-nav">{nav.map((item, i) => <div key={item.id}>{item.section && <div className="nav-section">{item.section}</div>}<button className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id === 'downloads' && downloadJobs.some(j => j.status === 'downloading') && <span className="nav-dot"/>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="local-status"><span className="status-dot"/><div><b>Local-first audio</b><small>{tracks.length.toLocaleString()} tracks in library</small></div></div><button className="sidebar-theme" onClick={() => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>{settings.theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}<span>Switch to {settings.theme === 'dark' ? 'light' : 'dark'}</span></button></div>
    </aside>}

    <main className="main-area">
      {!mini && <header className={`topbar ${bannerUrl ? 'has-banner' : ''}`} style={bannerUrl ? { backgroundImage: `linear-gradient(90deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 65%, transparent) 65%, transparent), url("${bannerUrl}")` } : undefined}>
        <div className="topbar-heading"><span className="eyebrow">{page === 'library' ? 'YOUR COLLECTION' : page === 'playlists' ? 'MADE BY YOU' : page === 'search' ? 'EXPLORE AUDIO' : page === 'radio' ? 'LOCAL DISCOVERY' : page === 'downloads' ? 'OFFLINE LIBRARY' : page === 'playlist-studio' ? 'PLAYLIST WORKFLOWS' : page === 'power-tools' ? 'LIBRARY INTELLIGENCE' : page === 'editor' ? 'AUDIO WORKSHOP' : page === 'lyrics' ? 'SING ALONG' : page === 'sound' ? 'PLAYBACK LAB' : page === 'settings' ? 'PREFERENCES' : 'MYRIFF'}</span><h1>{nav.find(n => n.id === page)?.label || 'MyRiff'}</h1></div>
        <div className="topbar-actions"><label className="global-search"><Search size={16}/><input value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); if (e.target.value) setPage('library') }} placeholder="Search your library…"/><kbd>⌘ K</kbd></label><button className="icon-button accent-outline" title="Sound lab" onClick={() => setShowEffects(x => !x)}><SlidersHorizontal size={18}/></button><button className="avatar-button" onClick={() => setPage('settings')} title="Settings"><Headphones size={18}/></button></div>
      </header>}

      <div className={`content-scroll ${mini ? 'mini-content' : ''}`}>
        {scanState && !mini && <div className="scan-progress"><LoaderCircle className="spin" size={16}/><span>Scanning {scanState.current || 'music'}…</span><b>{scanState.total ? `${scanState.done}/${scanState.total}` : 'Finding files'}</b><div className="progress-track"><i style={{ width: scanState.total ? `${scanState.done / scanState.total * 100}%` : '12%' }}/></div></div>}
        {page === 'library' && <>
          <section className="hero-panel" style={bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(24,22,33,.96), rgba(24,22,33,.68)), url("${bannerUrl}")` } : undefined}>
            <div className="hero-copy"><div className="hero-pill"><Sparkles size={13}/> YOUR COLLECTION, REIMAGINED</div><h2>Every track has<br/><span>a place here.</span></h2><p>Your files stay yours. Browse, queue, shape the sound, and keep everything on your device.</p><div className="hero-actions"><button className="primary-button" onClick={() => tracks[0] && playTrack(tracks[0], tracks)}><Play size={16} fill="currentColor"/> Play something</button><button className="secondary-button" onClick={() => scanFolder()}><FolderOpen size={16}/> Add music</button></div></div>
            <div className="hero-art-stack">{tracks.slice(0,3).map((t,i) => <div key={t.path} className={`stack-cover stack-${i}`}>{t.artworkUrl ? <img src={t.artworkUrl}/> : <Disc3 size={38}/>}</div>)}<div className="stack-caption"><b>{tracks.length.toLocaleString()}</b><span>tracks & counting</span></div></div>
          </section>
          <div className="section-heading"><div><h2>{globalSearch ? 'Search results' : 'Your library'}</h2><p>{globalSearch ? `${filteredTracks.length} matches across your collection` : `${tracks.length.toLocaleString()} tracks · organised your way`}</p></div><div className="section-tools"><label className="compact-select"><span>Group by</span><select value={settings.groupBy} onChange={e => saveSettings({ groupBy: e.target.value as AppSettings['groupBy'] })}><option value="album">Album</option><option value="artist">Artist</option><option value="folder">Folder</option><option value="genre">Genre</option></select><ChevronDown size={13}/></label><div className="view-toggle"><button className={settings.viewMode === 'grid' ? 'on' : ''} onClick={() => saveSettings({ viewMode: 'grid' })}><span className="grid-glyph"/></button><button className={settings.viewMode === 'list' ? 'on' : ''} onClick={() => saveSettings({ viewMode: 'list' })}><ListMusic size={16}/></button></div></div></div>
          {!tracks.length ? <div className="welcome-empty"><div className="empty-orbit"><Disc3 size={42}/></div><h3>Your library starts here</h3><p>Pick a music folder and MyRiff will read your tags and embedded album art. Your original files will not be moved or edited.</p><button className="primary-button" onClick={() => scanFolder()}><FolderOpen size={16}/> Choose music folder</button></div> : groupedTracks.map(([group, items]) => <section className="track-group" key={group}><div className="group-title"><h3>{group}</h3><span>{items.length} {items.length === 1 ? 'track' : 'tracks'}</span><button onClick={() => playTrack(items[0], items)} title="Play group"><Play size={14} fill="currentColor"/> Play all</button></div><TrackGrid tracks={items} view={settings.viewMode} onPlay={t => playTrack(t, items)} onQueue={queueTrack} onPlaylist={addTrackToPlaylist} onPlayNext={playNextTrack} onFavorite={toggleFavorite} onRate={cycleRating} showYear={settings.showYear} showGenre={settings.showGenre} showTrackNumbers={settings.showTrackNumbers} selectedPath={current?.path}/></section>)}
        </>}

        {page === 'playlists' && <div className="two-column-page playlist-page">
          <section className="playlist-rail">
            <div className="page-section-heading">
              <div><h2>Your playlists</h2><p>Organise the collection into nested folders.</p></div>
              <div className="playlist-rail-actions">
                <button className="round-action" title="Create playlist folder" aria-label="Create playlist folder" onClick={() => void promptCreatePlaylistFolder(null)}><FolderOpen size={16}/></button>
                <button className="round-action" title="Create playlist" aria-label="Create playlist" onClick={async () => {
                  const name = prompt('Name your playlist')
                  if (!name?.trim()) return
                  try {
                    const created = await window.myriff.createPlaylist(name)
                    if (typeof playlistFolderFilter === 'number') await window.myriff.movePlaylistToFolder(created.id, playlistFolderFilter)
                    await refreshPlaylists(); setPlaylistId(created.id); notify('Playlist created.')
                  } catch (error) { notify(error instanceof Error ? error.message : 'Could not create playlist') }
                }}><Plus size={18}/></button>
              </div>
            </div>
            <div className="playlist-folder-filters">
              <button type="button" className={playlistFolderFilter === 'all' ? 'active' : ''} onClick={() => selectPlaylistFolder('all')}>All playlists <small>{playlists.length}</small></button>
              <button type="button" className={playlistFolderFilter === 'unfiled' ? 'active' : ''} onClick={() => selectPlaylistFolder('unfiled')}>Unfiled <small>{playlists.filter(p => p.folderId === null || p.folderId === undefined).length}</small></button>
            </div>
            <div className="playlist-folder-tree">
              {playlistFolders.filter(folder => folder.parentId === null).map(folder => renderPlaylistFolder(folder))}
              {!playlistFolders.length && <p className="playlist-folder-empty">No folders yet. Use the folder button to create one, or press + on a folder to nest another.</p>}
            </div>
            <div className="playlist-list-heading"><span>{playlistFolderFilter === 'all' ? 'All playlists' : playlistFolderFilter === 'unfiled' ? 'Unfiled playlists' : `In ${playlistFolders.find(folder => folder.id === playlistFolderFilter)?.name || 'folder'}`}</span><small>{visiblePlaylists.length}</small></div>
            {visiblePlaylists.map(p => <button key={p.id} className={`playlist-item ${playlistId === p.id ? 'active' : ''}`} onClick={() => setPlaylistId(p.id)}>
              <div className="playlist-art"><ListMusic size={19}/></div>
              <div className="playlist-label"><b>{p.name}</b><span>{p.trackCount} tracks</span></div>
              <ChevronDown className="playlist-chevron" size={15}/>
            </button>)}
            {!visiblePlaylists.length && <div className="small-empty">{playlistFolderFilter === 'all' ? 'No playlists yet. Create one to get started.' : playlistFolderFilter === 'unfiled' ? 'All playlists are filed in folders.' : 'This folder has no direct playlists. Create a playlist here or choose one of its subfolders.'}</div>}
          </section>
          <section className="playlist-details">
            <div className="playlist-detail-hero">
              <div className="playlist-large-art"><ListMusic size={36}/></div>
              <div>
                <span className="eyebrow">PLAYLIST</span><h2>{activePlaylist?.name || 'Choose a playlist'}</h2>
                <p>{playlistTracks.length} tracks · stored locally</p>
                <div className="inline-actions">
                  <button className="primary-button" disabled={!playlistTracks.length} onClick={() => playTrack(playlistTracks[0], playlistTracks)}><Play size={15} fill="currentColor"/> Play playlist</button>
                  {activePlaylist && <label className="playlist-folder-select-field"><span>Folder</span><select aria-label="Move playlist to folder" value={activePlaylist.folderId ?? ''} onChange={event => void movePlaylistToFolder(activePlaylist.id, event.currentTarget.value ? Number(event.currentTarget.value) : null)}><option value="">Unfiled</option>{playlistFolders.map(folder => <option key={folder.id} value={folder.id}>{playlistFolderPath(folder.id)}</option>)}</select></label>}
                  {activePlaylist && <button className="ghost-button" onClick={async () => { const name = prompt('Rename playlist', activePlaylist.name); if (name?.trim()) { try { await window.myriff.renamePlaylist(activePlaylist.id, name); await refreshPlaylists() } catch (error) { notify(error instanceof Error ? error.message : 'Could not rename playlist') } } }}><Pencil size={15}/> Rename</button>}
                  {activePlaylist && <button className="ghost-button danger-text" onClick={async () => { if (confirm(`Delete “${activePlaylist.name}”? Track files will not be deleted.`)) { await window.myriff.deletePlaylist(activePlaylist.id); const latest = await window.myriff.listPlaylists(); await refreshPlaylists(); setPlaylistId(latest[0]?.id ?? null) } }}><Trash2 size={15}/> Delete</button>}
                </div>
              </div>
            </div>
            <div className="section-heading compact"><div><h2>Tracks</h2><p>Removing a track only removes the playlist entry.</p></div><span className="muted">{playlistTracks.length} items</span></div>
            {playlistTracks.length ? <div className="track-table">{playlistTracks.map((t,i) => <div
              className={`track-row playlist-track-row ${draggedPlaylistTrackPath === t.path ? 'dragging' : ''} ${playlistDropTargetPath === t.path ? 'drop-target' : ''}`}
              key={t.path}
              draggable
              onDragStart={event => { setDraggedPlaylistTrackPath(t.path); event.dataTransfer.setData('text/plain', t.path); event.dataTransfer.effectAllowed = 'move' }}
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (draggedPlaylistTrackPath && draggedPlaylistTrackPath !== t.path) setPlaylistDropTargetPath(t.path) }}
              onDrop={event => { event.preventDefault(); const sourcePath = event.dataTransfer.getData('text/plain') || draggedPlaylistTrackPath; if (sourcePath) void reorderPlaylistEntry(sourcePath, t.path); else { setDraggedPlaylistTrackPath(null); setPlaylistDropTargetPath(null) } }}
              onDragEnd={() => { setDraggedPlaylistTrackPath(null); setPlaylistDropTargetPath(null) }}
              onDoubleClick={() => playTrack(t, playlistTracks)}>
              <div className="track-title-cell"><div className="row-index" title="Drag this row to reorder the playlist">{String(i+1).padStart(2,'0')}</div><div className="row-cover">{t.artworkUrl ? <img src={t.artworkUrl} alt=""/> : <Disc3 size={17}/>}</div><div className="track-labels"><b>{t.title}</b><small>{t.artist}</small></div></div>
              <span className="muted truncate">{t.album}</span><span className="muted">{t.genre || '—'}</span><span className="muted mono">{timeLabel(t.duration)}</span>
              <div className="row-actions"><button title="Play" aria-label={`Play ${t.title}`} onClick={() => playTrack(t, playlistTracks)}><Play size={15}/></button><button className="icon-button" title="Move track earlier" aria-label={`Move ${t.title} earlier`} disabled={i===0} onClick={event => { event.stopPropagation(); movePlaylistEntry(i,-1) }}><ChevronUp size={14}/></button><button className="icon-button" title="Move track later" aria-label={`Move ${t.title} later`} disabled={i===playlistTracks.length-1} onClick={event => { event.stopPropagation(); movePlaylistEntry(i,1) }}><ChevronDown size={14}/></button><button title="Remove from playlist" aria-label={`Remove ${t.title} from playlist`} onClick={async () => { if (activePlaylist) { await window.myriff.removePlaylistTrack(activePlaylist.id, t.path); await refreshPlaylists() } }}><X size={16}/></button></div>
            </div>)}</div> : <div className="empty-state compact-empty"><ListMusic size={28}/><b>{activePlaylist ? 'This playlist is empty' : 'Choose or create a playlist'}</b><span>{activePlaylist ? 'Add music from your library using the list icon.' : 'Select a playlist on the left, or create one to get started.'}</span><button className="secondary-button" onClick={() => setPage('library')}>Browse library</button></div>}
          </section>
        </div>}

        {page === 'search' && <div className="page-stack"><section className="stream-hero"><div><span className="hero-pill"><Radio size={13}/> ONLINE DISCOVERY</span><h2>Find your next<br/><span>favourite track.</span></h2><p>Search public audio results with yt-dlp. You can preview a result or add it to your queue.</p></div><div className="stream-orbit"><Radio size={54}/><span/><i/></div></section><section className="content-card"><div className="section-heading compact"><div><h2>Search audio</h2><p>Results come from the selected source.</p></div><label className="compact-select"><select value={streamSource} onChange={e => setStreamSource(e.target.value as StreamSource)}><option>YouTube Music</option><option>YouTube</option><option>SoundCloud</option></select><ChevronDown size={13}/></label></div><form className="stream-search-form" onSubmit={e => {e.preventDefault(); runStreamSearch()}}><Search size={18}/><input value={streamQuery} onChange={e => setStreamQuery(e.target.value)} placeholder="Search by track, artist or mood…"/><button className="primary-button" disabled={streamLoading}>{streamLoading ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} Search</button></form>{streamLoading && <div className="inline-loading"><LoaderCircle size={17} className="spin"/> Searching {streamSource}…</div>}{streamResults.length > 0 && <div className="remote-results">{streamResults.map((r,i) => <div className="remote-result" key={r.id}><span className="remote-number">{String(i+1).padStart(2,'0')}</span>{r.thumbnail ? <img src={r.thumbnail} alt=""/> : <div className="remote-cover"><Music size={19}/></div>}<div className="remote-info"><b>{r.title}</b><small>{r.artist || r.source} <span>· {timeLabel(r.duration)}</span></small></div><span className="source-tag">{r.source}</span><div className="row-actions"><button title="Play now" onClick={() => { const p = asPlayable(r); playTrack(p, streamResults.map(asPlayable)) }}><Play size={16}/></button><button title="Add to queue" onClick={() => queueTrack(asPlayable(r))}><Plus size={16}/></button><button title="Download result" onClick={() => { setDownloadUrl(r.webpageUrl); setPage('downloads') }}><Download size={15}/></button></div></div>)}</div>}{!streamLoading && !streamResults.length && <div className="stream-hint"><Search size={20}/><span>Try a track title, artist name, album or genre.</span></div>}</section><section className="content-card import-card"><div className="section-heading compact"><div><h2>Import a public playlist</h2><p>Build a local playlist from tracks that are already in your library.</p></div><div className="provider-pills"><span>YouTube</span><span>SoundCloud</span><span>Spotify*</span><span>Apple Music*</span></div></div><div className="import-inputs"><label><span>Playlist URL</span><input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://…"/></label><label><span>Playlist name (optional)</span><input value={importName} onChange={e => setImportName(e.target.value)} placeholder="Imported playlist"/></label><button className="secondary-button" disabled={busy || !importUrl.trim()} onClick={runPlaylistImport}>{busy ? <LoaderCircle size={16} className="spin"/> : <Upload size={16}/>} Import tracks</button></div>{importReport && <div className="import-report"><Check size={18}/><div><b>{importReport.found} of {importReport.total} tracks found locally</b><span>{importReport.missing.length ? `${importReport.missing.length} tracks were not matched and were left out.` : 'All playlist entries matched your library.'}</span>{importReport.missing.length > 0 && <details><summary>View unmatched tracks</summary><div className="missing-list">{importReport.missing.slice(0,80).map((m,i)=><span key={`${m}-${i}`}>{m}</span>)}</div></details>}</div></div>}<p className="footnote">* Spotify and Apple Music links may not expose a playlist track list to yt-dlp. Provider support depends on current public-page access and installed yt-dlp extractors; this importer does not sign in to user accounts.</p></section></div>}

        {page === 'downloads' && <div className="page-stack"><section className="download-hero"><div><span className="eyebrow">KEEP IT OFFLINE</span><h2>Your music, wherever.</h2><p>Download only content you have permission to save. Files are placed in <code>Music/MyRiff Downloads</code>.</p></div><div className="download-icon"><Download size={32}/></div></section><section className="content-card"><div className="section-heading compact"><div><h2>New download</h2><p>Paste a video or track URL.</p></div><label className="compact-select"><span>Format</span><select value={settings.downloadFormat} onChange={e => saveSettings({ downloadFormat: e.target.value as AppSettings['downloadFormat'] })}><option value="mp3">MP3</option><option value="flac">FLAC</option><option value="opus">Opus</option></select></label></div><form className="download-form" onSubmit={e => {e.preventDefault(); runDownload()}}><div className="url-input"><ExternalLink size={17}/><input value={downloadUrl} onChange={e => setDownloadUrl(e.target.value)} placeholder="https://youtube.com/watch?v=… or soundcloud.com/…"/></div><button className="primary-button" disabled={!downloadUrl.trim()}><Download size={16}/> Download</button></form><p className="footnote">Requires yt-dlp. MP3 and FLAC conversion typically requires FFmpeg. Access, formats, and availability are controlled by the source service; MyRiff cannot guarantee ad-free streams or bypass provider restrictions.</p></section><section className="content-card"><div className="section-heading compact"><div><h2>Activity</h2><p>Interrupted downloads are restored after restart. Resume retries the same source and continues partial files where supported.</p></div><span className="muted">{downloadJobs.filter(j => j.status === 'downloading').length} active</span></div>{downloadJobs.length ? <div className="download-list">{downloadJobs.map(job => <div className="download-item" key={job.id}><div className="download-file-icon"><FileAudio size={20}/></div><div className="download-info"><b>{job.title}</b><small>{job.status === 'downloading' ? `${job.speed || 'Preparing…'} · ETA ${job.eta || '—'}` : job.status === 'finished' ? job.filePath || 'Finished' : job.error || 'Failed'}</small>{job.status !== 'error' && job.status !== 'cancelled' && <div className="progress-track"><i style={{ width: `${job.percent}%` }}/></div>}</div><span className={`job-state ${job.status}`}>{job.status === 'downloading' ? `${Math.round(job.percent)}%` : job.status === 'queued' ? 'Queued' : job.status === 'paused' ? 'Paused' : job.status === 'finished' ? 'Complete' : job.status === 'cancelled' ? 'Stopped' : 'Failed'}</span>{(job.status === 'queued' || job.status === 'downloading') && <><button className="icon-button" title="Pause download" onClick={() => void pauseDownloadJob(job)}><Pause size={14}/></button><button className="icon-button" title="Cancel download" onClick={() => void cancelDownloadJob(job)}>×</button></>}{(job.status === 'paused' || job.status === 'error' || job.status === 'cancelled') && job.url && <button className="icon-button" title={job.status === 'paused' ? 'Resume download' : 'Retry download'} onClick={() => void retryDownloadJob(job)}><RefreshCw size={14}/></button>}{job.filePath && <button className="icon-button" onClick={() => window.myriff.openDownloadedFile(job.filePath!)} title="Show file"><FolderOpen size={16}/></button>}</div>)}</div> : <div className="small-empty">No current-session downloads.</div>}</section><section className="content-card"><div className="section-heading compact"><div><h2>Downloaded files</h2><p>Manage files tracked by MyRiff.</p></div><button className="subtle-button" onClick={refreshDownloads}><RefreshCw size={14}/> Refresh</button></div>{downloads.length ? <div className="history-list">{downloads.map(d => <div className="history-row" key={d.id}><div className="download-file-icon"><FileAudio size={18}/></div><div className="download-info"><b>{d.title}</b><small>{d.format.toUpperCase()} · {new Date(d.createdAt).toLocaleDateString()}</small></div><button className="icon-button" title="Show file" onClick={() => window.myriff.openDownloadedFile(d.filePath)}><FolderOpen size={16}/></button><button className="icon-button danger" title="Forget from list" onClick={async () => { if(confirm('Also delete the downloaded file from disk? Choose Cancel to keep it and only remove its history entry.')) await window.myriff.deleteDownload(d.id, true); else await window.myriff.deleteDownload(d.id, false); await refreshDownloads(); await refreshTracks() }}><Trash2 size={16}/></button></div>)}</div> : <div className="small-empty">Your completed downloads will appear here.</div>}</section></div>}

        {page === 'playlist-studio' && <PlaylistStudio settings={settings} onSettings={saveSettings} playlists={playlists} onImported={async id => { await refreshPlaylists(); setPlaylistId(id) }} onNotify={notify}/>}
        {page === 'radio' && <LocalRadio tracks={tracks} current={current?.streamUrl ? null : current || null} onPlay={(track, context) => playTrack(track, context)}/>}
        {page === 'power-tools' && <PowerToolsPage tracks={tracks} current={current} position={position} settings={settings} metadataReviewQueue={metadataReviewQueue} onCompleteMetadataReview={async trackPath => { await window.myriff.completeMetadataReview(trackPath); setMetadataReviewQueue(await window.myriff.getMetadataReviewQueue()); notify('Removed from the metadata review queue. The audio file was not changed.') }} onSeek={v => { if(audioRef.current) audioRef.current.currentTime = v; setPosition(v) }} onPlay={t => playTrack(t, tracks)} onRefresh={refreshTracks} onNotify={notify}/>}
        {page === 'editor' && <div className="page-stack"><section className="editor-hero"><div className="editor-disc"><FileAudio size={35}/></div><div><span className="eyebrow">NON-DESTRUCTIVE EDITING</span><h2>Make it yours.</h2><p>Trim a track, isolate a section and apply effects. Every export is saved as a new file; the source is never overwritten.</p></div></section><section className="content-card editor-card"><div className="section-heading compact"><div><h2>Audio editor</h2><p>Select a file from your library as the source.</p></div><span className="mini-badge">FFMPEG</span></div><label className="field-label">Source track<select value={selectedEditorPath} onChange={e => { setSelectedEditorPath(e.target.value); setTrimUndo([]); setTrimRedo([]) }}><option value="">Choose a track…</option>{tracks.map(t => <option value={t.path} key={t.path}>{t.artist ? `${t.artist} — ` : ''}${t.title}</option>)}</select></label><p className="footnote editor-session-status" role="status">{editorSessionStatus}</p>{selectedEditorPath && <button className="ghost-button editor-session-forget" onClick={forgetEditorSession}>Forget saved session</button>}{selectedEditorPath && <div className="trim-preview"><WaveformPreview trackPath={selectedEditorPath} duration={tracks.find(t=>t.path===selectedEditorPath)?.duration || 0} start={editStart} end={editEnd} onRangeChange={commitTrimRange} onSeek={time=>{if(current?.path===selectedEditorPath&&audioRef.current){audioRef.current.currentTime=time;setPosition(time)}}}/><div className="trim-times"><label><span>Start (seconds)</span><input type="number" min={0} step={0.1} value={editStart} onChange={e=>setEditStart(Math.max(0,Number(e.target.value)))}/></label><label><span>End (seconds, optional)</span><input type="number" min={0} step={0.1} value={editEnd} onChange={e=>setEditEnd(Math.max(0,Number(e.target.value)))}/></label><button className="secondary-button" onClick={()=>{ const t=tracks.find(x=>x.path===selectedEditorPath); if(t){ if(current?.path===t.path && audioRef.current){audioRef.current.currentTime=editStart;setPosition(editStart);if(audioRef.current.paused)togglePlay()}else{playTrack(t,[t]);pendingPositionRef.current=editStart} } }}><Play size={15}/> Preview start</button></div><div className="trim-range"><span>Trim range</span><div className="trim-history-actions"><button className="ghost-button" disabled={!trimUndo.length} onClick={undoTrimRange}>Undo</button><button className="ghost-button" disabled={!trimRedo.length} onClick={redoTrimRange}>Redo</button></div><input type="range" min={0} max={Math.max(1,tracks.find(t=>t.path===selectedEditorPath)?.duration||1)} step={0.1} value={editStart} onChange={e=>setEditStart(Number(e.target.value))}/><input type="range" min={0} max={Math.max(1,tracks.find(t=>t.path===selectedEditorPath)?.duration||1)} step={0.1} value={editEnd} onChange={e=>setEditEnd(Number(e.target.value))}/></div></div>}<div className="editor-effects"><h3>Export effects</h3><div className="editor-control-grid"><label><span>Speed</span><strong>{editSpeed.toFixed(2)}×</strong><input type="range" min={0.5} max={2} step={0.05} value={editSpeed} onChange={e=>setEditSpeed(Number(e.target.value))}/></label><label><span>Reverb</span><strong>{Math.round(editReverb*100)}%</strong><input type="range" min={0} max={1} step={0.05} value={editReverb} onChange={e=>setEditReverb(Number(e.target.value))}/></label><label><span>Distortion</span><strong>{Math.round(editDistortion*100)}%</strong><input type="range" min={0} max={1} step={0.05} value={editDistortion} onChange={e=>setEditDistortion(Number(e.target.value))}/></label><label><span>10-band EQ</span><strong>{editEqBands.filter(v=>v!==0).length} bands active</strong><div className="editor-eq-mini">{editEqBands.map((gain,index)=><label key={index} title={`${[31,62,125,250,500,1000,2000,4000,8000,16000][index]} Hz`}><input aria-label={`Export EQ band ${index+1}`} type="range" min={-12} max={12} step={1} value={gain} onChange={e=>setEditEqBands(old=>old.map((v,i)=>i===index?Number(e.target.value):v))}/><small>{[31,62,125,250,500,1000,2000,4000,8000,16000][index]>=1000?`${[31,62,125,250,500,1000,2000,4000,8000,16000][index]/1000}k`:[31,62,125,250,500,1000,2000,4000,8000,16000][index]}</small></label>)}</div></label></div></div>{editProgress !== null && <div className="editor-progress"><div className="progress-track"><i style={{width:`${editProgress}%`}}/></div><span>{editProgress}%</span></div>}<button className="primary-button wide-button" disabled={!selectedEditorPath || editProgress !== null} onClick={exportEdit}>{editProgress !== null ? <LoaderCircle className="spin" size={16}/> : <FileAudio size={16}/>} Export edited file</button><p className="footnote">FFmpeg must be installed or selected in Settings. Codec support depends on your FFmpeg build and the selected output extension.</p></section></div>}

        {page === 'lyrics' && <div className="lyrics-page"><div className="lyrics-toolbar"><div><span className="eyebrow">LYRICS STUDIO</span><h2>{current?.title || 'Nothing playing yet'}</h2><p>{current?.artist || 'Play a track to fetch lyrics or import an LRC file.'}</p></div><div className="lyrics-actions"><button className={karaokeMode ? 'secondary-button active' : 'secondary-button'} onClick={() => setKaraokeMode(v => !v)} title="Use word timestamps from Enhanced LRC files when present; otherwise estimate timing">{karaokeMode ? 'Karaoke preview: on' : 'Karaoke preview'}</button><button className="secondary-button" onClick={importLyrics}><Upload size={15}/> Import LRC</button><button className="primary-button" onClick={fetchLyrics} disabled={!current || lyricsBusy}>{lyricsBusy ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} Find lyrics</button></div></div><div className="lyrics-card"><div className="lyrics-card-header"><div><AudioLines size={19}/><span>{lyrics?.provider || 'Lyrics'}</span></div><span className="lyrics-sync-status">{lyricStatus || (lyrics?.synced ? 'Synced' : 'Not timed')}</span></div>{lyricLines.length ? <div className="lyrics-lines">{lyricLines.map((line,i)=>{ const active = line.time !== null && position >= line.time && (i === lyricLines.length-1 || lyricLines[i+1].time === null || position < (lyricLines[i+1].time ?? Infinity)); return <div key={`${i}-${line.text}`} className={`lyric-line ${active?'active':''}`}><button title="Set this line to the current playback position" className="line-time" onClick={() => { const lines=[...lyricLines]; lines[i]=retimeLyricLine(line,position); saveLyricTiming(lines) }}>{line.time === null ? '––:––' : timeLabel(line.time)}</button><button className={`lyric-text ${karaokeMode && line.time !== null ? 'karaoke-enabled' : ''}`} onClick={() => { if(line.time!==null && audioRef.current) audioRef.current.currentTime=line.time }}>{karaokeMode && line.time !== null ? (line.words?.length ? renderTimedKaraokeWords(line.words, position) : renderKaraokeWords(line.text, Math.max(0, Math.min(1, (position - line.time) / Math.max(.25, ((lyricLines.slice(i+1).find(next => next.time !== null)?.time ?? line.time + 4) - line.time)))))) : line.text}</button><button className="line-set" title="Time this line now" onClick={() => { const lines=[...lyricLines]; lines[i]=retimeLyricLine(line,position); saveLyricTiming(lines) }}><Check size={14}/></button></div>})}</div> : <div className="lyrics-empty"><div className="lyrics-decoration"><AudioLines size={36}/></div><h3>Words make the music</h3><p>Fetch online lyrics with LRCLIB, or import a local .lrc file. Click any line's timestamp to set it to the current playback position.</p><button className="primary-button" onClick={fetchLyrics} disabled={!current || lyricsBusy}><Search size={15}/> Find lyrics</button><button className="ghost-button" onClick={importLyrics}><Upload size={15}/> Import LRC</button></div>}{lyricLines.length > 0 && <div className="lyrics-bottom"><span>{lyricLines.length} lines · click a timestamp to set timing</span><button className="secondary-button" onClick={autoTimeLyrics} disabled={lyricsBusy}><Sparkles size={15}/> Auto-time (approx.)</button><button className="ghost-button" onClick={()=>saveLyricTiming(lyricLines.map(l=>({...l,time:null,words:undefined})))}>Clear timing</button></div>}</div></div>}

        {page === 'sound' && <div className="page-stack sound-page"><EffectsPanel settings={settings} onChange={saveSettings}/><section className="content-card visualizer-card"><div className="section-heading compact"><div><h2>Live visualiser</h2><p>Audio-reactive display built from the local Web Audio analyser.</p></div><select value={settings.visualizerStyle} onChange={e=>saveSettings({visualizerStyle:e.target.value as AppSettings['visualizerStyle']})}><option value="bars">Bars</option><option value="wave">Wave</option><option value="mirror">Mirror</option><option value="spectrum">Spectrum</option><option value="dots">Dots</option></select></div><Visualizer analyser={analyser.current} style={settings.visualizerStyle} sensitivity={settings.visualizerSensitivity} active={settings.showVisualizer && playing}/><div className="setting-option"><div><b>Visualiser enabled</b><small>Animate only while music is playing.</small></div><Toggle checked={settings.showVisualizer} onChange={v=>saveSettings({showVisualizer:v})}/></div><label className="slider-setting"><span>Sensitivity</span><input type="range" min={0.25} max={2.5} step={0.05} value={settings.visualizerSensitivity} onChange={e=>saveSettings({visualizerSensitivity:Number(e.target.value)})}/><b>{settings.visualizerSensitivity.toFixed(2)}×</b></label><div className="visualizer-layout-manager"><div className="visualizer-layout-manager-heading"><div><b>Saved visualiser layouts</b><small>Save the current style, sensitivity and enabled state. Layouts stay on this device.</small></div></div><div className="visualizer-layout-save"><input aria-label="Visualiser layout name" className="visualizer-layout-name" maxLength={48} value={visualizerLayoutName} placeholder="Name this layout…" onChange={e=>setVisualizerLayoutName(e.target.value)}/><button className="secondary-button" onClick={()=>void saveVisualizerLayout()}>Save layout</button></div>{(settings.visualizerLayouts || []).length ? <div className="visualizer-layout-list">{settings.visualizerLayouts.map(layout=><div className="visualizer-layout-row" key={layout.id}><button className="visualizer-layout-apply" onClick={()=>void applyVisualizerLayout(layout)}><b>{layout.name}</b><small>{layout.style} · {layout.sensitivity.toFixed(2)}× · {layout.enabled ? 'enabled' : 'paused'}</small></button><button className="icon-button" title={`Delete ${layout.name}`} aria-label={`Delete ${layout.name}`} onClick={()=>void deleteVisualizerLayout(layout.id)}><Trash2 size={14}/></button></div>)}</div> : <p className="footnote">No layouts saved yet. Choose a style and sensitivity above, then save them as a reusable layout.</p>}</div></section></div>}

        {page === 'settings' && <div className="settings-page"><section className="settings-intro"><div className="settings-sparkle"><SettingsIcon size={25}/></div><div><span className="eyebrow">MAKE IT FEEL LIKE YOURS</span><h2>Settings</h2><p>Private by design. Your library and preferences stay on this device.</p></div></section><div className="settings-layout"><div className="settings-content">
          <SettingsCard icon={<LibraryBig size={18}/>} title="Music library" description="Choose the folder MyRiff scans for supported audio. Original tracks stay in place."><div className="settings-path"><div><b>{settings.musicFolder || 'No folder selected'}</b><small>{tracks.length.toLocaleString()} tracks in the local index</small></div><button className="secondary-button" onClick={async()=>{const f=await window.myriff.selectMusicFolder();if(f) {await saveSettings({musicFolder:f});await scanFolder(f)}}}><FolderOpen size={15}/> Choose folder</button></div><button className="subtle-button" onClick={()=>scanFolder(settings.musicFolder || undefined)}><RefreshCw size={14}/> Rescan library</button></SettingsCard>
          <SettingsCard icon={<Palette size={18}/>} title="Appearance" description="Set an accent, pick a theme, or add your own profile banner."><div className="setting-option"><div><b>Theme</b><small>Choose a dark or light workspace.</small></div><div className="theme-picker"><button className={settings.theme==='dark'?'picked':''} onClick={()=>saveSettings({theme:'dark'})}><Moon size={16}/> Dark</button><button className={settings.theme==='light'?'picked':''} onClick={()=>saveSettings({theme:'light'})}><Sun size={16}/> Light</button></div></div><div className="setting-option"><div><b>Accent colour</b><small>Automatically sample the current album art.</small></div><label className="switch-label"><input type="checkbox" checked={settings.dynamicAccent} onChange={e=>saveSettings({dynamicAccent:e.target.checked})}/><span className="switch-ui"/><span>{settings.dynamicAccent?'Dynamic':'Custom'}</span></label></div><div className="setting-option"><div><b>Custom accent</b><small>Used when dynamic accent is disabled.</small></div><input aria-label="Accent colour" className="color-picker" type="color" value={settings.accent} onChange={e=>saveSettings({accent:e.target.value})}/></div><div className="settings-path"><div><b>Profile banner</b><small>{settings.bannerPath || 'No banner image selected'}</small></div><div className="inline-actions"><button className="secondary-button" onClick={async()=>{const p=await window.myriff.selectBanner();if(p)saveSettings({bannerPath:p})}}><Upload size={15}/> Choose image</button>{settings.bannerPath && <button className="icon-button" title="Remove banner" onClick={()=>saveSettings({bannerPath:''})}><X size={16}/></button>}</div></div></SettingsCard>
          <SettingsCard icon={<Download size={18}/>} title="Downloads" description="Set the default audio format and conversion quality."><div className="settings-form-grid"><label><span>Default format</span><select value={settings.downloadFormat} onChange={e=>saveSettings({downloadFormat:e.target.value as AppSettings['downloadFormat']})}><option value="mp3">MP3</option><option value="flac">FLAC</option><option value="opus">Opus</option></select></label><label><span>Audio quality</span><select value={settings.downloadQuality} onChange={e=>saveSettings({downloadQuality:e.target.value})}><option value="0">Best available</option><option value="2">High</option><option value="5">Balanced</option><option value="8">Smaller files</option></select></label></div><p className="footnote">Quality values are passed to yt-dlp/FFmpeg; resulting quality depends on the source audio and codecs installed.</p></SettingsCard>
          <SettingsCard icon={<Radio size={18}/>} title="External tools" description="MyRiff invokes these programs as child processes. They are not bundled with this source archive."><ToolPath label="yt-dlp executable" value={settings.ytDlpPath} placeholder="Auto-detect: yt-dlp on PATH" onChange={v=>saveSettings({ytDlpPath:v})} onBrowse={()=>window.myriff.selectExecutable('Select yt-dlp executable').then(p=>{if(p) void saveSettings({ytDlpPath:p})})}/><ToolPath label="FFmpeg executable" value={settings.ffmpegPath} placeholder="Auto-detect: ffmpeg on PATH" onChange={v=>saveSettings({ffmpegPath:v})} onBrowse={()=>window.myriff.selectExecutable('Select FFmpeg executable').then(p=>{if(p) void saveSettings({ffmpegPath:p})})}/><ToolPath label="Deno executable (recommended for YouTube)" value={settings.denoPath} placeholder="Auto-detect: deno on PATH" onChange={v=>saveSettings({denoPath:v})} onBrowse={()=>window.myriff.selectExecutable('Select Deno executable').then(p=>{if(p) void saveSettings({denoPath:p})})}/></SettingsCard>
          <SettingsCard icon={<Radio size={18}/>} title="Streaming priority" description="Choose the preferred order when comparing supported sources. Search results still come from the source you select."><div className="priority-list">{settings.streamPriority.map((source,index)=><div className="priority-row" key={source}><span className="priority-index">{index+1}</span><b>{source}</b><div className="priority-controls"><button className="icon-button" disabled={index===0} onClick={()=>movePriority(index,-1)} title="Move up"><ChevronUp size={15}/></button><button className="icon-button" disabled={index===settings.streamPriority.length-1} onClick={()=>movePriority(index,1)} title="Move down"><ChevronDown size={15}/></button></div></div>)}</div></SettingsCard>
          <SettingsCard icon={<Headphones size={18}/>} title="Integrations" description="Optional operating-system and Discord conveniences."><div className="setting-option"><div><b>Prevent sleep while music plays</b><small>Requests an Electron power-save blocker during playback.</small></div><Toggle checked={settings.inhibitSleep} onChange={v=>saveSettings({inhibitSleep:v})}/></div><div className="setting-option"><div><b>Discord Rich Presence</b><small>Requires a Discord application ID you control.</small></div><Toggle checked={settings.discordRpc} onChange={v=>saveSettings({discordRpc:v})}/></div><label className="field-label">Discord application ID<input value={settings.discordClientId} onChange={e=>saveSettings({discordClientId:e.target.value})} placeholder="Application ID from Discord Developer Portal"/></label><p className="footnote">Rich Presence may not connect if Discord IPC is unavailable or the supplied application ID is invalid. Album art uploads are not sent; the current activity uses the MyRiff app asset key.</p></SettingsCard>
          <SettingsCard icon={<AudioLines size={18}/>} title="Lyrics" description="Manage the source used for online lyric lookups."><div className="setting-option"><div><b>Lyrics provider</b><small>LRCLIB offers plain and synced lyrics for supported tracks.</small></div><select value={settings.lyricsProvider} onChange={e=>saveSettings({lyricsProvider:e.target.value as AppSettings['lyricsProvider']})}><option value="lrclib">LRCLIB</option><option value="local-first">Local lyrics first</option></select></div></SettingsCard>
          <AdvancedSettings settings={settings} onChange={saveSettings} audioOutputs={audioOutputs} trackCount={tracks.length} onNotify={notify}/>
          <SettingsCard icon={<Palette size={18}/>} title="Custom CSS" description="Advanced: CSS selectors can change the renderer UI. Invalid CSS may make parts of the app hard to use."><textarea className="css-editor" spellCheck={false} value={settings.customCss} onChange={e=>saveSettings({customCss:e.target.value})} placeholder="/* Example: .track-card { border-radius: 22px; } */"/><div className="settings-card-bottom"><span>{settings.customCss.length} characters</span><button className="subtle-button" onClick={()=>saveSettings({customCss:''})}><Trash2 size={14}/> Clear overrides</button></div></SettingsCard>
        </div><aside className="settings-aside"><div className="privacy-card"><div className="privacy-mark"><Heart size={18}/></div><h3>Your music stays yours.</h3><p>MyRiff has no accounts, telemetry or analytics. Local tags, playlists and preferences are stored in an SQLite database in your user data folder.</p><div className="privacy-list"><span><Check size={14}/> Source files are not moved</span><span><Check size={14}/> Local playlists</span><span><Check size={14}/> No tracking SDKs</span></div></div><div className="about-card"><span className="eyebrow">ABOUT MYRIFF</span><h3>0.2.0 · Private client build</h3><p>Electron · React · TypeScript · SQLite</p><button className="subtle-button" onClick={()=>notify('MyRiff is an independent project inspired by common desktop music-player workflows.')}><CircleHelp size={14}/> About this build</button></div></aside></div></div>}
      </div>

      {showEffects && !mini && <div className="effects-drawer"><div className="drawer-header"><div><span className="eyebrow">QUICK CONTROLS</span><h3>Sound lab</h3></div><button className="icon-button" onClick={()=>setShowEffects(false)}><X size={17}/></button></div><EffectsPanel settings={settings} onChange={saveSettings}/><button className="ghost-button" onClick={()=>{setShowEffects(false);setPage('sound')}}>Open full sound lab <ArrowUpRight size={14}/></button></div>}
      {queueOpen && !mini && <aside className="queue-drawer"><div className="drawer-header"><div><span className="eyebrow">UP NEXT</span><h3>Queue <span>{queue.length}</span></h3></div><button className="icon-button" onClick={()=>setQueueOpen(false)}><X size={17}/></button></div><div className="queue-drawer-actions"><button className="subtle-button" onClick={()=>setQueue([])}><Trash2 size={14}/> Clear queue</button><button className="subtle-button" onClick={()=>setQueue(old=>[...old].reverse())}>Reverse</button></div>{queue.length ? <div className="queue-list">{queue.map((t,i)=><div className="queue-item" key={`${t.path||t.streamUrl}-${i}`}><span className="queue-index">{i+1}</span><div className="queue-cover">{t.artworkUrl?<img src={t.artworkUrl}/>:<Disc3 size={15}/>}</div><button className="queue-info" onClick={()=>{setQueue(old=>old.slice(i+1));playTrack(t)}}><b>{t.title}</b><small>{t.artist||t.streamSource||'Local file'}</small></button><div className="queue-reorder"><button className="icon-button" disabled={i===0} title="Move earlier" onClick={()=>setQueue(old=>{const a=[...old];[a[i-1],a[i]]=[a[i],a[i-1]];return a})}><ChevronUp size={14}/></button><button className="icon-button" disabled={i===queue.length-1} title="Move later" onClick={()=>setQueue(old=>{const a=[...old];[a[i+1],a[i]]=[a[i],a[i+1]];return a})}><ChevronDown size={14}/></button></div><button className="icon-button" onClick={()=>setQueue(old=>old.filter((_,j)=>j!==i))}><X size={15}/></button></div>)}</div> : <div className="small-empty">Your queue is clear. Add a track with the plus button.</div>}</aside>}

      {!mini && <PlayerBar track={current} playing={playing} position={position} duration={duration || current?.duration || 0} volume={volume} shuffle={shuffle} repeat={repeat} mini={mini} queueOpen={queueOpen} onToggle={togglePlay} onNext={nextTrack} onPrevious={previousTrack} onSeek={v=>{if(audioRef.current)audioRef.current.currentTime=v;setPosition(v)}} onVolume={setVolume} onShuffle={()=>setShuffle(s=>!s)} onRepeat={()=>setRepeat(r=>r==='off'?'all':r==='all'?'one':'off')} onQueue={()=>setQueueOpen(v=>!v)} onMini={()=>window.myriff.setMiniPlayer(true)}/>}
      {mini && <div className="mini-now-playing"><div className="mini-source">{sourceBadge ? <span className="source-tag">{sourceBadge}</span> : <span>MYRIFF PLAYER</span>}<button onClick={()=>window.myriff.setMiniPlayer(false)}><MaximizeMini/> Expand</button></div><PlayerBar track={current} playing={playing} position={position} duration={duration || current?.duration || 0} volume={volume} shuffle={shuffle} repeat={repeat} mini={true} queueOpen={queueOpen} onToggle={togglePlay} onNext={nextTrack} onPrevious={previousTrack} onSeek={v=>{if(audioRef.current)audioRef.current.currentTime=v;setPosition(v)}} onVolume={setVolume} onShuffle={()=>setShuffle(s=>!s)} onRepeat={()=>setRepeat(r=>r==='off'?'all':r==='all'?'one':'off')} onQueue={()=>setQueueOpen(v=>!v)} onMini={()=>window.myriff.setMiniPlayer(false)}/></div>}
      {showAddPlaylist && !mini && <div className="modal-scrim" onClick={()=>setShowAddPlaylist(false)}><div className="modal-card" onClick={e=>e.stopPropagation()}><div className="modal-title"><div><span className="eyebrow">SAVE TRACK</span><h3>Add to playlist</h3></div><button className="icon-button" onClick={()=>setShowAddPlaylist(false)}><X size={18}/></button></div><p>{newPlaylistTrack?.title}</p><label className="field-label">Choose playlist<select value={addToPlaylistId ?? ''} onChange={e=>setAddToPlaylistId(Number(e.target.value))}>{playlists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="primary-button wide-button" onClick={confirmAddPlaylist}><Plus size={16}/> Add track</button></div></div>}
      {toast && !mini && <div className="toast"><Check size={16}/><span>{toast}</span><button onClick={()=>setToast('')}><X size={14}/></button></div>}
      <div className="source-disclaimer">Streaming availability depends on yt-dlp and each provider; MyRiff cannot guarantee ad-free access or bypass service restrictions.</div>
    </main>
  </div>
}

function retimeLyricLine(line: LyricLine, time: number): LyricLine {
  const delta = line.time === null ? 0 : time - line.time
  return { ...line, time, words: line.words?.map(word => ({ ...word, time: Math.max(0, word.time + delta) })) }
}

function renderTimedKaraokeWords(words: NonNullable<LyricLine['words']>, position: number) {
  return words.map((word, index) => <span key={`${index}-${word.time}-${word.text}`} className={position >= word.time ? 'karaoke-word sung' : 'karaoke-word'}>{word.text}</span>)
}

function renderKaraokeWords(text: string, progress: number) {
  const tokens = text.split(/(\s+)/).filter(token => token.length > 0)
  const totalWeight = Math.max(1, tokens.reduce((sum, token) => sum + (token.trim() ? token.length : 0), 0))
  let consumed = 0
  return tokens.map((token, index) => {
    if (!token.trim()) return token
    consumed += token.length
    return <span key={`${index}-${token}`} className={consumed / totalWeight <= progress ? 'karaoke-word sung' : 'karaoke-word'}>{token}</span>
  })
}

function SettingsCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) { return <section className="settings-card"><div className="settings-card-head"><div className="settings-card-icon">{icon}</div><div><h3>{title}</h3><p>{description}</p></div></div><div className="settings-card-body">{children}</div></section> }
function ToolPath({ label, value, placeholder, onChange, onBrowse }: { label: string; value: string; placeholder: string; onChange: (v:string)=>void; onBrowse:()=>void }) { return <div className="tool-path"><label><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label><button className="secondary-button" onClick={onBrowse}><FolderOpen size={15}/> Browse</button></div> }
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v:boolean)=>void }) { return <label className="switch-label"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span className="switch-ui"/></label> }
function MaximizeMini() { return <span className="maximize-mini-glyph">↗</span> }
