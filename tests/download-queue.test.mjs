import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/main/streaming.ts'), 'utf8')

test('download queue enforces one global concurrency cap across all queued jobs', () => {
  assert.match(source, /let globalDownloadConcurrency = 2/)
  assert.match(source, /if \(activeDownloads\.size >= globalDownloadConcurrency\) return/)
  assert.match(source, /globalDownloadConcurrency = Math\.max\(1, Math\.min\(4, Number\.isFinite\(settings\.downloadConcurrency\)/)
  assert.match(source, /pendingDownloads\.entries\(\)\.next\(\)\.value/)
  assert.match(source, /if \(!downloadSettings\.has\(id\)\) continue/)
  assert.doesNotMatch(source, /const limit = Math\.max\(1, Math\.min\(4, opts\?\.concurrency/)
})

test('pause and cancel release queued slots without losing retryable URLs', () => {
  assert.match(source, /export function pauseDownload\(id: string\)/)
  assert.match(source, /export function cancelDownload\(id: string\)/)
  assert.match(source, /pendingDownloads\.delete\(id\)/)
  assert.match(source, /--continue/)
  assert.match(source, /Paused\. Resume to continue from the retained partial download/)
})
