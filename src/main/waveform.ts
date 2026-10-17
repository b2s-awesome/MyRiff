import { spawn } from 'node:child_process'
import type { AppSettings } from '../shared/types'

export function generateWaveform(filePath: string, duration: number, settings: AppSettings, bucketCount = 280): Promise<number[]> {
  const executable = settings.ffmpegPath.trim() || 'ffmpeg'
  const buckets = Math.max(80, Math.min(1200, Math.floor(bucketCount)))
  const seconds = Math.max(0.1, Math.min(60 * 60 * 8, duration || 1))
  const framesPerBucket = Math.max(1, Math.ceil(seconds * 1000 / buckets))
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, ['-hide_banner', '-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', '1000', '-f', 'f32le', 'pipe:1'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let pending = Buffer.alloc(0)
    let max = 0
    let frameInBucket = 0
    const values: number[] = []
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      const combined = pending.length ? Buffer.concat([pending, chunk]) : chunk
      const usable = combined.length - combined.length % 4
      pending = combined.subarray(usable)
      for (let i = 0; i < usable; i += 4) {
        const v = Math.abs(combined.readFloatLE(i))
        if (Number.isFinite(v)) max = Math.max(max, v)
        frameInBucket++
        if (frameInBucket >= framesPerBucket) { values.push(Math.min(1, max)); max = 0; frameInBucket = 0 }
      }
      if (values.length > buckets * 2) proc.kill()
    })
    proc.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-1500) })
    proc.on('error', error => reject(new Error(`Could not start FFmpeg for waveform generation: ${error.message}`)))
    proc.on('close', code => {
      if (frameInBucket) values.push(Math.min(1, max))
      if (code !== 0 && code !== null) return reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`))
      if (!values.length) return reject(new Error(stderr.trim() || 'FFmpeg did not return waveform samples.'))
      const reduced = Array.from({ length: buckets }, (_, i) => {
        const start = Math.floor(i * values.length / buckets)
        const end = Math.max(start + 1, Math.floor((i + 1) * values.length / buckets))
        return Math.max(0.025, ...values.slice(start, end))
      })
      resolve(reduced)
    })
  })
}
