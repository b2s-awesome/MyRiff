import { Disc3, Play, Plus, ListMusic, CornerUpRight, Heart, Star } from 'lucide-react'
import type { Track } from '../../../shared/types'

function durationLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

export default function TrackGrid({ tracks, view, onPlay, onQueue, onPlaylist, onPlayNext, selectedPath, onFavorite, onRate, showYear = true, showGenre = true, showTrackNumbers = true }: {
  tracks: Track[]; view: 'grid'|'list'; onPlay: (track: Track) => void; onQueue: (track: Track) => void;
  onPlaylist?: (track: Track) => void; onPlayNext?: (track: Track) => void; selectedPath?: string | null; onFavorite?: (track: Track) => void; onRate?: (track: Track) => void; showYear?: boolean; showGenre?: boolean; showTrackNumbers?: boolean
}) {
  if (!tracks.length) return <div className="empty-state"><Disc3 size={34}/><strong>No tracks found</strong><span>Try another search or scan a music folder.</span></div>
  if (view === 'list') return <div className="track-table">
    <div className="track-table-head"><span>Title</span><span>Album</span><span>Genre</span><span>Time</span><span /></div>
    {tracks.map((track, i) => <div key={track.path || `${track.title}-${i}`} className={`track-row ${selectedPath === track.path ? 'selected' : ''}`} onDoubleClick={() => onPlay(track)}>
      <div className="track-title-cell"><div className="row-cover">{track.artworkUrl ? <img src={track.artworkUrl} /> : <Disc3 size={17}/>}</div><div className="track-labels"><b>{track.title}</b><small>{track.artist || 'Unknown artist'}</small></div></div>
      <span className="muted truncate">{track.album || 'Unknown album'}{showYear && track.year ? ` · ${track.year}` : ''}</span><span className="muted truncate">{showGenre ? (track.genre || '—') : ''}</span><span className="muted mono">{durationLabel(track.duration)}</span>
      <div className="row-actions"><button title="Play" onClick={() => onPlay(track)}><Play size={15}/></button><button title="Add to queue" onClick={() => onQueue(track)}><Plus size={16}/></button>{onPlayNext && <button title="Play next" onClick={() => onPlayNext(track)}><CornerUpRight size={15}/></button>}{onPlaylist && <button title="Add to playlist" onClick={() => onPlaylist(track)}><ListMusic size={16}/></button>}{onFavorite && <button title={track.favorite ? 'Remove favourite' : 'Add favourite'} className={track.favorite ? 'is-favorite' : ''} onClick={() => onFavorite(track)}><Heart size={15} fill={track.favorite ? 'currentColor' : 'none'}/></button>}{onRate && <button title={`Rating: ${track.rating || 0}/5. Click to cycle rating`} className={track.rating ? 'is-rated' : ''} onClick={() => onRate(track)}><Star size={15} fill={track.rating ? 'currentColor' : 'none'}/><span className="rating-count">{track.rating || 0}</span></button>}</div>
    </div>)}
  </div>
  return <div className="track-grid">{tracks.map((track, i) => <article key={track.path || `${track.title}-${i}`} className={`track-card ${selectedPath === track.path ? 'selected' : ''}`}>
    <button className="cover-button" onClick={() => onPlay(track)} title={`Play ${track.title}`}>
      {track.artworkUrl ? <img className="cover" src={track.artworkUrl} loading="lazy" /> : <div className="cover cover-placeholder"><Disc3 size={42}/></div>}
      <span className="cover-play"><Play size={22} fill="currentColor"/></span>
    </button>
    <div className="card-meta"><div className="card-title" title={track.title}>{track.title}</div><div className="card-subtitle" title={track.artist}>{track.artist || 'Unknown artist'}</div><div className="card-bottom"><span>{track.album || 'Single'}{showYear && track.year ? ` · ${track.year}` : ''}</span><div className="row-actions"><button onClick={() => onQueue(track)} title="Add to queue"><Plus size={15}/></button>{onPlayNext && <button onClick={() => onPlayNext(track)} title="Play next"><CornerUpRight size={15}/></button>}{onPlaylist && <button onClick={() => onPlaylist(track)} title="Add to playlist"><ListMusic size={15}/></button>}{onFavorite && <button title={track.favorite ? 'Remove favourite' : 'Add favourite'} className={track.favorite ? 'is-favorite' : ''} onClick={() => onFavorite(track)}><Heart size={14} fill={track.favorite ? 'currentColor' : 'none'}/></button>}{onRate && <button title={`Rating: ${track.rating || 0}/5. Click to cycle rating`} className={track.rating ? 'is-rated' : ''} onClick={() => onRate(track)}><Star size={14} fill={track.rating ? 'currentColor' : 'none'}/></button>}</div></div></div>
  </article>)}</div>
}
