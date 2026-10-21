import { useMemo, useState } from 'react'
import { AudioLines, Disc3, Play, Radio, Shuffle, Sparkles, WandSparkles } from 'lucide-react'
import type { AcousticSimilarityReport, Track } from '../../../shared/types'

type Mode = 'balanced' | 'artist' | 'genre' | 'album'
type RankedTrack = { track: Track; score: number; reason: string; acoustic?: number }

function stableTieBreak(path: string) {
  let hash = 2166136261
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}

export default function LocalRadio({ tracks, current, onPlay }: {
  tracks: Track[]
  current: Track | null
  onPlay: (track: Track, context: Track[]) => void
}) {
  const [seedPath, setSeedPath] = useState(current?.path || tracks[0]?.path || '')
  const [mode, setMode] = useState<Mode>('balanced')
  const [acousticReport, setAcousticReport] = useState<AcousticSimilarityReport | null>(null)
  const [acousticRanking, setAcousticRanking] = useState(false)
  const [acousticBusy, setAcousticBusy] = useState(false)
  const [acousticStatus, setAcousticStatus] = useState('')

  const seed = tracks.find(track => track.path === seedPath) || current || null
  const seedIsLocal = Boolean(seed && tracks.some(track => track.path === seed.path))
  const acousticScores = useMemo(() => {
    if (!acousticReport || acousticReport.seedPath !== seed?.path) return new Map<string, number>()
    return new Map(acousticReport.results.map(result => [result.path, result.similarity]))
  }, [acousticReport, seed?.path])

  const recommendations = useMemo<RankedTrack[]>(() => {
    if (!seed) return []
    const clean = (value: string | null | undefined) => String(value || '').trim().toLocaleLowerCase()
    const seedArtist = clean(seed.artist)
    const seedGenre = clean(seed.genre)
    const seedAlbum = clean(seed.album)
    const pool = tracks.filter(track => track.path !== seed.path).map(track => {
      const artistMatch = Boolean(seedArtist && clean(track.artist) === seedArtist)
      const genreMatch = Boolean(seedGenre && clean(track.genre) === seedGenre)
      const albumMatch = Boolean(seedAlbum && clean(track.album) === seedAlbum)
      const yearNear = Boolean(seed.year && track.year && Math.abs(seed.year - track.year) <= 2)
      const durationNear = track.duration > 0 && seed.duration > 0 && Math.abs(track.duration - seed.duration) <= Math.max(20, seed.duration * 0.18)
      const reasons: string[] = []
      let score = 0
      if (artistMatch) { score += 4; reasons.push('same artist') }
      if (genreMatch) { score += 3; reasons.push('same genre') }
      if (albumMatch) { score += 2; reasons.push('same album') }
      if (yearNear) { score += 1; if (reasons.length < 2) reasons.push('nearby release year') }
      if (durationNear) { score += 0.5; if (reasons.length < 2) reasons.push('similar length') }
      if ((track.rating || 0) >= 4) score += 0.25
      if (mode === 'artist' && artistMatch) score += 8
      if (mode === 'genre' && genreMatch) score += 8
      if (mode === 'album' && albumMatch) score += 8
      return { track, score, reason: reasons.slice(0, 2).join(' · ') || 'library discovery', acoustic: acousticScores.get(track.path) }
    }).filter(item => item.score >= 1.5 || (acousticRanking && item.acoustic !== undefined))

    return pool.sort((a, b) => {
      if (acousticRanking) {
        const aAcoustic = a.acoustic ?? -1
        const bAcoustic = b.acoustic ?? -1
        if (aAcoustic !== bAcoustic) return bAcoustic - aAcoustic
      }
      return b.score - a.score || stableTieBreak(a.track.path) - stableTieBreak(b.track.path) || a.track.title.localeCompare(b.track.title)
    }).slice(0, 40)
  }, [tracks, seed, mode, acousticScores, acousticRanking])

  const resetAudioMatches = () => {
    setAcousticReport(null)
    setAcousticRanking(false)
    setAcousticStatus('')
  }

  const analyseAudio = async () => {
    if (!seed || !seedIsLocal) {
      setAcousticStatus('Choose a track from your local library to analyse its audio.')
      return
    }
    const candidates = recommendations.slice(0, 24).map(item => item.track.path).filter(trackPath => trackPath !== seed.path)
    if (!candidates.length) {
      setAcousticStatus('There are no matching local candidates to analyse yet. Scan more music into your library.')
      return
    }
    setAcousticBusy(true)
    setAcousticStatus('Analysing local audio with FFmpeg. First-time analysis is cached on this device.')
    try {
      const report = await window.myriff.analyseAcousticSimilarity(seed.path, candidates)
      setAcousticReport(report)
      setAcousticRanking(true)
      setAcousticStatus(`Compared ${report.compared} tracks; reused ${report.cached} cached profiles and skipped ${report.skipped}. Similarity compares short spectral/chroma summaries, not song identity.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not analyse local audio.'
      setAcousticStatus(message)
    } finally {
      setAcousticBusy(false)
    }
  }

  const queue = recommendations.map(item => item.track)
  const playRadio = () => { if (seed && queue.length) onPlay(queue[0], queue) }
  const shuffleRadio = () => {
    if (!queue.length) return
    const randomIndex = Math.floor(Math.random() * queue.length)
    onPlay(queue[randomIndex], [...queue.slice(randomIndex), ...queue.slice(0, randomIndex)])
  }

  return <section className="local-radio-page">
    <div className="local-radio-hero">
      <div className="local-radio-hero-icon"><Radio size={24}/></div>
      <div className="local-radio-hero-copy">
        <span className="eyebrow">PERSONAL DISCOVERY</span>
        <h2>Local Radio</h2>
        <p>Build a station from music you already have. Start with metadata-based matching, then optionally refine it using local audio analysis.</p>
      </div>
      <div className="local-radio-hero-actions">
        <button className="primary-button" disabled={!queue.length} onClick={playRadio}><Play size={15}/> Play radio</button>
        <button className="secondary-button" disabled={!queue.length} onClick={shuffleRadio}><Shuffle size={15}/> Shuffle</button>
      </div>
    </div>

    <div className="local-radio-controls">
      <label><span>Start from</span><select value={seed?.path || ''} onChange={event => { setSeedPath(event.target.value); resetAudioMatches() }}><option value="">Choose a local track…</option>{tracks.map(track => <option key={track.path} value={track.path}>{track.artist ? `${track.artist} — ` : ''}${track.title}</option>)}</select></label>
      <label><span>Metadata matching</span><select value={mode} onChange={event => { setMode(event.target.value as Mode); resetAudioMatches() }}><option value="balanced">Balanced</option><option value="artist">Prioritise artist</option><option value="genre">Prioritise genre</option><option value="album">Prioritise album</option></select></label>
      <button className="secondary-button radio-acoustic-button" onClick={() => void analyseAudio()} disabled={!seedIsLocal || !recommendations.length || acousticBusy}><AudioLines size={15}/>{acousticBusy ? 'Analysing…' : 'Rank by audio similarity'}</button>
    </div>

    <div className="local-radio-privacy"><WandSparkles size={15}/><span>Audio analysis is optional and local-only. FFmpeg decodes up to 24 seconds; MyRiff stores a compact spectral profile in its local database. No audio is uploaded.</span></div>
    {acousticStatus && <p className="local-radio-status" role="status" aria-live="polite">{acousticStatus}</p>}

    {!seed && <div className="empty-state"><Disc3 size={32}/><b>Your radio starts with a track</b><p>Scan a local music folder, then choose a track above.</p></div>}
    {seed && <div className="local-radio-seed"><div className="local-radio-seed-disc"><Disc3 size={18}/></div><div><small>STATION SEED</small><b>{seed.title}</b><span>{seed.artist || 'Unknown artist'}{seed.genre ? ` · ${seed.genre}` : ''}</span></div><span className="local-radio-count">{recommendations.length} tracks</span></div>}

    <div className="local-radio-list">
      {recommendations.map((item, index) => <article className="local-radio-track" key={item.track.path}>
        <span className="local-radio-track-number">{String(index + 1).padStart(2, '0')}</span>
        <div className="local-radio-track-art">{item.track.artworkUrl ? <img src={item.track.artworkUrl} alt="" loading="lazy"/> : <Disc3 size={19}/>}</div>
        <div className="local-radio-track-info"><b>{item.track.title}</b><span>{item.track.artist || 'Unknown artist'}{item.track.album ? ` · ${item.track.album}` : ''}</span><small>{item.reason}</small></div>
        {item.acoustic !== undefined && <span className="local-radio-similarity" title="Spectral/chroma similarity score">{item.acoustic.toFixed(0)}% audio</span>}
        <button className="icon-button local-radio-play" title={`Play ${item.track.title}`} aria-label={`Play ${item.track.title}`} onClick={() => onPlay(item.track, queue)}><Play size={16}/></button>
      </article>)}
    </div>
    {seed && !recommendations.length && <div className="empty-state"><Sparkles size={28}/><b>Not enough matching tracks yet</b><p>Add more tracks with tags in common, or scan another local folder to expand discovery.</p></div>}
  </section>
}
