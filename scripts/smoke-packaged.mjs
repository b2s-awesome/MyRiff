import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const releaseDir = path.resolve('release')
const platform = process.platform

async function exists(filePath) {
  try { await fs.access(filePath); return true } catch { return false }
}

async function findExecutable() {
  const candidates = platform === 'win32'
    ? [path.join(releaseDir, 'win-unpacked', 'MyRiff.exe')]
    : platform === 'darwin'
      ? [
          path.join(releaseDir, 'mac', 'MyRiff.app', 'Contents', 'MacOS', 'MyRiff'),
          path.join(releaseDir, 'mac-arm64', 'MyRiff.app', 'Contents', 'MacOS', 'MyRiff'),
          path.join(releaseDir, 'mac-x64', 'MyRiff.app', 'Contents', 'MacOS', 'MyRiff')
        ]
      : [
          path.join(releaseDir, 'linux-unpacked', 'myriff'),
          path.join(releaseDir, 'linux-unpacked', 'MyRiff')
        ]

  for (const candidate of candidates) if (await exists(candidate)) return candidate

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(directory, entry.name)
      if (platform === 'darwin' && entry.isDirectory() && entry.name.endsWith('.app')) {
        const executable = path.join(full, 'Contents', 'MacOS', 'MyRiff')
        if (await exists(executable)) return executable
        continue
      }
      if (entry.isFile()) {
        const name = entry.name.toLowerCase()
        if (platform === 'win32' && name === 'myriff.exe' && full.toLowerCase().includes('win-unpacked')) return full
        if (platform === 'linux' && name === 'myriff' && full.toLowerCase().includes('linux-unpacked')) return full
      }
      if (entry.isDirectory() && !['resources', 'locales'].includes(entry.name.toLowerCase())) {
        const found = await visit(full)
        if (found) return found
      }
    }
    return null
  }

  return visit(releaseDir)
}

function waitForExit(child) {
  return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
}

const executable = await findExecutable()
if (!executable) {
  throw new Error(`Packaged MyRiff executable not found under ${releaseDir} for ${platform}.`)
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'myriff-packaged-smoke-'))
const marker = path.join(tempRoot, 'renderer-ready.json')
const userData = path.join(tempRoot, 'profile')
await fs.mkdir(userData, { recursive: true })

let child
try {
  child = spawn(executable, [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${userData}`
  ], {
    env: { ...process.env, MYRIFF_SMOKE_MARKER: marker, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    stdio: 'ignore',
    windowsHide: true
  })
  let spawnError = null
  child.on('error', error => { spawnError = error })
  const exited = waitForExit(child)
  const deadline = Date.now() + 30_000
  let result = null
  while (Date.now() < deadline) {
    try {
      result = JSON.parse(await fs.readFile(marker, 'utf8'))
      break
    } catch { /* the packaged app has not written its startup marker yet */ }
    if (spawnError) throw new Error(`Could not start packaged MyRiff: ${spawnError.message}`)
    if (child.exitCode !== null) throw new Error(`Packaged MyRiff exited before renderer startup (code ${child.exitCode}).`)
    await delay(200)
  }
  if (!result) {
    child.kill()
    throw new Error('Timed out after 30 seconds waiting for the renderer/preload startup marker.')
  }
  if (!result.ok || !result.rendererLoaded || !result.preloadApi) {
    throw new Error(`Packaged startup check failed: ${result.error || JSON.stringify(result)}`)
  }

  const exit = await Promise.race([exited, delay(8_000).then(() => null)])
  if (!exit) {
    child.kill()
    throw new Error('App reached renderer-ready state but did not exit cleanly after the smoke-test request.')
  }
  if (exit.code !== 0) throw new Error(`Packaged MyRiff reported ready but exited with code ${exit.code} (signal ${exit.signal}).`)
  console.log(`Packaged MyRiff startup smoke test passed on ${platform}: ${executable}`)
} finally {
  if (child && child.exitCode === null) child.kill()
  await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
}
