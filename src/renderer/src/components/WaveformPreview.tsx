import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AudioLines, LoaderCircle, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'

type Range = { start: number; end: number }

export default function WaveformPreview({ trackPath, duration, start, end, onSeek, onRangeChange }: {
  trackPath: string
  duration: number
  start: number
  end: number
  onSeek?: (time: number) => void
  onRangeChange?: (start: number, end: number) => void
}) {
  const [samples, setSamples] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragRange, setDragRange] = useState<Range | null>(null)
  const [zoom, setZoom] = useState(1)
  const [viewOffset, setViewOffset] = useState(0)
  const dragAnchor = useRef<number | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    let cancelled = false
    setBusy(true); setError(''); setSamples([]); setDragRange(null); setZoom(1); setViewOffset(0)
    window.myriff.getWaveform(trackPath, 1200).then(values => { if (!cancelled) setSamples(values) }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Waveform unavailable') }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [trackPath])

  const visibleCount = Math.max(40, Math.ceil(samples.length / zoom))
  const maxOffset = Math.max(0, samples.length - visibleCount)
  const startIndex = Math.round(viewOffset * maxOffset)
  const visibleSamples = useMemo(() => samples.slice(startIndex, startIndex + visibleCount), [samples, startIndex, visibleCount])
  const visibleStartTime = samples.length ? startIndex / samples.length * duration : 0
  const visibleDuration = samples.length ? visibleSamples.length / samples.length * duration : duration

  const timeAt = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const raw = visibleStartTime + fraction * Math.max(0, visibleDuration)
    return Math.max(0, Math.min(duration, Math.round(raw * 10) / 10))
  }
  const beginRange = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onRangeChange || !duration || event.button !== 0) return
    const time = timeAt(event.clientX, event.currentTarget)
    dragAnchor.current = time
    setDragRange({ start: time, end: time })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveRange = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragAnchor.current === null) return
    const time = timeAt(event.clientX, event.currentTarget)
    setDragRange({ start: Math.min(dragAnchor.current, time), end: Math.max(dragAnchor.current, time) })
  }
  const finishRange = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragAnchor.current === null) return
    const anchor = dragAnchor.current
    const finish = timeAt(event.clientX, event.currentTarget)
    dragAnchor.current = null
    if (Math.abs(finish - anchor) >= 0.2 && onRangeChange) {
      const next = { start: Math.min(anchor, finish), end: Math.max(anchor, finish) }
      setDragRange(null)
      suppressClick.current = true
      onRangeChange(next.start, next.end)
    } else setDragRange(null)
  }
  const visibleStart = dragRange?.start ?? start
  const visibleEnd = dragRange?.end ?? end

  return <div className="waveform-preview" role="group" aria-label="Audio waveform preview">
    {samples.length > 0 && !busy && <div className="waveform-toolbar">
      <span>{zoom.toFixed(zoom % 1 ? 1 : 0)}× zoom</span>
      <div className="waveform-zoom-buttons">
        <button className="icon-button" type="button" title="Zoom out" aria-label="Zoom out waveform" disabled={zoom <= 1} onClick={() => { setZoom(z => Math.max(1, z / 2)); setViewOffset(o => Math.min(1, o)) }}><ZoomOut size={14}/></button>
        <button className="icon-button" type="button" title="Zoom in" aria-label="Zoom in waveform" disabled={zoom >= 16} onClick={() => setZoom(z => Math.min(16, z * 2))}><ZoomIn size={14}/></button>
        <button className="icon-button" type="button" title="Reset waveform view" aria-label="Reset waveform zoom" disabled={zoom === 1 && viewOffset === 0} onClick={() => { setZoom(1); setViewOffset(0) }}><RotateCcw size={13}/></button>
      </div>
      <label className="waveform-pan" title="Pan across the zoomed waveform"><span>Pan</span><input type="range" min="0" max="1000" value={Math.round(viewOffset * 1000)} disabled={zoom === 1} onChange={e => setViewOffset(Number(e.target.value) / 1000)} aria-label="Pan waveform view"/></label>
    </div>}
    {busy ? <div className="waveform-status"><LoaderCircle size={16} className="spin"/> Analysing waveform…</div> : samples.length ? <div className={`waveform-samples ${onRangeChange ? 'range-enabled' : ''}`} onPointerDown={beginRange} onPointerMove={moveRange} onPointerUp={finishRange} onPointerCancel={() => { dragAnchor.current = null; setDragRange(null) }} onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}>
      {visibleSamples.map((value, i) => {
        const globalIndex = startIndex + i
        const time = globalIndex / Math.max(1, samples.length - 1) * duration
        const selected = time >= visibleStart && time <= visibleEnd
        return <button key={globalIndex} type="button" title={`${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2,'0')}`} onClick={() => onSeek?.(time)} style={{ height: `${Math.max(5, value * 100)}%`, opacity: selected ? 1 : .3 }} aria-label={`Seek to ${time.toFixed(1)} seconds`} />
      })}
    </div> : <div className="waveform-status"><AudioLines size={16}/>{error || 'Waveform not available'}</div>}
    {onRangeChange && !busy && samples.length > 0 && <div className="waveform-hint">Drag across the waveform to select a trim range · snaps to 0.1 s. Zoom and pan for precise edits.</div>}
  </div>
}
