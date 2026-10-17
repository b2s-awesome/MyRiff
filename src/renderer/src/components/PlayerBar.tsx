import { ListMusic, Maximize2, Minimize2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { Track, RepeatMode } from '../../../shared/types'

const time = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`
export default function PlayerBar({ track, playing, position, duration, volume, shuffle, repeat, mini, queueOpen, onToggle, onNext, onPrevious, onSeek, onVolume, onShuffle, onRepeat, onQueue, onMini }: {
  track: (Track & { streamSource?: string }) | null; playing: boolean; position: number; duration: number; volume: number; shuffle: boolean; repeat: RepeatMode; mini: boolean; queueOpen: boolean;
  onToggle: () => void; onNext: () => void; onPrevious: () => void; onSeek: (n: number) => void; onVolume: (n: number) => void;
  onShuffle: () => void; onRepeat: () => void; onQueue: () => void; onMini: () => void
}) {
  return <footer className={`player-bar ${mini ? 'player-mini' : ''}`}>
    <div className="player-track">
      {track?.artworkUrl ? <img className="player-cover" src={track.artworkUrl}/> : <div className="player-cover no-art"><DiscIcon/></div>}
      <div className="player-track-text"><b title={track?.title}>{track?.title || 'Choose something to play'}</b><small title={track?.artist}>{track?.artist || 'Your music, your way'}{track?.streamSource ? <span className="player-source-badge"> · {track.streamSource}</span> : ''}</small></div>
    </div>
    <div className="player-center">
      <div className="player-buttons">
        <button className={shuffle ? 'active' : ''} title="Shuffle" onClick={onShuffle}><Shuffle size={17}/></button>
        <button title="Previous" onClick={onPrevious}><SkipBack size={19} fill="currentColor"/></button>
        <button className="play-button" title={playing ? 'Pause' : 'Play'} onClick={onToggle}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button>
        <button title="Next" onClick={onNext}><SkipForward size={19} fill="currentColor"/></button>
        <button className={repeat !== 'off' ? 'active' : ''} title={`Repeat: ${repeat}`} onClick={onRepeat}>{repeat === 'one' ? <Repeat1 size={17}/> : <Repeat size={17}/>}</button>
      </div>
      <div className="seek-row"><span className="time-text">{time(position)}</span><input aria-label="Seek" type="range" min={0} max={Math.max(duration, 1)} value={Math.min(position, duration || 0)} onChange={e => onSeek(Number(e.target.value))}/><span className="time-text">{time(duration)}</span></div>
    </div>
    {!mini && <div className="player-right"><button title="Queue" className={queueOpen ? 'active' : ''} onClick={onQueue}><ListMusic size={18}/></button><div className="volume-box"><button title={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => onVolume(volume === 0 ? 0.75 : 0)}>{volume === 0 ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button><input aria-label="Volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={e => onVolume(Number(e.target.value))}/></div><button title="Mini player" onClick={onMini}><Minimize2 size={17}/></button></div>}
    {mini && <button title="Expand MyRiff" className="mini-expand" onClick={onMini}><Maximize2 size={17}/></button>}
  </footer>
}
function DiscIcon() { return <span className="disc-glyph">♫</span> }
