import { useEffect, useRef } from 'react'
import type { VisualizerStyle } from '../../../shared/types'

export default function Visualizer({ analyser, style = 'bars', sensitivity = 1, active = true }: { analyser: AnalyserNode | null; style?: VisualizerStyle; sensitivity?: number; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let raf = 0
    const bins = new Uint8Array(analyser?.frequencyBinCount ?? 128)
    const paint = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      if (canvas.width !== Math.floor(rect.width * ratio) || canvas.height !== Math.floor(rect.height * ratio)) {
        canvas.width = Math.max(1, Math.floor(rect.width * ratio)); canvas.height = Math.max(1, Math.floor(rect.height * ratio))
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const w = rect.width; const h = rect.height
      context.clearRect(0, 0, w, h)
      if (analyser && active) analyser.getByteFrequencyData(bins)
      else bins.fill(0)
      const value = (i: number) => Math.min(1, (bins[Math.min(bins.length - 1, i)] || 0) / 255 * Math.max(.25, Math.min(2.5, sensitivity)))
      const css = getComputedStyle(canvas)
      const accent = css.getPropertyValue('--accent').trim() || '#b69cff'
      context.fillStyle = accent; context.strokeStyle = accent; context.lineWidth = 2
      const count = Math.min(96, Math.max(24, Math.floor(w / 7)))
      const gap = style === 'dots' ? 3 : 2
      const barW = Math.max(1, (w - gap * (count - 1)) / count)
      if (style === 'wave') {
        context.beginPath()
        for (let i = 0; i < count; i++) {
          const x = i / Math.max(1, count - 1) * w
          const y = h / 2 + (value(i * 2) - .25) * h * .62
          if (i === 0) context.moveTo(x, y); else context.lineTo(x, y)
        }
        context.stroke()
      } else {
        for (let i = 0; i < count; i++) {
          const x = i * (barW + gap); const magnitude = value(Math.floor(i / count * bins.length))
          const height = Math.max(style === 'dots' ? 3 : 2, magnitude * (style === 'spectrum' ? h : h * .86))
          if (style === 'mirror') {
            const half = height / 2; context.fillRect(x, h / 2 - half, barW, Math.max(1, half - 1)); context.fillRect(x, h / 2 + 1, barW, Math.max(1, half - 1))
          } else if (style === 'dots') {
            const radius = Math.max(1.2, barW * .4)
            for (let y = h - 4; y >= h - height; y -= radius * 2.8) { context.beginPath(); context.arc(x + barW / 2, y, radius, 0, Math.PI * 2); context.fill() }
          } else context.fillRect(x, h - height, barW, height)
        }
      }
      if (active && analyser) raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [analyser, style, sensitivity, active])
  return <canvas ref={canvasRef} className="myriff-visualizer" aria-label="Live audio visualizer" />
}
