import { useMemo, useState } from 'react'
import { AudioLines, Disc3, Play, Radio, Shuffle, Sparkles } from 'lucide-react'
import type { Track } from '../../shared/types'

type Mode = 'balanced' | 'artist' | 'genre' | 'album'
export default function LocalRadio({ tracks, current, onPlay }: { tracks: Track[]; current: Track | null; onPlay: (track: Track, context: Track[]) => void }) {
  const [seedPath, setSeedPath] = useState(current?.path || tracks[0]?.path || '')
  const [mode, setMode] = useState<Mode>('balanced')
  const [includeSeed, setIncludeSeed] = useState(false)
  const seed = tracks.find(track => track.path === seedPath) || current || null
  const recommendations = useMemo(() => {
    if (!seed) return []
    const candidates = tracks.filter(track => track.path !== seed.path)
    const score = (track: Track) => {
      let points = 0
      if (track.artist && seed.artist && track.artist.toLocaleLowerCase() === seed.artist.toLocaleLowerCase()) points += mode === 'genre' ? 2 : 6
      if (track.genre && seed.genre && track.genre.toLocaleLowerCase() === seed.genre.toLocaleLowerCase()) points += mode === 'artist' ? 2 : 5
      if (track.album && seed.album && track.album.toLocaleLowerCase() === seed.album.toLocaleLowerCase()) points += mode === 'balanced' ? 2 : mode === 'album' ? 8 : 0
      if (track.year && seed.year) points += Math.max(0, 2 - Math.floor(Math.abs(track.year - seed.year) / 5))
      if (track.rating) points += Math.min(5, track.rating) * 0.35
      if (track.favorite) points += 1.5
      if (track.path.split(/[\\/]/).slice(-2, -1)[0] === seed.path.split(/[\\/]/).slice(-2, -1)[0]) points += 0.5
      return points
    }
    return candidates.map(track => ({ track, score: score(track) + Math.random() * 1.25 })).sort((a,b) => b.score - a.score).slice(0, 40).map(item => item.track)
  }, [tracks, seed?.path, seed?.artist, seed?.genre, seed?.album, seed?.year, mode])
  const radioTracks = includeSeed && seed ? [seed, ...recommendations] : recommendations
  return <div className="page-stack local-radio-page">
    <section className="stream-hero"><div><span className="hero-pill"><Radio size={13}/> LOCAL DISCOVERY</span><h2>Start with one track.<br/><span>Find your next favourite.</span></h2><p>Build a radio-style listening queue from your own library. Matching is local and uses artist, genre, album, year, favourites and ratings—no external profile or account.</p></div><div className="stream-orbit"><AudioLines size={48}/><span/><i/></div></section>
    <section className="content-card"><div className="section-heading compact"><div><h2>Build a local radio</h2><p>Results are generated from the tracks indexed on this device.</p></div><Sparkles size={20} color="var(--accent)"/></div>
      {tracks.length ? <><label className="field-label">Start from a track<select value={seed?.path || ''} onChange={e => setSeedPath(e.target.value)}>{tracks.map(track => <option value={track.path} key={track.path}>{track.artist ? `${track.artist} — ` : ''}{track.title}</option>)}</select></label><div className="settings-form-grid"><label><span>Matching style</span><select value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="balanced">Balanced mix</option><option value="artist">Artist-focused</option><option value="genre">Genre-focused</option><option value="album">Album-focused</option></select></label><label className="radio-check"><input type="checkbox" checked={includeSeed} onChange={e => setIncludeSeed(e.target.checked)}/><span>Include starting track in radio queue</span></label></div><div className="inline-actions"><button className="primary-button" disabled={!radioTracks.length} onClick={() => radioTracks.length && onPlay(radioTracks[0], radioTracks)}><Play size={15} fill="currentColor"/> Play local radio</button><button className="secondary-button" onClick={() => { setMode('balanced'); setIncludeSeed(false); setSeedPath(current?.path || tracks[0]?.path || '') }}><Shuffle size={15}/> Reset mix</button><span className="muted">{radioTracks.length} tracks in this mix</span></div></> : <div className="small-empty">Scan a music folder to build local radio from your collection.</div>}
    </section>
    {seed && <section className="content-card"><div className="section-heading compact"><div><h2>Because you started with</h2><p>{seed.artist || 'Unknown artist'} · {seed.album || 'Unknown album'}{seed.genre ? ` · ${seed.genre}` : ''}</p></div></div><div className="radio-seed-row"><div className="radio-seed-art">{seed.artworkUrl ? <img src={seed.artworkUrl} alt=""/> : <Disc3 size={28}/>}</div><div><b>{seed.title}</b><small>{seed.artist || 'Unknown artist'}</small></div></div><div className="radio-recommendations">{recommendations.map((track,index)=><button className="radio-track-row" key={track.path} onDoubleClick={() => onPlay(track, radioTracks)} onClick={() => setSeedPath(track.path)}><span className="remote-number">{String(index+1).padStart(2,'0')}</span><span className="radio-track-art">{track.artworkUrl ? <img src={track.artworkUrl} alt=""/> : <Disc3 size={16}/>}</span><span className="radio-track-meta"><b>{track.title}</b><small>{track.artist || 'Unknown artist'} · {track.album || 'Unknown album'}</small></span><span className="radio-track-genre">{track.genre || 'Unclassified'}</span><span className="radio-track-duration">{Math.floor(track.duration/60)}:{String(Math.floor(track.duration%60)).padStart(2,'0')}</span></button>)}</div><p className="footnote">This is an explainable local similarity heuristic, not an AI or acoustic-fingerprint model. Duplicate detection and audio similarity can be added independently.</p></section>}
  </div>
}
