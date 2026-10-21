import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, AudioLines, Bookmark, Check, CheckCircle2, Clock3, Copy, FileSpreadsheet, Heart, ListMusic, LoaderCircle, Music2, Search, ShieldAlert, Sparkles, Star, Trash2, WandSparkles } from 'lucide-react'
import type { AppSettings, DuplicateGroup, ListeningHistoryItem, MetadataExportOperation, MetadataSuggestion, SmartPlaylist, SmartPlaylistRule, Track, TrackBookmark } from '../../../shared/types'

const formatTime = (seconds: number) => `${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`

export default function PowerToolsPage({ tracks, current, position, settings, metadataReviewQueue, onCompleteMetadataReview, onSeek, onPlay, onRefresh, onNotify }: {
  tracks: Track[]; current: Track | null; position: number; settings: AppSettings; metadataReviewQueue: string[]; onCompleteMetadataReview: (trackPath: string) => Promise<void>; onSeek: (time:number)=>void; onPlay: (track:Track, context?:Track[])=>void; onRefresh: ()=>Promise<void>; onNotify: (message:string)=>void
}) {
  const [history, setHistory] = useState<ListeningHistoryItem[]>([])
  const [bookmarks, setBookmarks] = useState<TrackBookmark[]>([])
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylist[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [working, setWorking] = useState('')
  const [smartName, setSmartName] = useState('Recently loved')
  const [ruleRows, setRuleRows] = useState<Array<{field:SmartPlaylistRule['field'];operator:SmartPlaylistRule['operator'];value:string}>>([{field:'rating',operator:'greaterThan',value:'3'}])
  const [ruleMatch, setRuleMatch] = useState<'all'|'any'>('all')
  const [smartTracks, setSmartTracks] = useState<Track[]>([])
  const [activeSmartId, setActiveSmartId] = useState<number|null>(null)
  const [metadataPath, setMetadataPath] = useState('')
  const [metadataResults, setMetadataResults] = useState<MetadataSuggestion[]>([])
  const lastAutoLookupRef = useRef('')
  const [loudnessPath, setLoudnessPath] = useState('')
  const [bookmarkLabel, setBookmarkLabel] = useState('')
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkSearch, setBulkSearch] = useState('')
  const [bulkArtist, setBulkArtist] = useState('')
  const [bulkAlbum, setBulkAlbum] = useState('')
  const [bulkYear, setBulkYear] = useState('')
  const [bulkTitleTemplate, setBulkTitleTemplate] = useState('')
  const [bulkReport, setBulkReport] = useState<{ successes: string[]; failures: Array<{ path: string; error: string }>; folder: string } | null>(null)
  const [lastMetadataExport, setLastMetadataExport] = useState<MetadataExportOperation | null>(null)
  const [activeTab, setActiveTab] = useState<'library'|'smart'|'metadata'|'history'|'radio'|'bulk'>('library')
  const currentLocal = current && tracks.find(t => t.path === current.path)
  const selectedMetadataTrack = tracks.find(t => t.path === metadataPath)
  const selectedLoudnessTrack = tracks.find(t => t.path === loudnessPath)
  const radioSeed = tracks.find(t => t.path === currentLocal?.path) || tracks[0] || null
  const relatedTracks = useMemo(() => {
    if (!radioSeed) return [] as Array<{track:Track;score:number;reason:string}>
    const clean = (value:string|undefined|null) => (value||'').trim().toLocaleLowerCase()
    return tracks.filter(t=>t.path!==radioSeed.path).map(track=>{
      const reasons:string[]=[]; let score=0
      if(clean(track.artist) && clean(track.artist)===clean(radioSeed.artist)){score+=6;reasons.push('same artist')}
      if(clean(track.genre) && clean(track.genre)===clean(radioSeed.genre)){score+=4;reasons.push('same genre')}
      if(clean(track.album) && clean(track.album)===clean(radioSeed.album)){score+=2;reasons.push('same album')}
      if(track.year && radioSeed.year && Math.abs(track.year-radioSeed.year)<=2){score+=1;reasons.push('nearby year')}
      if(track.duration>0&&radioSeed.duration>0&&Math.abs(track.duration-radioSeed.duration)<=Math.max(20,radioSeed.duration*.18)){score+=.5;reasons.push('similar length')}
      if((track.rating||0)>=4){score+=.25;reasons.push('highly rated')}
      return {track,score,reason:reasons.slice(0,2).join(' · ')||'library pick'}
    }).filter(item=>item.score>=2).sort((a,b)=>b.score-a.score||a.track.title.localeCompare(b.track.title)).slice(0,40)
  },[tracks,radioSeed?.path])
  const smartFieldOptions: Array<[SmartPlaylistRule['field'], string]> = [['title','Title'],['artist','Artist'],['album','Album'],['genre','Genre'],['year','Year'],['rating','Rating'],['playCount','Play count'],['lastPlayed','Last played'],['addedAt','Date added'],['duration','Duration (seconds)'],['favorite','Favourite']]
  const operatorsFor = (field: SmartPlaylistRule['field']): Array<[SmartPlaylistRule['operator'],string]> => {
    if (field === 'favorite') return [['isTrue','is true'],['isFalse','is false']]
    if (['title','artist','album','genre'].includes(field)) return [['contains','contains'],['equals','is'],['notEquals','is not']]
    if (field === 'lastPlayed' || field === 'addedAt') return [['beforeDays','older than (days)'],['greaterThan','after timestamp >'],['lessThan','before timestamp <']]
    return [['greaterThan','greater than'],['lessThan','less than'],['equals','is'],['notEquals','is not']]
  }
  const updateRule = (index:number, patch:Partial<(typeof ruleRows)[number]>) => setRuleRows(old=>old.map((row,i)=>i===index?{...row,...patch}:row))
  const addRule = () => setRuleRows(old=>[...old,{field:'genre',operator:'contains',value:''}])


  const reload = async () => {
    const [h,b,s,lastExport] = await Promise.all([window.myriff.listHistory(120),window.myriff.listBookmarks(),window.myriff.listSmartPlaylists(),window.myriff.getLatestMetadataExport()])
    setHistory(h); setBookmarks(b); setSmartPlaylists(s); setLastMetadataExport(lastExport)
  }
  useEffect(() => { reload().catch(() => undefined) }, [])
  useEffect(() => { if (!tracks.some(t => t.path === metadataPath)) setMetadataPath(tracks[0]?.path || ''); if (!tracks.some(t => t.path === loudnessPath)) setLoudnessPath(tracks[0]?.path || '') }, [tracks])
  useEffect(() => {
    if (!metadataReviewQueue.length) return
    const nextPath = metadataReviewQueue.find(trackPath => tracks.some(track => track.path === trackPath))
    if (nextPath) { setMetadataPath(nextPath); setMetadataResults([]); setActiveTab('metadata') }
  }, [metadataReviewQueue, tracks])

  const scanDuplicates = async () => {
    setWorking('duplicates')
    try { setDuplicates(await window.myriff.findDuplicates()); onNotify('Duplicate analysis completed. Review each group before removing anything from the library index.') }
    catch(e) { onNotify(e instanceof Error ? e.message : 'Duplicate scan failed.') }
    finally { setWorking('') }
  }
  const scanMissing = async () => {
    setWorking('missing')
    try { setMissing(await window.myriff.findMissingTracks()); onNotify('Missing-file check completed.') }
    catch(e) { onNotify(e instanceof Error ? e.message : 'Missing-file check failed.') }
    finally { setWorking('') }
  }
  const removeMissing = async () => {
    if (!missing.length) return
    if (settings.confirmDestructiveActions && !window.confirm(`Remove ${missing.length} missing file references from MyRiff? The original audio files will not be deleted.`)) return
    const count = await window.myriff.removeMissingTracks(missing); setMissing([]); await onRefresh(); await reload(); onNotify(`Removed ${count} missing file references. No audio files were deleted.`)
  }
  const removeIndexItem = async (path: string) => {
    if (settings.confirmDestructiveActions && !window.confirm('Remove this track from MyRiff’s library index? The original audio file will remain untouched.')) return
    await window.myriff.removeTracksFromIndex([path]); await onRefresh(); await reload(); setDuplicates(old=>old.map(g=>({...g,tracks:g.tracks.filter(t=>t.path!==path)})).filter(g=>g.tracks.length>1)); onNotify('Removed from the library index only.')
  }
  const createSmart = async () => {
    if (!smartName.trim()) { onNotify('Name your smart playlist.'); return }
    if (!ruleRows.length) { onNotify('Add at least one rule.'); return }
    const numericFields = ['year','rating','playCount','lastPlayed','addedAt','duration']
    const invalidNumber = ruleRows.find(row => numericFields.includes(row.field) && !Number.isFinite(Number(row.value)))
    if (invalidNumber) { onNotify(`Enter a valid number for ${invalidNumber.field}.`); return }
    const rules: SmartPlaylistRule[] = ruleRows.map(row => {
      const numeric = numericFields.includes(row.field)
      const parsed = row.field === 'favorite' ? row.operator === 'isTrue' : numeric ? Number(row.value) : row.value.trim()
      return { field:row.field, operator:row.operator, value:parsed as string|number|boolean }
    })
    try {
      const playlist = await window.myriff.createSmartPlaylist(smartName.trim(), rules, ruleMatch)
      const latest = await window.myriff.listSmartPlaylists(); setSmartPlaylists(latest); setActiveSmartId(playlist.id); setSmartTracks(await window.myriff.getSmartPlaylistTracks(playlist.id)); onNotify(`Smart playlist “${playlist.name}” created with ${rules.length} rule${rules.length===1?'':'s'}.`)
    } catch(e) { onNotify(e instanceof Error ? e.message : 'Could not create smart playlist.') }
  }

  const loadSmartTracks = async (id: number) => { setActiveSmartId(id); setSmartTracks(await window.myriff.getSmartPlaylistTracks(id)) }
  const getMetadata = useCallback(async () => {
    if (!metadataPath) return
    if (settings.metadataProvider === 'off') {
      setMetadataResults([])
      onNotify('Metadata lookup is disabled in Settings. Choose MusicBrainz to enable online suggestions.')
      return
    }
    setWorking('metadata'); setMetadataResults([])
    try {
      const result = await window.myriff.searchMetadata(metadataPath)
      setMetadataResults(result)
      if (!result.length) onNotify('MusicBrainz did not return suggestions for this track.')
    } catch(e) { onNotify(e instanceof Error ? e.message : 'Metadata lookup failed.') }
    finally { setWorking('') }
  }, [metadataPath, settings.metadataProvider, onNotify])

  useEffect(() => {
    if (activeTab !== 'metadata' || !settings.autoEnrichMetadata || settings.metadataProvider !== 'musicbrainz' || !metadataPath) {
      lastAutoLookupRef.current = ''
      return
    }
    const key = `${metadataPath}|${settings.metadataProvider}`
    if (lastAutoLookupRef.current === key) return
    lastAutoLookupRef.current = key
    void getMetadata()
  }, [activeTab, metadataPath, settings.autoEnrichMetadata, settings.metadataProvider, getMetadata])
  const exportTaggedCopy = async (suggestion: MetadataSuggestion) => {
    if (!metadataPath) return
    try { const result = await window.myriff.exportMetadataCopy(metadataPath, suggestion); if (result) { await onRefresh(); await reload(); onNotify('Metadata-enriched copy exported. The original file was not modified; you can undo the latest export from Bulk tag editor.') } }
    catch(e) { onNotify(e instanceof Error ? e.message : 'Could not export metadata-enriched copy.') }
  }
  const bulkVisibleTracks = useMemo(() => {
    const query = bulkSearch.trim().toLocaleLowerCase()
    return tracks.filter(track => !query || `${track.title} ${track.artist} ${track.album} ${track.path}`.toLocaleLowerCase().includes(query)).slice(0, 500)
  }, [tracks, bulkSearch])
  const runBulkTagExport = async () => {
    if (!bulkSelected.size) { onNotify('Select at least one track to export.'); return }
    const year = bulkYear.trim() ? Number(bulkYear) : undefined
    if (year !== undefined && (!Number.isInteger(year) || year < 1880 || year > 2100)) { onNotify('Release year must be a whole number between 1880 and 2100.'); return }
    setWorking('bulk-tags'); setBulkReport(null)
    try {
      const result = await window.myriff.bulkExportMetadataCopies([...bulkSelected], { artist: bulkArtist.trim() || undefined, album: bulkAlbum.trim() || undefined, year, titleTemplate: bulkTitleTemplate.trim() || undefined })
      if (!result) { onNotify('Bulk tag export cancelled.'); return }
      setBulkReport(result); setBulkSelected(new Set()); await onRefresh(); await reload()
      onNotify(`Exported ${result.successes.length} tagged copies${result.failures.length ? `; ${result.failures.length} failed` : ''}. Original files were not changed.`)
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Bulk tag export failed. Check FFmpeg.') }
    finally { setWorking('') }
  }
  const undoLastMetadataExport = async () => {
    if (!lastMetadataExport) { onNotify('There is no tagged-copy export available to undo.'); return }
    const pending = lastMetadataExport.entries.filter(entry => entry.state === 'pending').length
    if (!pending) { await reload(); onNotify('The latest metadata export has no remaining copies to undo.'); return }
    const prompt = 'Undo "' + lastMetadataExport.description + '"? MyRiff will delete up to ' + pending + ' generated copies only when their output still matches the recorded size, modification time and SHA-256. Changed, missing or unverifiable files will be left untouched. Original source files are never deleted.'
    if (settings.confirmDestructiveActions && !window.confirm(prompt)) return
    setWorking('undo-metadata')
    try {
      const result = await window.myriff.undoLastMetadataExport()
      await onRefresh()
      await reload()
      onNotify('Undo finished: ' + result.removedPaths.length + ' generated copy/copies deleted; ' + result.skipped.length + ' left untouched after safety checks.')
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not undo the last metadata export.') }
    finally { setWorking('') }
  }
  const analyseLoudness = async () => {
    if (!loudnessPath) return
    setWorking('loudness')
    try { const result = await window.myriff.analyseLoudness(loudnessPath); onNotify(`Loudness measured at ${result.inputLufs.toFixed(1)} LUFS. Suggested ReplayGain adjustment: ${result.gainDb >= 0 ? '+' : ''}${result.gainDb.toFixed(1)} dB.`); await onRefresh() }
    catch(e) { onNotify(e instanceof Error ? e.message : 'Loudness analysis failed. Check FFmpeg.') }
    finally { setWorking('') }
  }
  const addBookmark = async () => {
    if (!currentLocal) { onNotify('Play a local library track before adding a bookmark.'); return }
    try { await window.myriff.addBookmark(currentLocal.path, position, bookmarkLabel); setBookmarkLabel(''); await reload(); onNotify('Playback bookmark saved.') }
    catch(e) { onNotify(e instanceof Error ? e.message : 'Could not add bookmark.') }
  }
  const exportBackup = async () => { try { const result = await window.myriff.exportBackup(); if (result) onNotify(`Backup exported to ${result}`) } catch(e) { onNotify(e instanceof Error ? e.message : 'Backup export failed.') } }
  const importBackup = async () => {
    if (settings.confirmDestructiveActions && !window.confirm('Restore a MyRiff backup? Matching local library data, settings and playlists will be merged. Existing tracks will not be deleted.')) return
    try { const result = await window.myriff.importBackup(); if (result) { await onRefresh(); await reload(); onNotify('Backup restored. Restart MyRiff if you imported settings that affect window behaviour.') } } catch(e) { onNotify(e instanceof Error ? e.message : 'Backup restore failed.') }
  }

  return <div className="page-stack power-tools-page">
    <section className="stream-hero power-tools-hero"><div><span className="hero-pill"><Sparkles size={13}/> LIBRARY INTELLIGENCE</span><h2>Know your music.<br/><span>Make it yours.</span></h2><p>Smart playlists, duplicates, metadata suggestions, listening history, bookmarks and portable backups.</p></div><div className="stream-orbit"><WandSparkles size={48}/><span/><i/></div></section>
    <div className="power-tools-tabs">{([['library','Library health'],['smart','Smart playlists'],['metadata','Metadata & audio'],['bulk','Bulk tag editor'],['history','History & bookmarks'],['radio','My Radio']] as const).map(([id,label])=><button key={id} className={activeTab===id?'active':''} onClick={()=>setActiveTab(id)}>{label}</button>)}</div>
    {activeTab==='radio' && <>
      <section className="content-card"><div className="section-heading compact"><div><h2>My Radio</h2><p>Private, offline recommendations based on local artists, genres, albums, years and track lengths. No listening data is sent anywhere.</p></div><Sparkles size={20} color="var(--accent)"/></div>
        {radioSeed ? <><div className="radio-seed"><div className="radio-seed-art">{radioSeed.artworkUrl?<img src={radioSeed.artworkUrl} alt=""/>:<Music2 size={22}/>}</div><div className="radio-seed-info"><small>RADIO STARTING POINT</small><b>{radioSeed.title}</b><span>{radioSeed.artist || 'Unknown artist'} · {radioSeed.genre || 'Genre unknown'}</span></div><button className="primary-button" onClick={()=>onPlay(radioSeed,[radioSeed,...relatedTracks.map(x=>x.track)])}><AudioLines size={15}/> Start local radio</button></div>
        {relatedTracks.length ? <div className="history-list radio-track-list">{relatedTracks.map((item,index)=><button className="history-row radio-track-row" key={item.track.path} onDoubleClick={()=>onPlay(item.track,[item.track,...relatedTracks.slice(index+1).map(x=>x.track)])} onClick={()=>onNotify(`${item.track.title} — ${item.reason}. Double-click a track to start a radio queue from it.`)}><span><b>{item.track.title}</b><small>{item.track.artist || 'Unknown artist'} · {item.track.genre || 'No genre'} · {item.reason}</small></span><span>{formatTime(item.track.duration)}</span></button>)}</div> : <div className="small-empty">Not enough overlapping metadata yet. Add artists and genres to your local tags, then refresh the library.</div>}</> : <div className="small-empty">Scan a music folder to seed your private radio.</div>}
      </section>
    </>}
    {activeTab==='library' && <>
      <section className="content-card"><div className="section-heading compact"><div><h2>Library health</h2><p>These operations update the index only. They never delete original files.</p></div><ShieldAlert size={19} color="var(--accent)"/></div><div className="health-actions"><button className="secondary-button" disabled={working==='duplicates'} onClick={scanDuplicates}>{working==='duplicates'?<LoaderCircle size={15} className="spin"/>:<Copy size={15}/>} Find duplicates</button><button className="secondary-button" disabled={working==='missing'} onClick={scanMissing}>{working==='missing'?<LoaderCircle size={15} className="spin"/>:<Search size={15}/>} Find missing files</button><button className="secondary-button" onClick={async()=>{const p=await window.myriff.exportLibraryCsv();if(p)onNotify(`Library inventory exported to ${p}`)}}><FileSpreadsheet size={15}/> Export library CSV</button></div>
        {duplicates.length>0&&<div className="duplicate-groups">{duplicates.map((group,index)=><div className="duplicate-group" key={`${group.kind}-${group.signature}`}><div className="duplicate-group-head"><b>{group.kind==='identical-file'?'Byte-identical audio':'Likely same recording'}</b><span>{group.tracks.length} files · group {index+1}</span></div>{group.tracks.map(t=><div className="duplicate-track" key={t.path}><div><b>{t.artist?`${t.artist} — `:''}{t.title}</b><small>{t.album||'Unknown album'} · {formatTime(t.duration)} · {t.fileSize?`${(t.fileSize/1048576).toFixed(1)} MB`:'size unknown'}</small><code>{t.path}</code></div><button className="ghost-button danger-text" onClick={()=>removeIndexItem(t.path)}><Trash2 size={14}/> Remove reference</button></div>)}</div>)}</div>}
        {missing.length>0&&<div className="missing-report"><div><b>{missing.length} missing file references</b><span>These indexed paths no longer exist.</span></div><button className="secondary-button" onClick={removeMissing}>Clean missing references</button>{missing.slice(0,50).map(p=><code key={p}>{p}</code>)}</div>}
        {!duplicates.length&&!missing.length&&<p className="footnote">Run a duplicate or missing-file scan to inspect the library. Byte-identical hashing reads each indexed file, so large libraries may take a while.</p>}
      </section>
      <section className="content-card"><div className="section-heading compact"><div><h2>Backup & portability</h2><p>Export playlists, settings, ratings, history, bookmarks and indexed metadata to one JSON backup.</p></div><Archive size={20} color="var(--accent)"/></div><div className="health-actions"><button className="primary-button" onClick={exportBackup}><Archive size={15}/> Export MyRiff backup</button><button className="secondary-button" onClick={importBackup}><UploadIcon/> Restore / merge backup</button></div><p className="footnote">Restore merges backup rows into the current database. It does not copy audio files or guarantee that source paths from another PC exist on this device. Keep a backup before restoring.</p></section>
    </>}
    {activeTab==='smart'&&<>
      <section className="content-card"><div className="section-heading compact"><div><h2>Rule-based playlist builder</h2><p>Smart playlists recalculate from local track metadata and play statistics whenever opened.</p></div><ListMusicIcon/></div><div className="smart-playlist-form multi-rule-form"><label className="smart-name-field"><span>Playlist name</span><input value={smartName} onChange={e=>setSmartName(e.target.value)} placeholder="e.g. Highly rated and forgotten"/></label>{ruleRows.map((row,index)=><div className="smart-rule-row" key={index}><div className="smart-rule-title"><b>Rule {index+1}</b>{ruleRows.length>1&&<button className="ghost-button" onClick={()=>setRuleRows(old=>old.filter((_,i)=>i!==index))}>Remove</button>}</div><label><span>Field</span><select value={row.field} onChange={e=>{const field=e.target.value as SmartPlaylistRule['field'];updateRule(index,{field,operator:field==='favorite'?'isTrue':['title','artist','album','genre'].includes(field)?'contains':'greaterThan',value:field==='favorite'?'true':''})}}>{smartFieldOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label><span>Condition</span><select value={row.operator} onChange={e=>updateRule(index,{operator:e.target.value as SmartPlaylistRule['operator']})}>{operatorsFor(row.field).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>{row.field==='favorite'?<div className="smart-value-note">Matches tracks based on favourite status.</div>:<label><span>Value</span><input value={row.value} onChange={e=>updateRule(index,{value:e.target.value})} placeholder="Value" type={['year','rating','playCount','lastPlayed','addedAt','duration'].includes(row.field)?'number':'text'}/></label>}</div>)}<div className="smart-rule-actions"><button className="secondary-button" onClick={addRule}>+ Add rule</button><label><span>Match rules</span><select value={ruleMatch} onChange={e=>setRuleMatch(e.target.value as 'all'|'any')}><option value="all">All rules (AND)</option><option value="any">Any rule (OR)</option></select></label><button className="primary-button" onClick={createSmart}><Check size={15}/> Create smart playlist</button></div></div><p className="footnote">Rules update against local metadata and play history every time the smart playlist is opened. Use AND for strict combinations or OR for broader mixes.</p></section>
      <section className="content-card"><div className="section-heading compact"><div><h2>Your smart playlists</h2><p>{smartPlaylists.length} saved rule sets</p></div></div>{smartPlaylists.length?<div className="smart-playlist-list">{smartPlaylists.map(p=><div className={`smart-playlist-row ${activeSmartId===p.id?'active':''}`} key={p.id}><button className="smart-playlist-select" onClick={()=>loadSmartTracks(p.id)}><ListMusic size={17}/><span><b>{p.name}</b><small>{p.rules.map(r=>`${r.field} ${r.operator} ${String(r.value)}`).join(` ${p.match.toUpperCase()} `)}</small></span><span>{activeSmartId===p.id?smartTracks.length:'View'}</span></button><button className="icon-button" title="Delete smart playlist" onClick={async()=>{if(confirm(`Delete smart playlist “${p.name}”?`)){await window.myriff.deleteSmartPlaylist(p.id);setSmartPlaylists(await window.myriff.listSmartPlaylists());if(activeSmartId===p.id){setActiveSmartId(null);setSmartTracks([])}}}}><Trash2 size={14}/></button></div>)}</div>:<div className="small-empty">No smart playlists yet.</div>}{activeSmartId!==null&&<div className="smart-preview"><h3>Matching tracks ({smartTracks.length})</h3>{smartTracks.slice(0,100).map(t=><button key={t.path} className="history-row" onDoubleClick={()=>onPlay(t,smartTracks)}><span><b>{t.title}</b><small>{t.artist} · ★ {t.rating||0} · played {t.playCount||0} times</small></span><span>{formatTime(t.duration)}</span></button>)}</div>}</section>
    </>}
    {activeTab==='metadata'&&<>
      <section className="content-card"><div className="section-heading compact"><div><h2>Metadata match suggestions</h2><p>Look up a track in MusicBrainz. Review the result, then export a tagged copy; the original remains untouched.</p></div><Search size={19} color="var(--accent)"/></div>{metadataReviewQueue.length > 0 && <div className="metadata-review-queue"><div className="metadata-review-summary"><div><b>{metadataReviewQueue.length} downloaded track{metadataReviewQueue.length === 1 ? '' : 's'} to review</b><small>Choose a track to fetch confidence-scored matches. MyRiff never rewrites the downloaded original.</small></div>{metadataReviewQueue.includes(metadataPath) && <button className="secondary-button" onClick={() => void onCompleteMetadataReview(metadataPath)}>Mark reviewed / skip</button>}</div><div className="metadata-review-list">{metadataReviewQueue.map(trackPath => { const track = tracks.find(t => t.path === trackPath); return <button key={trackPath} className={trackPath === metadataPath ? 'review-queue-track active' : 'review-queue-track'} title={trackPath} onClick={() => { setMetadataPath(trackPath); setMetadataResults([]); setActiveTab('metadata') }}><span>{track ? [track.artist, track.title].filter(Boolean).join(' — ') : trackPath}</span><small>{track?.album || 'Downloaded track'}</small></button> })}</div></div>}<label className="field-label">Local track<select value={metadataPath} onChange={e=>{setMetadataPath(e.target.value);setMetadataResults([])}}>{tracks.map(t=><option key={t.path} value={t.path}>{t.artist?`${t.artist} — `:''}{t.title}</option>)}</select></label><button className="secondary-button" disabled={!metadataPath||working==='metadata'||settings.metadataProvider==='off'} onClick={getMetadata}>{working==='metadata'?<LoaderCircle size={15} className="spin"/>:<Search size={15}/>} {settings.metadataProvider==='off'?'Metadata provider disabled':'Search MusicBrainz'}</button>{settings.autoEnrichMetadata&&settings.metadataProvider==='musicbrainz'&&<p className="footnote">Automatic suggestions are fetched when this tab opens or the selected track changes. You always review a match before exporting a tagged copy.</p>}{metadataResults.length>0&&<div className="metadata-suggestions">{metadataResults.map((m,i)=><div className="metadata-suggestion" key={`${m.musicBrainzRecordingId}-${i}`}>{m.artworkUrl?<img src={m.artworkUrl} alt="Suggested cover"/>:<div className="metadata-cover"><Music2 size={20}/></div>}<div className="metadata-copy"><b>{m.title}</b><span>{m.artist} · {m.album} {m.year?`· ${m.year}`:''}</span><small>Match confidence: {Math.round(m.confidence*100)}% · {m.provider}</small></div><button className="secondary-button" onClick={()=>exportTaggedCopy(m)}>Export tagged copy</button></div>)}</div>}</section>
      <section className="content-card"><div className="section-heading compact"><div><h2>ReplayGain / loudness analysis</h2><p>Measure integrated loudness and store a per-track gain suggestion. Analysis is non-destructive.</p></div><AudioLinesIcon/></div><label className="field-label">Track<select value={loudnessPath} onChange={e=>setLoudnessPath(e.target.value)}>{tracks.map(t=><option key={t.path} value={t.path}>{t.artist?`${t.artist} — `:''}{t.title}</option>)}</select></label><div className="health-actions"><button className="primary-button" disabled={!loudnessPath||working==='loudness'} onClick={analyseLoudness}>{working==='loudness'?<LoaderCircle size={15} className="spin"/>:<AudioLines size={15}/>} Analyse with FFmpeg</button><span className="muted">Target: {settings.loudnessTargetLufs} LUFS</span></div><p className="footnote">The measured gain is stored per track for future ReplayGain-aware playback; existing audio files are not changed.</p></section>
    </>}
    {activeTab==='bulk'&&<>
      <section className="content-card"><div className="section-heading compact"><div><h2>Bulk metadata export</h2><p>Select multiple tracks and export new tagged copies with shared tag overrides. Blank fields preserve each track’s current metadata.</p></div><FileSpreadsheet size={20} color="var(--accent)"/></div>
        <div className="bulk-tag-fields"><label><span>Artist override</span><input value={bulkArtist} onChange={e=>setBulkArtist(e.target.value)} placeholder="Leave blank to preserve each artist"/></label><label><span>Album override</span><input value={bulkAlbum} onChange={e=>setBulkAlbum(e.target.value)} placeholder="Leave blank to preserve each album"/></label><label><span>Year override</span><input type="number" min={1880} max={2100} value={bulkYear} onChange={e=>setBulkYear(e.target.value)} placeholder="Preserve existing year"/></label><label><span>Title template (optional)</span><input value={bulkTitleTemplate} onChange={e=>setBulkTitleTemplate(e.target.value)} placeholder="e.g. {artist} - {title}"/><small>Tokens: {'{title}'}, {'{artist}'}, {'{album}'}, {'{year}'}</small></label></div>
        <div className="bulk-track-toolbar"><input value={bulkSearch} onChange={e=>setBulkSearch(e.target.value)} placeholder="Filter library tracks…"/><span>{bulkSelected.size} selected · {bulkVisibleTracks.length} matching shown (max 500)</span><button className="secondary-button" onClick={()=>setBulkSelected(old=>{const next=new Set(old); const all=bulkVisibleTracks.every(t=>next.has(t.path)); bulkVisibleTracks.forEach(t=>all?next.delete(t.path):next.add(t.path)); return next})}>{bulkVisibleTracks.length && bulkVisibleTracks.every(t=>bulkSelected.has(t.path))?'Deselect visible':'Select visible'}</button></div>
        <div className="bulk-track-list">{bulkVisibleTracks.map(track=><label className="bulk-track-row" key={track.path}><input type="checkbox" checked={bulkSelected.has(track.path)} onChange={event=>setBulkSelected(old=>{const next=new Set(old); if(event.target.checked)next.add(track.path);else next.delete(track.path);return next})}/><span><b>{track.title}</b><small>{track.artist || 'Unknown artist'} · {track.album || 'Unknown album'}</small><code>{track.path}</code></span></label>)}</div>
        <div className="health-actions"><button className="primary-button" disabled={!bulkSelected.size||working==='bulk-tags'} onClick={runBulkTagExport}>{working==='bulk-tags'?<LoaderCircle size={15} className="spin"/>:<FileSpreadsheet size={15}/>} Export {bulkSelected.size} tagged copies</button><span className="muted">FFmpeg required · source files are never overwritten</span></div>
        {lastMetadataExport&&<div className="metadata-undo-card"><div><b>Latest generated-copy export</b><small>{lastMetadataExport.description} · {lastMetadataExport.entries.filter(entry=>entry.state==='pending').length} file(s) eligible for verification · {new Date(lastMetadataExport.createdAt).toLocaleString()}</small><small>Undo deletes only unchanged generated copies and removes their MyRiff library references. Original source files remain untouched.</small></div><button className="secondary-button" disabled={working==='undo-metadata'||!lastMetadataExport.entries.some(entry=>entry.state==='pending')} onClick={undoLastMetadataExport}>{working==='undo-metadata'?<LoaderCircle size={15} className="spin"/>:<Archive size={15}/>} Undo last export</button></div>}
        {bulkReport&&<div className="import-report"><CheckCircle2 size={18}/><div><b>{bulkReport.successes.length} copies exported to {bulkReport.folder}</b><span>{bulkReport.failures.length?`${bulkReport.failures.length} files failed; expand to inspect.`:'All selected tracks were exported.'}</span>{bulkReport.failures.length>0&&<details><summary>View failures</summary><div className="missing-list">{bulkReport.failures.map((failure,i)=><span key={`${failure.path}-${i}`}>{failure.path}: {failure.error}</span>)}</div></details>}</div></div>}
        <p className="footnote">MyRiff writes new copies with FFmpeg stream-copy metadata edits, then indexes the output folder. Existing files are not overwritten. Some container/codec combinations may reject tag updates; failures are reported per track.</p>
      </section>
    </>}
    {activeTab==='history'&&<>
      <section className="content-card"><div className="section-heading compact"><div><h2>Listening history</h2><p>{history.length} recent play events stored locally.</p></div><Clock3 size={20} color="var(--accent)"/></div><div className="health-actions"><button className="secondary-button" onClick={async()=>{if(confirm('Clear all local listening history?')){await window.myriff.clearHistory();await reload();onNotify('Listening history cleared.')}}}><Trash2 size={14}/> Clear history</button></div>{history.length?<div className="history-list">{history.map(item=>{const track=tracks.find(t=>t.path===item.trackPath);return <button className="history-row" key={item.id} disabled={!track} onClick={()=>track&&onPlay(track,tracks)}><span><b>{item.title}</b><small>{item.artist||'Unknown artist'} · {item.source}</small></span><time>{new Date(item.playedAt).toLocaleString()}</time></button>})}</div>:<div className="small-empty">Nothing in history yet. Play a few tracks to populate it.</div>}</section>
      <section className="content-card"><div className="section-heading compact"><div><h2>Playback bookmarks</h2><p>Save moments inside local tracks and jump back to them later.</p></div><Bookmark size={20} color="var(--accent)"/></div>{currentLocal?<div className="bookmark-now"><div><b>{currentLocal.title}</b><small>{currentLocal.artist} · current position {formatTime(position)}</small></div><input value={bookmarkLabel} onChange={e=>setBookmarkLabel(e.target.value)} placeholder="Bookmark label (optional)"/><button className="primary-button" onClick={addBookmark}><Bookmark size={15}/> Bookmark now</button></div>:<div className="small-empty">Play a local track to add a bookmark.</div>}{bookmarks.length?<div className="bookmark-list">{bookmarks.map(b=>{const track=tracks.find(t=>t.path===b.trackPath);return <div className="bookmark-row" key={b.id}><button onClick={()=>{if(track){onPlay(track,tracks);window.setTimeout(()=>onSeek(b.position),180)}}}><span><b>{b.label}</b><small>{track?.artist?`${track.artist} — `:''}{track?.title||'Missing track'}</small></span><time>{formatTime(b.position)}</time></button><button className="icon-button" onClick={async()=>{await window.myriff.deleteBookmark(b.id);await reload()}} title="Delete bookmark"><Trash2 size={14}/></button></div>})}</div>:null}</section>
    </>}
  </div>
}
function UploadIcon(){return <span aria-hidden="true">↥</span>}
function ListMusicIcon(){return <span className="section-icon">♫</span>}
function AudioLinesIcon(){return <span className="section-icon">≋</span>}
