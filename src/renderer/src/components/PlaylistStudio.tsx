import { useEffect, useState } from 'react'
import { ArrowLeftRight, CheckCircle2, Download, ExternalLink, FileAudio, FolderOpen, Link2, ListMusic, LoaderCircle, Upload, RefreshCw, Trash2, BookmarkPlus, Pause } from 'lucide-react'
import type { AppSettings, DownloadProgress, Playlist, RemotePlaylistPreview, SavedPlaylistSource } from '../../../shared/types'

export default function PlaylistStudio({ settings, onSettings, playlists, onImported, onNotify }: {
  settings: AppSettings; onSettings: (patch: Partial<AppSettings>) => Promise<void>; playlists: Playlist[]; onImported: (id: number) => Promise<void>; onNotify: (message: string) => void
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [format, setFormat] = useState<AppSettings['downloadFormat']>(settings.downloadFormat)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<{ total: number; found: number; missing: string[]; name?: string } | null>(null)
  const [preview, setPreview] = useState<RemotePlaylistPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [jobs, setJobs] = useState<DownloadProgress[]>([])
  const [savedSources, setSavedSources] = useState<SavedPlaylistSource[]>([])
  const [exportId, setExportId] = useState<number | ''>('')
  const [exportFormat, setExportFormat] = useState<'m3u'|'csv'|'txt'>('m3u')
  useEffect(() => {
    const off = window.myriff.onDownloadProgress(p => setJobs(old => [p, ...old.filter(x => x.id !== p.id)].slice(0, 50)))
    window.myriff.getDownloadJobs().then(saved => setJobs(old => [...saved, ...old.filter(x => !saved.some(y => y.id === x.id))].slice(0, 50))).catch(() => undefined)
    window.myriff.listPlaylistSources().then(setSavedSources).catch(() => undefined)
    return off
  }, [])
  const previewPlaylist = async () => {
    if (!url.trim()) return
    setPreviewBusy(true); setPreview(null); setReport(null)
    try { const result = await window.myriff.previewPlaylist(url.trim()); setPreview(result); onNotify(`Previewed ${result.entries.length} of ${result.total} playlist entries.`) }
    catch (e) { onNotify(e instanceof Error ? e.message : 'Could not preview that playlist.') }
    finally { setPreviewBusy(false) }
  }
  const durationLabel = (seconds: number) => seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—'
  const importRemote = async () => {
    if (!url.trim()) return
    setBusy(true); setReport(null)
    try {
      const result = await window.myriff.importPlaylist(url.trim(), name.trim())
      setReport({ total: result.total, found: result.found, missing: result.missing, name: result.playlistName })
      await onImported(result.playlistId)
      onNotify(`Imported ${result.found} of ${result.total} playlist entries from metadata.`)
    } catch (e) { onNotify(e instanceof Error ? e.message : 'Playlist import failed.') }
    finally { setBusy(false) }
  }
  const downloadWholePlaylist = async () => {
    if (!url.trim()) return
    setBusy(true)
    try {
      await onSettings({ downloadFormat: format })
      const id = await window.myriff.startPlaylistDownload(url.trim(), format)
      setJobs(old => [{ id, status: 'queued', title: 'Preparing playlist…', percent: 0, speed: '', eta: '', url: url.trim(), format }, ...old])
      onNotify('Playlist download queued. Check progress below or on the Downloads page.')
    } catch (e) { onNotify(e instanceof Error ? e.message : 'Could not start playlist download.') }
    finally { setBusy(false) }
  }
  const saveForSync = async () => {
    if (!url.trim()) return
    try { const saved = await window.myriff.savePlaylistSource(name.trim() || preview?.title || 'Saved playlist', url.trim(), format); setSavedSources(old => [saved, ...old.filter(x => x.id !== saved.id)]); onNotify('Playlist source saved. “Sync new tracks” uses yt-dlp’s download archive to skip completed entries of this format.') }
    catch (e) { onNotify(e instanceof Error ? e.message : 'Could not save playlist source.') }
  }
  const syncSavedSource = async (source: SavedPlaylistSource) => {
    try { const id = await window.myriff.syncPlaylistSource(source.id); setJobs(old => [{ id, status:'queued', title:`Sync: ${source.name}`, percent:0, speed:'', eta:'', url:source.url, format:source.format, includePlaylist:true }, ...old]); setSavedSources(await window.myriff.listPlaylistSources()); onNotify(`Sync queued for “${source.name}”. Previously completed entries are skipped for ${source.format.toUpperCase()}.`) }
    catch (e) { onNotify(e instanceof Error ? e.message : 'Could not sync saved source.') }
  }
  const removeSavedSource = async (id: number) => { await window.myriff.deletePlaylistSource(id); setSavedSources(old => old.filter(x => x.id !== id)); onNotify('Saved source removed. Downloaded files were not changed.') }
  const importLocalFile = async () => {
    setBusy(true)
    try {
      const result = await window.myriff.importPlaylistFile()
      if (result) { setReport({ total: result.total, found: result.found, missing: result.missing, name: result.playlistName }); await onImported(result.playlistId); onNotify(`Imported ${result.found} of ${result.total} entries.`) }
    } catch (e) { onNotify(e instanceof Error ? e.message : 'Could not import that playlist file.') }
    finally { setBusy(false) }
  }
  const openTune = async () => { await window.myriff.openTuneMyMusic(); onNotify('TuneMyMusic opened in your browser. Transfer or export the playlist there, then import the resulting M3U, CSV or TXT file here.') }
  const exportLocal = async () => {
    if (exportId === '') return
    try { const path = await window.myriff.exportPlaylistFile(exportId, exportFormat); if (path) onNotify(`Playlist exported to ${path}`) }
    catch (e) { onNotify(e instanceof Error ? e.message : 'Playlist export failed.') }
  }
  return <div className="page-stack playlist-studio-page">
    <section className="stream-hero playlist-studio-hero"><div><span className="hero-pill"><ListMusic size={13}/> PLAYLIST STUDIO</span><h2>One link.<br/><span>Your whole playlist.</span></h2><p>Import track listings, download permitted audio in bulk, or transfer playlist metadata from another service.</p></div><div className="stream-orbit"><Download size={48}/><span/><i/></div></section>
    <section className="content-card"><div className="section-heading compact"><div><h2>Playlist URL</h2><p>Public YouTube, YouTube Music and SoundCloud playlist URLs are handled by your installed yt-dlp version.</p></div><span className="mini-badge">YT-DLP</span></div><label className="field-label">Paste playlist URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://music.youtube.com/playlist?list=…" autoComplete="url"/></label><label className="field-label">Local playlist name (optional)<input value={name} onChange={e => setName(e.target.value)} placeholder="Keep original playlist title"/></label><div className="settings-form-grid playlist-format-grid"><label><span>Audio output format</span><select value={format} onChange={e => setFormat(e.target.value as AppSettings['downloadFormat'])}><option value="opus">Opus · compact</option><option value="mp3">MP3 · compatible</option><option value="flac">FLAC · large files</option></select></label><label><span>Download quality</span><select value={settings.downloadQuality} onChange={e => onSettings({ downloadQuality: e.target.value })}><option value="0">Best available</option><option value="2">High</option><option value="5">Balanced</option><option value="8">Smaller files</option></select></label></div><div className="inline-actions playlist-main-actions"><button className="secondary-button" disabled={busy || previewBusy || !url.trim()} onClick={previewPlaylist}><ListMusic size={16}/>{previewBusy ? 'Previewing…' : 'Preview playlist'}</button><button className="primary-button" disabled={busy || !url.trim()} onClick={downloadWholePlaylist}><Download size={16}/>{busy ? 'Working…' : 'Download whole playlist'}</button><button className="secondary-button" disabled={busy || !url.trim()} onClick={importRemote}><Upload size={16}/> Import track list only</button><button className="ghost-button" disabled={busy} onClick={importLocalFile}><FolderOpen size={16}/> Import playlist file</button><button className="secondary-button" disabled={!url.trim()} onClick={saveForSync}><BookmarkPlus size={16}/> Save for sync</button></div><p className="footnote">Download only audio you are authorised to save. Supported sources may restrict extraction; MyRiff cannot bypass account gates, DRM, advertisements or service restrictions. FLAC conversion does not restore quality absent from a lossy source.</p>{preview && <div className="remote-preview"><div className="remote-preview-head"><div><span className="eyebrow">PLAYLIST PREVIEW</span><h3>{preview.title}</h3><p>{preview.uploader && `${preview.uploader} · `}{preview.total.toLocaleString()} entries{preview.truncated ? ' · first 500 shown' : ''}</p></div><div className="remote-preview-stats"><b>{preview.entries.filter(e => e.localPath).length}</b><small>already local</small></div></div><div className="remote-preview-list">{preview.entries.map((entry, index) => <div className="remote-preview-row" key={`${entry.id}-${index}`}><span className="remote-preview-index">{index + 1}</span><div className="remote-preview-art">{entry.thumbnail ? <img src={entry.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <FileAudio size={16}/>}</div><div className="remote-preview-track"><b>{entry.title}</b><small>{entry.artist || 'Artist unavailable'} · {durationLabel(entry.duration)}</small></div><span className={`remote-match ${entry.localPath ? 'matched' : 'unmatched'}`}>{entry.localPath ? 'In library' : 'Not matched'}</span></div>)}</div><div className="remote-preview-footer"><span>{preview.entries.filter(e => !e.localPath).length} entries need a local match or an authorised download.</span><button className="ghost-button" onClick={() => setPreview(null)}>Hide preview</button></div></div>}{report && <div className="import-report"><CheckCircle2 size={18}/><div><b>{report.name || 'Playlist'} · {report.found} of {report.total} entries matched</b><span>{report.missing.length ? `${report.missing.length} unmatched entries are preserved in this report.` : 'Every entry was matched.'}</span>{report.missing.length > 0 && <details><summary>View unmatched entries</summary><div className="missing-list">{report.missing.slice(0,100).map((item,i)=><span key={`${i}-${item}`}>{item}</span>)}</div></details>}</div></div>}</section>
    <section className="content-card"><div className="section-heading compact"><div><h2>Saved playlist sync sources</h2><p>Save compatible playlist URLs and re-run them later. The download archive skips completed entries for the same output format.</p></div><RefreshCw size={19} color="var(--accent)"/></div>{savedSources.length ? <div className="saved-source-list">{savedSources.map(source=><div className="saved-source-row" key={source.id}><div className="saved-source-icon"><ListMusic size={17}/></div><div className="saved-source-info"><b>{source.name}</b><small>{source.url}</small><small>{source.format.toUpperCase()} · {source.lastSynced ? `Last sync started ${new Date(source.lastSynced).toLocaleString()}` : 'Not synced yet'}</small></div><button className="secondary-button" onClick={()=>{setUrl(source.url);setName(source.name);setFormat(source.format)}}>Load</button><button className="primary-button" onClick={()=>syncSavedSource(source)}><RefreshCw size={14}/> Sync new tracks</button><button className="icon-button" title="Remove saved source" onClick={()=>removeSavedSource(source.id)}><Trash2 size={15}/></button></div>)}</div>:<div className="small-empty">No saved sources yet. Paste a supported playlist URL above and choose “Save for sync”.</div>}</section>
    <section className="content-card"><div className="section-heading compact"><div><h2>TuneMyMusic transfer route</h2><p>Transfer a playlist between services, then bring its track list into MyRiff.</p></div><ArrowLeftRight size={20} color="var(--accent)"/></div><div className="transfer-steps"><div><b>1</b><span>Open TuneMyMusic and choose the source and destination service.</span></div><div><b>2</b><span>Export or download the resulting playlist list as M3U, CSV or TXT when offered.</span></div><div><b>3</b><span>Use “Import playlist file” above. MyRiff matches those entries against your local collection.</span></div></div><button className="secondary-button" onClick={openTune}><ExternalLink size={15}/> Open TuneMyMusic in browser</button><p className="footnote">TuneMyMusic is an external service, not a bundled MyRiff API. Playlist transfer moves track-list information; it does not provide audio files.</p></section>
    <section className="content-card"><div className="section-heading compact"><div><h2>Export a local playlist</h2><p>Create a portable M3U, CSV or text track list.</p></div><FileAudio size={19} color="var(--accent)"/></div><div className="export-playlist-controls"><label><span>Playlist</span><select value={exportId} onChange={e=>setExportId(e.target.value ? Number(e.target.value) : '')}><option value="">Choose playlist…</option>{playlists.map(p=><option key={p.id} value={p.id}>{p.name} ({p.trackCount})</option>)}</select></label><label><span>Format</span><select value={exportFormat} onChange={e=>setExportFormat(e.target.value as typeof exportFormat)}><option value="m3u">M3U8</option><option value="csv">CSV</option><option value="txt">Text</option></select></label><button className="secondary-button" disabled={exportId === ''} onClick={exportLocal}><Download size={15}/> Export</button></div></section>
    <section className="content-card"><div className="section-heading compact"><div><h2>Playlist download activity</h2><p>Current task status and retry guidance.</p></div><span className="muted">{jobs.filter(j=>j.status==='downloading'||j.status==='queued').length} active</span></div>{jobs.length ? <div className="download-list">{jobs.map(job=><div className="download-item" key={job.id}><div className="download-file-icon"><Download size={18}/></div><div className="download-info"><b>{job.title}</b><small>{job.status==='downloading'?`${job.completed && job.total ? `${job.completed}/${job.total} tracks · ` : ''}${job.speed||'Downloading…'} · ETA ${job.eta||'—'}`:job.status==='finished'?'Completed':job.status==='cancelled'?'Cancelled — rerunning the same URL can resume partial files':job.status==='paused'?'Paused — resume to continue from retained partial files':job.status==='error'?job.error||'Failed':'Queued'}</small>{job.status!=='error'&&job.status!=='cancelled'&&<div className="progress-track"><i style={{width:`${job.percent}%`}}/></div>}</div><span className={`job-state ${job.status==='finished'?'finished':job.status==='error'?'error':job.status==='paused'?'paused':'downloading'}`}>{job.status==='finished'?'Complete':job.status==='error'?'Failed':job.status==='cancelled'?'Stopped':job.status==='paused'?'Paused':job.status==='queued'?'Queued':`${Math.round(job.percent)}%`}</span>{(job.status==='downloading'||job.status==='queued')&&<><button className="icon-button" title="Pause download; resume uses retained partial files" onClick={async()=>{const ok=await window.myriff.pauseDownload(job.id);if(ok)onNotify('Pause requested. Resume the job to continue from retained partial files where supported.')}}><Pause size={14}/></button><button className="icon-button" title="Cancel download" onClick={async()=>{await window.myriff.cancelDownload(job.id);onNotify('Cancellation requested. Partial data is kept for a retry where supported.')}}>×</button></>}{(job.status==='error'||job.status==='cancelled'||job.status==='paused')&&job.url&&<button className="icon-button" title={job.status==='paused'?'Resume download':'Retry download'} onClick={async()=>{try{const id=job.includePlaylist?await window.myriff.startPlaylistDownload(job.url!,job.format||format):await window.myriff.startDownload(job.url!,job.format||format);setJobs(old=>[{...job,id,status:'queued',percent:0,error:undefined},...old])}catch(e){onNotify(e instanceof Error?e.message:'Retry failed')}}}>↻</button>}</div>)}</div>:<div className="small-empty">No playlist download tasks in this session.</div>}</section>
  </div>
}
