import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AudioLines, LoaderCircle } from 'lucide-react'

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
  const dragAnchor = useRef<number | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => {
    let cancelled = false
    setBusy(true); setError(''); setSamples([]); setDragRange(null)
    window.myriff.getWaveform(trackPath, 640).then(values => { if (!cancelled) setSamples(values) }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Waveform unavailable') }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [trackPath])

  const timeAt = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const raw = fraction * Math.max(0, duration)
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
    const distance = Math.abs(finish - anchor)
    if (distance >= 0.2 && onRangeChange) {
      const next = { start: Math.min(anchor, finish), end: Math.max(anchor, finish) }
      setDragRange(null)
      suppressClick.current = true
      onRangeChange(next.start, next.end)
    } else {
      setDragRange(null)
    }
  }
  const visibleStart = dragRange?.start ?? start
  const visibleEnd = dragRange?.end ?? end

  return <div className="waveform-preview" role="group" aria-label="Audio waveform preview">
    {busy ? <div className="waveform-status"><LoaderCircle size={16} className="spin"/> Analysing waveform…</div> : samples.length ? <div className={`waveform-samples ${onRangeChange ? 'range-enabled' : ''}`} onPointerDown={beginRange} onPointerMove={moveRange} onPointerUp={finishRange} onPointerCancel={() => { dragAnchor.current = null; setDragRange(null) }} onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}>
      {samples.map((value, i) => {
        const time = i / Math.max(1, samples.length - 1) * duration
        const selected = time >= visibleStart && time <= visibleEnd
        return <button key={i} type="button" title={`${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2,'0')}`} onClick={() => onSeek?.(time)} style={{ height: `${Math.max(5, value * 100)}%`, opacity: selected ? 1 : .3 }} aria-label={`Seek to ${time.toFixed(1)} seconds`} />
      })}
    </div> : <div className="waveform-status"><AudioLines size={16}/>{error || 'Waveform not available'}</div>}
    {onRangeChange && !busy && samples.length > 0 && <div className="waveform-hint">Drag across the waveform to select a trim range · snaps to 0.1 s</div>}
  </div>
}
