import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Archive, AudioLines, Bug, CheckCircle2, Download, Keyboard, LayoutGrid, SlidersHorizontal, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import type { AppSettings, AudioProfile } from '../../../shared/types'

type DiagnosticReport = { appVersion: string; platform: string; architecture: string; userDataPath: string; tools: Array<{ name: string; command: string; installed: boolean; version: string }> }

export default function AdvancedSettings({ settings, onChange, audioOutputs, trackCount, onNotify }: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => Promise<void>
  audioOutputs: MediaDeviceInfo[]
  trackCount: number
  onNotify: (message: string) => void
}) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null)
  const [checkingTools, setCheckingTools] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileBy, setProfileBy] = useState<AudioProfile['matchBy']>('genre')
  const [profileValue, setProfileValue] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [capturingShortcut, setCapturingShortcut] = useState<string | null>(null)
  const [capturingGlobalShortcut, setCapturingGlobalShortcut] = useState<string | null>(null)
  const [calibrationStatus, setCalibrationStatus] = useState('No test tone is playing.')
  const [calibrationBusy, setCalibrationBusy] = useState(false)
  const calibrationRef = useRef<{ context: AudioContext; oscillator: OscillatorNode; timer: number | null } | null>(null)

  const stopCalibrationTone = (message = 'Test tone stopped.') => {
    const active = calibrationRef.current
    if (active) {
      if (active.timer !== null) window.clearTimeout(active.timer)
      try { active.oscillator.stop() } catch { /* oscillator may already have stopped */ }
      void active.context.close().catch(() => undefined)
      calibrationRef.current = null
    }
    setCalibrationBusy(false)
    setCalibrationStatus(message)
  }

  const playCalibrationTone = async (pan: number, channel: 'left' | 'centre' | 'right') => {
    if (calibrationRef.current) stopCalibrationTone('Replacing the previous test tone…')
    setCalibrationBusy(true)
    setCalibrationStatus('Preparing a short, low-level test tone…')
    let context: AudioContext | null = null
    try {
      const activeContext = new AudioContext()
      context = activeContext
      const sinkContext = activeContext as AudioContext & { setSinkId?: (deviceId: string) => Promise<void> }
      const outputId = settings.audioOutputDeviceId
      if (outputId) {
        if (typeof sinkContext.setSinkId !== 'function') {
          throw new Error('This Electron runtime cannot route a calibration tone to the selected device. Choose System default, then test your normal playback.')
        }
        await sinkContext.setSinkId(outputId)
      }
      await activeContext.resume()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const panner = context.createStereoPanner()
      const now = activeContext.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(330, now)
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.055, now + 0.04)
      gain.gain.setValueAtTime(0.055, now + 0.42)
      gain.gain.linearRampToValueAtTime(0, now + 0.72)
      oscillator.connect(gain)
      gain.connect(panner)
      panner.connect(activeContext.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.75)
      const outputLabel = outputId
        ? (audioOutputs.find(device => device.deviceId === outputId)?.label || 'selected output device')
        : 'system default output'
      setCalibrationStatus(`Playing a quiet 330 Hz ${channel} tone on ${outputLabel} for less than one second.`)
      const timer = window.setTimeout(() => {
        if (calibrationRef.current?.context !== activeContext) return
        calibrationRef.current = null
        setCalibrationBusy(false)
        setCalibrationStatus(`The ${channel} test tone finished. Did it come from the expected speaker or channel?`)
        void activeContext.close().catch(() => undefined)
      }, 850)
      calibrationRef.current = { context: activeContext, oscillator, timer }
    } catch (error) {
      if (context) void context.close().catch(() => undefined)
      calibrationRef.current = null
      setCalibrationBusy(false)
      const message = error instanceof Error ? error.message : 'Could not play a test tone.'
      setCalibrationStatus(message)
      onNotify(message)
    }
  }

  useEffect(() => () => {
    const active = calibrationRef.current
    if (!active) return
    if (active.timer !== null) window.clearTimeout(active.timer)
    try { active.oscillator.stop() } catch { /* oscillator may already have stopped */ }
    void active.context.close().catch(() => undefined)
    calibrationRef.current = null
  }, [])

  const runDiagnostics = async () => {
    setCheckingTools(true)
    try { const result = await window.myriff.getToolDiagnostics(); setDiagnostics(result) }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Diagnostics failed.') }
    finally { setCheckingTools(false) }
  }
  const exportBackup = async () => {
    setBackupBusy(true)
    try { const result = await window.myriff.exportBackup(); if (result) onNotify(`Backup exported to ${result}`) }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Backup export failed.') }
    finally { setBackupBusy(false) }
  }
  const importBackup = async () => {
    const accepted = !settings.confirmDestructiveActions || window.confirm('Restore a MyRiff backup? This replaces the current database settings, playlists and local index. Export a backup first if you may need to undo this.')
    if (!accepted) return
    setBackupBusy(true)
    try { const ok = await window.myriff.importBackup(); onNotify(ok ? 'Backup restored. Restart MyRiff if the interface still shows older settings.' : 'Backup restore cancelled.') }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Backup restore failed.') }
    finally { setBackupBusy(false) }
  }
  const createProfile = async () => {
    const value = profileValue.trim()
    if (profileBy !== 'manual' && !value) { onNotify('Enter a match value for this audio profile.'); return }
    const profile: AudioProfile = {
      id: crypto.randomUUID(), name: profileName.trim() || `${profileBy === 'manual' ? 'Manual' : value} profile`,
      matchBy: profileBy, matchValue: value, eqBands: [...settings.eqBands], eqFrequencies: [...settings.eqFrequencies], eqQ: settings.eqQ, stereoWidth: settings.stereoWidth, tempo: settings.effectTempo,
      pitch: settings.effectPitch, reverb: settings.effectReverb, distortion: settings.effectDistortion, enabled: true
    }
    await onChange({ audioProfiles: [...settings.audioProfiles, profile] })
    setProfileName(''); setProfileValue(''); onNotify(`Created audio profile “${profile.name}”.`)
  }
  const updateProfile = (id: string, patch: Partial<AudioProfile>) => onChange({ audioProfiles: settings.audioProfiles.map(p => p.id === id ? { ...p, ...patch } : p) })

  return <>
    <SettingsCard icon={<SlidersHorizontal size={18}/>} title="Playback & sound" description="Fine-tune transitions, loudness matching, the audio output, and the sleep timer.">
      <div className="setting-option"><div><b>Normalise loudness</b><small>Apply ReplayGain values analysed by the Audio Tools panel.</small></div><Toggle checked={settings.normalizeLoudness} onChange={v => onChange({ normalizeLoudness: v })}/></div>
      <RangeSetting label="Target loudness" description="Louder targets increase perceived volume. −14 LUFS is a useful general-purpose starting point." value={settings.loudnessTargetLufs} min={-23} max={-8} step={0.5} suffix=" LUFS" onChange={v => onChange({ loudnessTargetLufs: v })}/>
      <RangeSetting label="Track transition fade" description="A short fade can soften track boundaries; true overlap crossfading is a separate playback-engine milestone." value={settings.crossfadeSeconds} min={0} max={12} step={0.5} suffix=" s" onChange={v => onChange({ crossfadeSeconds: v })}/>
      <div className="settings-form-grid"><label><span>Audio output device</span><select value={settings.audioOutputDeviceId} onChange={e => onChange({ audioOutputDeviceId: e.target.value })}><option value="">System default</option>{audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Audio output ${d.deviceId.slice(0, 8)}`}</option>)}</select></label><label><span>Sleep timer</span><select value={settings.sleepTimerMinutes} onChange={e => onChange({ sleepTimerMinutes: Number(e.target.value) })}><option value={0}>Off</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label></div>
      <div className="audio-calibration-panel">
        <div className="audio-calibration-heading"><div><b>Output check</b><small>Play a brief, quiet tone to confirm routing and left/right channel placement. Nothing is recorded or uploaded.</small></div><AudioLines size={18}/></div>
        <div className="audio-calibration-actions">
          <button className="secondary-button" disabled={calibrationBusy} onClick={() => void playCalibrationTone(-1, 'left')}>Test left</button>
          <button className="secondary-button" disabled={calibrationBusy} onClick={() => void playCalibrationTone(0, 'centre')}>Test centre</button>
          <button className="secondary-button" disabled={calibrationBusy} onClick={() => void playCalibrationTone(1, 'right')}>Test right</button>
          <button className="ghost-button" disabled={!calibrationBusy} onClick={() => stopCalibrationTone()}>Stop</button>
        </div>
        <p className="footnote" role="status" aria-live="polite">{calibrationStatus}</p>
      </div>
      <div className="setting-option"><div><b>Bypass all effects</b><small>Quick A/B comparison against clean playback.</small></div><Toggle checked={settings.effectsBypass} onChange={v => onChange({ effectsBypass: v })}/></div>
      <div className="settings-form-grid"><label><span>Effects chain order</span><select value={settings.effectChain.join(',')} onChange={e => onChange({ effectChain: e.target.value.split(',') as AppSettings['effectChain'] })}><option value="eq,distortion,reverb">EQ → Distortion → Reverb</option><option value="eq,reverb,distortion">EQ → Reverb → Distortion</option><option value="distortion,eq,reverb">Distortion → EQ → Reverb</option><option value="reverb,eq,distortion">Reverb → EQ → Distortion</option></select></label><label><span>History limit</span><select value={settings.historyLimit} onChange={e => onChange({ historyLimit: Number(e.target.value) })}><option value={100}>100 plays</option><option value={500}>500 plays</option><option value={1000}>1,000 plays</option><option value={5000}>5,000 plays</option></select></label></div>
    </SettingsCard>

    <SettingsCard icon={<LayoutGrid size={18}/>} title="Interface & layout" description="Make MyRiff your own: density, sizing, navigation defaults, and what information appears in the library.">
      <div className="settings-form-grid"><label><span>Theme</span><select value={settings.theme} onChange={e => onChange({ theme: e.target.value as AppSettings['theme'] })}><option value="system">Follow system</option><option value="dark">Dark</option><option value="light">Light</option></select></label><label><span>Interface density</span><select value={settings.uiDensity} onChange={e => onChange({ uiDensity: e.target.value as AppSettings['uiDensity'] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option><option value="cozy">Cozy</option></select></label><label><span>Default page on launch</span><select value={settings.defaultPage} onChange={e => onChange({ defaultPage: e.target.value as AppSettings['defaultPage'] })}><option value="library">Library</option><option value="playlists">Playlists</option><option value="search">Search</option><option value="downloads">Downloads</option><option value="playlist-studio">Playlist Studio</option><option value="power-tools">Library intelligence</option><option value="radio">Local radio</option><option value="editor">Audio editor</option><option value="lyrics">Lyrics</option><option value="sound">Sound lab</option><option value="settings">Settings</option></select></label><label><span>Library grouping</span><select value={settings.groupBy} onChange={e => onChange({ groupBy: e.target.value as AppSettings['groupBy'] })}><option value="album">Album</option><option value="artist">Artist</option><option value="folder">Folder</option><option value="genre">Genre</option></select></label></div>
      <RangeSetting label="UI scale" description="Adjust the overall interface scale." value={settings.uiScale} min={80} max={125} step={5} suffix="%" onChange={v => onChange({ uiScale: v })}/>
      <RangeSetting label="Sidebar width" value={settings.sidebarWidth} min={190} max={340} step={4} suffix=" px" onChange={v => onChange({ sidebarWidth: v })}/>
      <RangeSetting label="Corner radius" value={settings.cornerRadius} min={0} max={28} step={1} suffix=" px" onChange={v => onChange({ cornerRadius: v })}/>
      <RangeSetting label="Grid columns" description="Set to Auto to let the grid respond to the available width." value={settings.gridColumns} min={0} max={8} step={1} suffix={settings.gridColumns ? '' : ' · Auto'} onChange={v => onChange({ gridColumns: v })}/>
      <div className="setting-option"><div><b>Animate transitions</b><small>Disable movement and visual transitions for a quieter interface.</small></div><Toggle checked={settings.animationsEnabled} onChange={v => onChange({ animationsEnabled: v })}/></div>
      <div className="setting-option"><div><b>Album-art atmosphere</b><small>Use the current artwork as a subtle background influence.</small></div><Toggle checked={settings.showArtworkBackground} onChange={v => onChange({ showArtworkBackground: v })}/></div>
      <div className="settings-form-grid three"><ToggleRow title="Track numbers" checked={settings.showTrackNumbers} onChange={v => onChange({ showTrackNumbers: v })}/><ToggleRow title="Year labels" checked={settings.showYear} onChange={v => onChange({ showYear: v })}/><ToggleRow title="Genre labels" checked={settings.showGenre} onChange={v => onChange({ showGenre: v })}/></div>
    </SettingsCard>

    <SettingsCard icon={<Sparkles size={18}/>} title="Audio profiles" description="Create profiles that match a genre, artist, or output device. Profiles capture the current Sound Lab settings.">
      <div className="settings-form-grid"><label><span>Profile name</span><input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="e.g. Late-night listening"/></label><label><span>Match by</span><select value={profileBy} onChange={e => setProfileBy(e.target.value as AudioProfile['matchBy'])}><option value="genre">Genre</option><option value="artist">Artist</option><option value="device">Output device ID</option><option value="manual">Manual only (no automatic match)</option></select></label></div>
      {profileBy !== 'manual' && <label className="field-label">Match value<input value={profileValue} onChange={e => setProfileValue(e.target.value)} placeholder={profileBy === 'genre' ? 'e.g. Electronic' : profileBy === 'artist' ? 'e.g. Massive Attack' : 'Output device ID or default'}/></label>}
      <button className="secondary-button" onClick={createProfile}><Sparkles size={15}/> Save current sound as profile</button>
      {settings.audioProfiles.length > 0 ? <div className="saved-profile-list">{settings.audioProfiles.map(profile => <div className="saved-profile-row" key={profile.id}><div className="saved-profile-info"><b>{profile.name}</b><small>{profile.matchBy === 'manual' ? 'Manual only' : `${profile.matchBy}: ${profile.matchValue}`} · ${profile.eqBands.length}-band EQ</small></div><Toggle checked={profile.enabled} onChange={v => updateProfile(profile.id, { enabled: v })}/><button className="icon-button" title="Delete profile" onClick={() => onChange({ audioProfiles: settings.audioProfiles.filter(p => p.id !== profile.id) })}><Trash2 size={15}/></button></div>)}</div> : <p className="footnote">No profiles yet. Profiles are optional and can be deleted at any time.</p>}
    </SettingsCard>

    <SettingsCard icon={<Keyboard size={18}/>} title="Keyboard shortcuts" description="Change shortcuts to fit your workflow. Use standard names such as Space, Ctrl+K, F, Q, or MediaTrackNext.">
      <div className="shortcut-grid">{([['playPause','Play / pause'],['next','Next track'],['previous','Previous track'],['search','Focus search'],['queue','Toggle queue'],['favorite','Favourite current track']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input value={capturingShortcut === key ? 'Press a key combination…' : settings.keyboardShortcuts[key] || ''} readOnly onClick={() => setCapturingShortcut(key)} onBlur={() => setCapturingShortcut(old => old === key ? null : old)} onKeyDown={event => { if (capturingShortcut !== key) return; event.preventDefault(); event.stopPropagation(); if (event.key === 'Escape') { setCapturingShortcut(null); return } if (event.key === 'Backspace' || event.key === 'Delete') { onChange({ keyboardShortcuts: { ...settings.keyboardShortcuts, [key]: '' } }); setCapturingShortcut(null); return } if (['Control','Alt','Shift','Meta'].includes(event.key)) return; const base = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key; const binding = `${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.metaKey ? 'Meta+' : ''}${base}`; const conflict = Object.entries(settings.keyboardShortcuts).find(([other, value]) => other !== key && value && value.toLowerCase() === binding.toLowerCase()); if (conflict) { onNotify(`${binding} is already assigned to ${({playPause:'Play / pause',next:'Next track',previous:'Previous track',search:'Focus search',queue:'Toggle queue',favorite:'Favourite current track'} as Record<string,string>)[conflict[0]] || conflict[0]}. Choose a different combination.`); return } onChange({ keyboardShortcuts: { ...settings.keyboardShortcuts, [key]: binding } }); setCapturingShortcut(null) }} placeholder="Click, then press a shortcut"/></label>)}</div>
      <button className="subtle-button" onClick={() => { setCapturingShortcut(null); return onChange({ keyboardShortcuts: { playPause: 'Space', next: 'MediaTrackNext', previous: 'MediaTrackPrevious', search: 'Ctrl+K', queue: 'Q', favorite: 'F' } }) }}>Restore default shortcuts</button>
      <p className="footnote">Click a field, press a key combination, and press Backspace to disable it. Conflicting app shortcuts are rejected.</p>
      <div className="global-shortcut-head"><div><b>OS-global shortcuts</b><small>Work while MyRiff is unfocused. Some accelerators may be reserved by the operating system or another app.</small></div><Toggle checked={settings.globalShortcutsEnabled} onChange={v => onChange({ globalShortcutsEnabled: v })}/></div>
      <div className="shortcut-grid global-shortcut-grid">{([['playPause','Play / pause'],['next','Next track'],['previous','Previous track'],['volumeUp','MyRiff volume up'],['volumeDown','MyRiff volume down']] as const).map(([key,label]) => <label key={key}><span>{label}</span><input value={capturingGlobalShortcut === key ? 'Press a global combination…' : settings.globalKeyboardShortcuts?.[key] || ''} readOnly onClick={() => setCapturingGlobalShortcut(key)} onBlur={() => setCapturingGlobalShortcut(old => old === key ? null : old)} onKeyDown={event => {
        if (capturingGlobalShortcut !== key) return
        event.preventDefault(); event.stopPropagation()
        if (event.key === 'Escape') { setCapturingGlobalShortcut(null); return }
        if (event.key === 'Backspace' || event.key === 'Delete') { void onChange({ globalKeyboardShortcuts: { ...settings.globalKeyboardShortcuts, [key]: '' } }); setCapturingGlobalShortcut(null); return }
        if (['Control','Alt','Shift','Meta'].includes(event.key)) return
        const knownMediaKeys: Record<string,string> = { MediaPlayPause: 'MediaPlayPause', MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute' }
        const base = knownMediaKeys[event.key] || (event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key)
        const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
        const mediaKeys = ['MediaPlayPause','MediaNextTrack','MediaPreviousTrack','VolumeUp','VolumeDown','VolumeMute']
        if (!hasModifier && !mediaKeys.includes(base)) { onNotify('For an OS-global shortcut, use Ctrl, Alt, Shift or Meta with a key, or press a supported media key.'); return }
        const binding = `${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.metaKey ? 'Meta+' : ''}${base}`
        const conflict = Object.entries(settings.globalKeyboardShortcuts || {}).find(([other,value]) => other !== key && value && value.toLowerCase() === binding.toLowerCase())
        if (conflict) { onNotify(`${binding} is already assigned to ${conflict[0]}. Choose another global shortcut.`); return }
        void onChange({ globalKeyboardShortcuts: { ...settings.globalKeyboardShortcuts, [key]: binding } })
        setCapturingGlobalShortcut(null)
      }} placeholder="Click, then press a global shortcut" /></label>)}</div>
      <button className="subtle-button" onClick={() => { setCapturingGlobalShortcut(null); return onChange({ globalShortcutsEnabled: true, globalKeyboardShortcuts: { playPause: 'MediaPlayPause', next: 'MediaNextTrack', previous: 'MediaPreviousTrack', volumeUp: 'VolumeUp', volumeDown: 'VolumeDown' } }) }}>Restore OS-global defaults</button>
      <p className="footnote">Global shortcuts can fail to register when another process or the OS owns the accelerator. Blank a binding to leave that action unregistered, or turn off OS-global shortcuts entirely.</p>
    </SettingsCard>

    <SettingsCard icon={<WandSparkles size={18}/>} title="Library intelligence" description="Keep your index tidy and control metadata lookups. These features never silently overwrite your original tags.">
      <div className="setting-option"><div><b>Watch music folder</b><small>Automatically rescan when files are added, renamed, or removed. May use more disk activity on huge libraries.</small></div><Toggle checked={settings.autoWatchFolders} onChange={v => onChange({ autoWatchFolders: v })}/></div>
      <div className="settings-form-grid"><label><span>Duplicate detection</span><select value={settings.duplicateScanMode} onChange={e => onChange({ duplicateScanMode: e.target.value as AppSettings['duplicateScanMode'] })}><option value="both">Audio hash + metadata</option><option value="hash">Exact file hash only</option><option value="metadata">Metadata similarity only</option></select></label><label><span>Playlist match threshold</span><select value={settings.playlistImportMatchThreshold} onChange={e => onChange({ playlistImportMatchThreshold: Number(e.target.value) })}><option value={0.6}>More matches · 60%</option><option value={0.7}>Balanced · 70%</option><option value={0.76}>Default · 76%</option><option value={0.85}>Strict · 85%</option><option value={0.95}>Very strict · 95%</option></select></label></div>
      <div className="setting-option"><div><b>Suggest metadata from MusicBrainz</b><small>Search by title and artist. Review the match before exporting a tagged copy.</small></div><Toggle checked={settings.autoEnrichMetadata} onChange={v => onChange({ autoEnrichMetadata: v })}/></div>
      <div className="setting-option"><div><b>Keep listening history</b><small>Store locally; change the history limit above or clear it in Library Tools.</small></div><Toggle checked={settings.historyEnabled} onChange={v => onChange({ historyEnabled: v })}/></div>
    </SettingsCard>

    <SettingsCard icon={<AudioLines size={18}/>} title="Lyrics & external metadata" description="Control local lyric caching and whether optional online matching is available.">
      <div className="setting-option"><div><b>Cache lyrics locally</b><small>Store LRCLIB results and manual timing in MyRiff’s SQLite database. Turn off to keep fetched lyrics transient.</small></div><Toggle checked={settings.saveLyricsLocally} onChange={v => onChange({ saveLyricsLocally: v })}/></div>
      <div className="settings-form-grid"><label><span>Lyrics provider</span><select value={settings.lyricsProvider} onChange={e=>onChange({lyricsProvider:e.target.value as AppSettings['lyricsProvider']})}><option value="lrclib">LRCLIB online</option><option value="local-first">Local cache first, then LRCLIB</option></select></label><label><span>Metadata provider</span><select value={settings.metadataProvider} onChange={e=>onChange({metadataProvider:e.target.value as AppSettings['metadataProvider']})}><option value="musicbrainz">MusicBrainz suggestions</option><option value="off">Disabled</option></select></label></div>
      <p className="footnote">No background scraping is performed. Online requests occur only when you ask MyRiff to search. Existing tags are never replaced automatically.</p>
    </SettingsCard>

    <SettingsCard icon={<Download size={18}/>} title="Download management" description="Tune playlist import, storage location, retries, and parallel tasks.">
      <div className="settings-path"><div><b>{settings.downloadFolder || 'Default: Music/MyRiff Downloads'}</b><small>Completed downloads are indexed automatically; existing files are never overwritten on purpose.</small></div><button className="secondary-button" onClick={async () => { const folder = await window.myriff.selectDownloadFolder(); if (folder) await onChange({ downloadFolder: folder }) }}><Archive size={15}/> Choose folder</button></div>
      <div className="settings-form-grid"><label><span>Parallel downloads</span><select value={settings.downloadConcurrency} onChange={e => onChange({ downloadConcurrency: Number(e.target.value) })}><option value={1}>1 · Safer / slower</option><option value={2}>2 · Balanced</option><option value={3}>3 · Faster</option><option value={4}>4 · Aggressive</option></select></label><label><span>Retry attempts</span><select value={settings.downloadRetries} onChange={e => onChange({ downloadRetries: Number(e.target.value) })}><option value={0}>No retries</option><option value={1}>1 retry</option><option value={3}>3 retries</option><option value={5}>5 retries</option><option value={10}>10 retries</option></select></label></div>
      <div className="setting-option"><div><b>Automatically sync saved playlists</b><small>When enabled, MyRiff checks saved sources while the app is running and downloads new items using yt-dlp’s archive. Disabled by default.</small></div><Toggle checked={settings.playlistAutoSync} onChange={v => onChange({ playlistAutoSync: v })}/></div>
      <label className="settings-inline-select"><span>Automatic sync interval</span><select value={settings.playlistSyncIntervalHours} onChange={e => onChange({ playlistSyncIntervalHours: Number(e.target.value) })}><option value={1}>Every hour</option><option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Every 24 hours</option><option value={72}>Every 3 days</option><option value={168}>Every week</option></select></label>
      <p className="footnote">Scheduled sync runs only while MyRiff is open. Saved source URLs are contacted when this option is enabled. yt-dlp retains partial downloads where supported; the archive skips entries already completed.</p>
    </SettingsCard>

    <SettingsCard icon={<Archive size={18}/>} title="Privacy, backups & repair" description="Export a local backup, restore it, or collect diagnostics without telemetry or account sign-in.">
      <div className="inline-actions"><button className="secondary-button" disabled={backupBusy} onClick={exportBackup}><Download size={15}/> Export backup</button><button className="secondary-button" disabled={backupBusy} onClick={importBackup}><Archive size={15}/> Restore backup</button><button className="ghost-button" onClick={async () => { const result = await window.myriff.exportDiagnosticReport(); if (result) onNotify(`Diagnostics exported to ${result}`) }}><Bug size={15}/> Export diagnostics</button></div>
      <div className="inline-actions"><button className="secondary-button" disabled={backupBusy} onClick={async () => { try { const result = await window.myriff.exportSettingsProfile(); if (result) onNotify(`Customisation profile exported to ${result}`) } catch (error) { onNotify(error instanceof Error ? error.message : 'Profile export failed.') } }}><Download size={15}/> Export customisation</button><button className="secondary-button" disabled={backupBusy} onClick={async () => { try { const result = await window.myriff.importSettingsProfile(); if (result) { await onChange(result); onNotify('Customisation profile imported.') } } catch (error) { onNotify(error instanceof Error ? error.message : 'Profile import failed.') } }}><Archive size={15}/> Import customisation</button></div>
      <p className="footnote">Customisation profiles include appearance, shortcuts and audio settings, but exclude library paths, download locations and listening history. Use a full backup to move your library index and playlists.</p>
      <div className="setting-option"><div><b>Portable data mode</b><small>Store MyRiff’s database, settings and artwork beside the application in a “MyRiff-Data” folder. Switching modes restarts MyRiff; the application folder must be writable. Keep the portable data folder with the app when moving it.</small></div><Toggle checked={settings.portableMode} onChange={v => { const accepted = window.confirm(v ? 'Enable portable mode? MyRiff will copy its data beside the application and restart. Make sure the application folder is writable.' : 'Disable portable mode? MyRiff will copy portable data back to the standard user-data folder and restart.'); if (accepted) void onChange({ portableMode: v }).catch(error => onNotify(error instanceof Error ? error.message : 'Could not change portable mode.')) }}/></div>
      <div className="setting-option"><div><b>Confirm destructive actions</b><small>Ask before restoring backups or removing library references.</small></div><Toggle checked={settings.confirmDestructiveActions} onChange={v => onChange({ confirmDestructiveActions: v })}/></div>
      <button className="secondary-button" disabled={checkingTools} onClick={runDiagnostics}><Bug size={15}/>{checkingTools ? 'Checking tools…' : 'Check tool health'}</button>
      {diagnostics && <div className="diagnostics-panel"><div className="diagnostics-summary"><b>MyRiff {diagnostics.appVersion}</b><small>{diagnostics.platform} · {diagnostics.architecture}</small><small>Data: {diagnostics.userDataPath}</small></div>{diagnostics.tools.map(tool => <div className="diagnostic-row" key={tool.name}><span className={tool.installed ? 'diagnostic-good' : 'diagnostic-bad'}>{tool.installed ? <CheckCircle2 size={15}/> : <Bug size={15}/>}</span><div><b>{tool.name}</b><small>{tool.version}</small></div><span>{tool.installed ? 'Available' : 'Not detected'}</span></div>)}</div>}
      <p className="footnote">This page never uploads your library or backup. Diagnostic reports include app and tool versions and selected non-secret settings; review the saved report before sharing it.</p>
    </SettingsCard>
  </>
}

function SettingsCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="settings-card"><div className="settings-card-head"><div className="settings-card-icon">{icon}</div><div><h3>{title}</h3><p>{description}</p></div></div><div className="settings-card-body">{children}</div></section>
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <label className="switch-label"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/><span className="switch-ui"/></label> }
function ToggleRow({ title, checked, onChange }: { title: string; checked: boolean; onChange: (value:boolean)=>void }) { return <div className="setting-option mini-setting-option"><span>{title}</span><Toggle checked={checked} onChange={onChange}/></div> }
function RangeSetting({ label, description, value, min, max, step, suffix, onChange }: { label:string; description?:string; value:number; min:number; max:number; step:number; suffix:string; onChange:(value:number)=>void }) {
  return <label className="advanced-range"><span className="advanced-range-head"><b>{label}</b><strong>{value}{suffix}</strong></span>{description && <small>{description}</small>}<input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>
}
