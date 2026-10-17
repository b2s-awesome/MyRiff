import { spawn } from 'node:child_process'
import type { AppSettings } from '../shared/types'

export function analyseReplayGain(filePath: string, settings: AppSettings): Promise<{ inputLufs: number; gainDb: number; truePeakDb: number | null }> {
  const executable = settings.ffmpegPath.trim() || 'ffmpeg'
  const target = Math.max(-23, Math.min(-8, Number(settings.loudnessTargetLufs) || -14))
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, ['-hide_banner', '-nostats', '-i', filePath, '-vn', '-af', `loudnorm=I=${target}:TP=-1.0:LRA=11:print_format=json`, '-f', 'null', '-'], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-20000) })
    proc.on('error', error => reject(new Error(`Could not start FFmpeg loudness analysis: ${error.message}`)))
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr.trim().slice(-1800) || `FFmpeg exited with code ${code}`))
      const blocks = [...stderr.matchAll(/\{[^{}]*"input_i"[^{}]*\}/gs)]
      const block = blocks.at(-1)?.[0]
      if (!block) return reject(new Error('FFmpeg did not return integrated loudness.'))
      let parsed: any
      try { parsed = JSON.parse(block) } catch { return reject(new Error('Could not parse FFmpeg loudness results.')) }
      const inputLufs = Number(parsed.input_i)
      const truePeak = Number(parsed.input_tp)
      if (!Number.isFinite(inputLufs)) return reject(new Error('FFmpeg could not measure the track loudness.'))
      return resolve({ inputLufs, gainDb: Math.max(-12, Math.min(12, target - inputLufs)), truePeakDb: Number.isFinite(truePeak) ? truePeak : null })
    })
  })
}
