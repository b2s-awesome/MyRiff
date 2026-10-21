import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { ACOUSTIC_FEATURE_LENGTH, getSettings, getAcousticFingerprint, saveAcousticFingerprint, isKnownTrack } from './db'

const SAMPLE_RATE = 11025
const MAX_SECONDS = 24
const MAX_PCM_BYTES = SAMPLE_RATE * 4 * (MAX_SECONDS + 1)
const FFT_SIZE = 2048
const HOP_SIZE = 1024
const SEGMENT_SECONDS = 6
const SEGMENT_COUNT = 4
const BANDS = 32
const CHROMA = 12
const FEATURES_PER_SEGMENT = BANDS + CHROMA
const FEATURE_VERSION_LENGTH = SEGMENT_COUNT * FEATURES_PER_SEGMENT

function decodePcm(filePath: string, executable: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(executable, [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-i', filePath,
        '-t', String(MAX_SECONDS),
        '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE),
        '-f', 'f32le', 'pipe:1'
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      reject(new Error(`Could not start FFmpeg: ${error instanceof Error ? error.message : String(error)}`))
      return
    }

    const chunks: Buffer[] = []
    let totalBytes = 0
    let stderr = ''
    let settled = false
    let tooLarge = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('FFmpeg audio analysis timed out after 20 seconds.'))
    }, 20_000)
    timeout.unref?.()

    const finish = (error?: Error, samples?: Float32Array) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve(samples || new Float32Array())
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return
      totalBytes += chunk.length
      if (totalBytes > MAX_PCM_BYTES) {
        tooLarge = true
        child.kill()
        finish(new Error('Decoded audio exceeded the configured analysis limit.'))
        return
      }
      chunks.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-3000) })
    child.once('error', (error: Error) => finish(new Error(`FFmpeg could not start: ${error.message}`)))
    child.once('close', (code: number | null, signal: string | null) => {
      if (settled) return
      if (tooLarge) return
      if (code !== 0) {
        finish(new Error(`FFmpeg could not decode this track (exit ${code ?? signal ?? 'unknown'}).${stderr.trim() ? ` ${stderr.trim()}` : ''}`))
        return
      }
      const pcm = Buffer.concat(chunks, totalBytes)
      const usableBytes = pcm.length - (pcm.length % 4)
      const samples = new Float32Array(usableBytes / 4)
      for (let i = 0; i < samples.length; i++) samples[i] = pcm.readFloatLE(i * 4)
      finish(undefined, samples)
    })
  })
}

function fft(real: Float64Array, imag: Float64Array) {
  const n = real.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    while ((j & bit) !== 0) { j ^= bit; bit >>= 1 }
    j ^= bit
    if (i < j) {
      const r = real[i]; real[i] = real[j]; real[j] = r
      const im = imag[i]; imag[i] = imag[j]; imag[j] = im
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length
    const stepR = Math.cos(angle)
    const stepI = Math.sin(angle)
    for (let offset = 0; offset < n; offset += length) {
      let wr = 1
      let wi = 0
      for (let k = 0; k < length / 2; k++) {
        const even = offset + k
        const odd = even + length / 2
        const tr = wr * real[odd] - wi * imag[odd]
        const ti = wr * imag[odd] + wi * real[odd]
        real[odd] = real[even] - tr
        imag[odd] = imag[even] - ti
        real[even] += tr
        imag[even] += ti
        const nextWr = wr * stepR - wi * stepI
        wi = wr * stepI + wi * stepR
        wr = nextWr
      }
    }
  }
}

function fingerprintFromPcm(samples: Float32Array): number[] {
  const output: number[] = Array(FEATURE_VERSION_LENGTH).fill(0)
  const segmentSamples = Math.floor(SAMPLE_RATE * SEGMENT_SECONDS)
  const real = new Float64Array(FFT_SIZE)
  const imag = new Float64Array(FFT_SIZE)
  const hann = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)))
  const logBandRange = Math.log(5000 / 45)

  for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
    const segmentStart = segment * segmentSamples
    if (segmentStart >= samples.length) continue
    const segmentEnd = Math.min(samples.length, segmentStart + segmentSamples)
    const featureBase = segment * FEATURES_PER_SEGMENT
    let frames = 0
    const energies = new Float64Array(FEATURES_PER_SEGMENT)

    for (let frameStart = segmentStart; frameStart < segmentEnd; frameStart += HOP_SIZE) {
      real.fill(0)
      imag.fill(0)
      const available = Math.min(FFT_SIZE, segmentEnd - frameStart)
      let frameEnergy = 0
      for (let i = 0; i < available; i++) {
        const sample = samples[frameStart + i]
        if (!Number.isFinite(sample)) continue
        real[i] = sample * hann[i]
        frameEnergy += sample * sample
      }
      if (frameEnergy < 1e-10) { frames++; continue }
      fft(real, imag)
      for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
        const frequency = bin * SAMPLE_RATE / FFT_SIZE
        if (frequency < 45 || frequency > 5000) continue
        const magnitude = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin])
        if (!Number.isFinite(magnitude) || magnitude <= 0) continue
        const band = Math.max(0, Math.min(BANDS - 1, Math.floor(Math.log(frequency / 45) / logBandRange * BANDS)))
        const note = ((Math.round(69 + 12 * Math.log2(frequency / 440)) % CHROMA) + CHROMA) % CHROMA
        energies[band] += magnitude
        energies[BANDS + note] += magnitude
      }
      frames++
    }

    if (!frames) continue
    let norm = 0
    for (let i = 0; i < FEATURES_PER_SEGMENT; i++) {
      energies[i] /= frames
      norm += energies[i] * energies[i]
    }
    norm = Math.sqrt(norm)
    if (norm < 1e-12) continue
    for (let i = 0; i < FEATURES_PER_SEGMENT; i++) output[featureBase + i] = energies[i] / norm
  }
  return output
}

function compareFingerprints(a: number[], b: number[]) {
  let total = 0
  let comparedSegments = 0
  for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
    const offset = segment * FEATURES_PER_SEGMENT
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < FEATURES_PER_SEGMENT; i++) {
      const av = a[offset + i] || 0
      const bv = b[offset + i] || 0
      dot += av * bv
      normA += av * av
      normB += bv * bv
    }
    if (normA < 1e-10 || normB < 1e-10) continue
    total += Math.max(0, Math.min(1, dot / Math.sqrt(normA * normB)))
    comparedSegments++
  }
  return comparedSegments ? Math.round((total / comparedSegments) * 1000) / 10 : 0
}

async function fingerprintForTrack(trackPath: string, executable: string) {
  const stat = await fs.stat(trackPath).catch(() => null)
  if (!stat?.isFile()) throw new Error('The selected audio file is missing or inaccessible.')
  const cached = getAcousticFingerprint(trackPath, stat.mtimeMs, stat.size)
  if (cached) return { features: cached, cached: true }
  const pcm = await decodePcm(trackPath, executable)
  if (pcm.length < 2048) throw new Error('The selected track has too little decodable audio.')
  const features = fingerprintFromPcm(pcm)
  saveAcousticFingerprint(trackPath, stat.mtimeMs, stat.size, features)
  return { features, cached: false }
}

export interface AcousticSimilarityScore { path: string; similarity: number }
export interface AcousticSimilarityReport {
  seedPath: string
  results: AcousticSimilarityScore[]
  compared: number
  cached: number
  skipped: number
}

export async function analyseAcousticSimilarity(seedPath: string, candidatePaths: string[]): Promise<AcousticSimilarityReport> {
  if (typeof seedPath !== 'string' || seedPath.length > 32768 || !isKnownTrack(seedPath)) {
    throw new Error('Choose a local library track before analysing audio similarity.')
  }
  if (!Array.isArray(candidatePaths) || candidatePaths.length > 60 || candidatePaths.some(value => typeof value !== 'string' || value.length > 32768)) {
    throw new Error('Audio similarity accepts at most 60 local candidate tracks per request.')
  }
  const settings = getSettings()
  const executable = String(settings.ffmpegPath || '').trim() || 'ffmpeg'
  const seed = await fingerprintForTrack(seedPath, executable)
  const paths = [...new Set(candidatePaths)].filter(pathName => pathName !== seedPath && isKnownTrack(pathName)).slice(0, 40)
  const results: AcousticSimilarityScore[] = []
  let cached = seed.cached ? 1 : 0
  let skipped = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < paths.length) {
      const index = cursor++
      const trackPath = paths[index]
      try {
        const candidate = await fingerprintForTrack(trackPath, executable)
        if (candidate.cached) cached++
        results.push({ path: trackPath, similarity: compareFingerprints(seed.features, candidate.features) })
      } catch (error) {
        skipped++
        console.warn(`[MyRiff] Could not compare local track ${trackPath}:`, error)
      }
    }
  }
  await Promise.all([worker(), worker()])
  results.sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path))
  return { seedPath, results, compared: results.length, cached, skipped }
}
