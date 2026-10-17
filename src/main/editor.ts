import { spawn } from 'node:child_process'
import type { AppSettings, EditorRequest, EffectName } from '../shared/types'
import path from 'node:path'

function findFfmpeg(settings: AppSettings) { return settings.ffmpegPath?.trim() || 'ffmpeg' }
export function exportEditedAudio(request: EditorRequest, settings: AppSettings, onProgress: (percent: number) => void) {
  if (!request.inputPath || !request.outputPath) throw new Error('Choose an input track and output file.')
  if (!Number.isFinite(request.start) || request.start < 0) throw new Error('Start time must be zero or greater.')
  if (request.end !== undefined && (!Number.isFinite(request.end) || request.end <= request.start)) throw new Error('End time must be after start time.')
  if (path.resolve(request.inputPath).toLocaleLowerCase() === path.resolve(request.outputPath).toLocaleLowerCase()) throw new Error('The output must be a new file. The source file will never be overwritten.')
  const filters: string[] = []
  const speed = Math.min(2, Math.max(0.5, request.speed ?? 1))
  if (speed !== 1) filters.push(`atempo=${speed.toFixed(3)}`)
  const reverb = Math.min(1, Math.max(0, request.reverb ?? 0))
  const distortion = Math.min(1, Math.max(0, request.distortion ?? 0))
  const bands = request.eqBands?.length ? request.eqBands : []
  const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  const selectedChain: EffectName[] = (request.effectChain?.length ? request.effectChain : settings.effectChain || ['eq','distortion','reverb']).filter((v,i,a) => a.indexOf(v) === i)
  for (const effect of selectedChain) {
    if (effect === 'eq') {
      bands.forEach((db, i) => { const gain = Math.max(-12, Math.min(12, Number(db) || 0)); if (gain !== 0) filters.push(`equalizer=f=${frequencies[i]}:t=q:w=1.1:g=${gain.toFixed(1)}`) })
      const gain = Math.min(18, Math.max(-18, request.eqGain ?? 0))
      if (!bands.length && gain !== 0) filters.push(`volume=${gain.toFixed(1)}dB`)
    } else if (effect === 'reverb' && reverb > 0) {
      filters.push(`aecho=0.8:0.75:700|1100:${(reverb * 0.45).toFixed(3)}|${(reverb * 0.25).toFixed(3)}`)
    } else if (effect === 'distortion' && distortion > 0) {
      filters.push(`asoftclip=type=tanh:threshold=${Math.max(0.1, 1 - distortion * 0.85).toFixed(3)}`)
    }
  }
  const args = ['-hide_banner', '-n', '-ss', String(request.start), '-i', request.inputPath]
  if (request.end !== undefined) args.push('-t', String(request.end - request.start))
  if (filters.length) args.push('-af', filters.join(','))
  args.push('-vn', '-progress', 'pipe:1', '-nostats', request.outputPath)
  return new Promise<{ outputPath: string }>((resolve, reject) => {
    const proc = spawn(findFfmpeg(settings), args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    proc.stdout.on('data', chunk => {
      out += chunk.toString()
      for (const line of out.split(/\r?\n/)) if (line.startsWith('out_time_ms=')) {
        const ms = Number(line.slice(12)); if (Number.isFinite(ms) && request.end !== undefined) onProgress(Math.min(99, Math.round(ms / ((request.end - request.start) * 1_000_000) * 100)))
      }
      out = out.slice(-1000)
    })
    proc.stderr.on('data', d => { err = (err + d.toString()).slice(-5000) })
    proc.on('error', e => reject(new Error(`Could not start FFmpeg. Install FFmpeg or set its path in Settings. ${e.message}`)))
    proc.on('close', code => code === 0 ? resolve({ outputPath: request.outputPath }) : reject(new Error(err.trim() || `FFmpeg exited with code ${code}`)))
  })
}

export function exportMetadataTaggedCopy(inputPath: string, outputPath: string, tags: { title: string; artist: string; album: string; year: number | null }, settings: AppSettings): Promise<{ outputPath: string }> {
  if (!inputPath || !outputPath) throw new Error('Choose a source track and output path.')
  if (path.resolve(inputPath).toLocaleLowerCase() === path.resolve(outputPath).toLocaleLowerCase()) throw new Error('The metadata export must use a different path so the original cannot be overwritten.')
  const args = ['-hide_banner', '-n', '-i', inputPath, '-map', '0', '-map_metadata', '0', '-c', 'copy', '-metadata', `title=${tags.title}`, '-metadata', `artist=${tags.artist}`, '-metadata', `album=${tags.album}`]
  if (tags.year) args.push('-metadata', `date=${tags.year}`)
  args.push(outputPath)
  return new Promise((resolve, reject) => {
    const proc = spawn(findFfmpeg(settings), args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let errorText = ''
    proc.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(-5000) })
    proc.on('error', error => reject(new Error(`Could not start FFmpeg for metadata export: ${error.message}`)))
    proc.on('close', code => code === 0 ? resolve({ outputPath }) : reject(new Error(errorText.trim() || `FFmpeg exited with code ${code}`)))
  })
}
