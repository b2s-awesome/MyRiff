import { app, BrowserWindow, protocol, nativeImage, Tray, Menu, globalShortcut, powerSaveBlocker } from 'electron'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { initDatabase, getArtworkPath, getArtworkMime, closeDatabase, getSettings, isKnownTrack, markInterruptedDownloadJobs } from './db'
import { registerIpc } from './ipc'
import { startStreamServer, stopStreamServer } from './streaming'
import { stopDiscord } from './discord'
import { activatePortableDataPath } from './appPaths'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
activatePortableDataPath()
protocol.registerSchemesAsPrivileged([
  { scheme: 'myriff-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: 'myriff-art', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let streamPort = 0
const miniSize = { width: 510, height: 170 }
const normalSize = { width: 1360, height: 900 }

function sendPlayerAction(action: string) { mainWindow?.webContents.send('player:action', action); if (!mainWindow) createWindow() }
function makeTray() {
  if (tray) return
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#a78bfa"/><path d="M40 8v31a10 10 0 1 1-6-9V19L19 23v23a10 10 0 1 1-6-9V19c0-2 1-4 4-4z" fill="white"/></svg>`
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  tray = new Tray(image)
  tray.setToolTip('MyRiff')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show MyRiff', click: () => { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Play / Pause', click: () => sendPlayerAction('toggle') },
    { label: 'Next Track', click: () => sendPlayerAction('next') },
    { label: 'Previous Track', click: () => sendPlayerAction('previous') },
    { type: 'separator' },
    { label: 'Quit MyRiff', click: () => app.quit() }
  ]))
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}
function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return }
  mainWindow = new BrowserWindow({
    width: normalSize.width, height: normalSize.height, minWidth: 1020, minHeight: 680,
    backgroundColor: '#111016', title: 'MyRiff', show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  mainWindow.on('closed', () => { mainWindow = null })
}
function setMiniPlayer(enabled: boolean) {
  if (!mainWindow) return
  if (enabled) {
    mainWindow.setSize(miniSize.width, miniSize.height, true)
    mainWindow.setMinimumSize(miniSize.width, miniSize.height)
    mainWindow.setAlwaysOnTop(true)
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setMinimumSize(1020, 680)
    mainWindow.setSize(normalSize.width, normalSize.height, true)
  }
  mainWindow.webContents.send('window:mini-state', enabled)
}

app.whenReady().then(async () => {
  initDatabase(app.getPath('userData'))
  markInterruptedDownloadJobs()
  await startStreamServer(() => getSettings()).then(p => { streamPort = p }).catch(e => console.error('Stream proxy failed to start:', e))

  protocol.handle('myriff-art', async request => {
    const key = new URL(request.url).hostname
    if (!/^[a-f0-9]{40}$/i.test(key)) return new Response('Not found', { status: 404 })
    const filePath = getArtworkPath(key)
    if (!filePath) return new Response('Not found', { status: 404 })
    try { return new Response(await fs.readFile(filePath), { headers: { 'Content-Type': getArtworkMime(key), 'Access-Control-Allow-Origin': '*' } }) }
    catch { return new Response('Not found', { status: 404 }) }
  })
  protocol.handle('myriff-media', async request => {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')
    if (!filePath || !path.isAbsolute(filePath)) return new Response('Invalid path', { status: 400 })
    if (!isKnownTrack(filePath) && getSettings().bannerPath !== filePath) return new Response('Forbidden', { status: 403 })
    let stat
    try { stat = await fs.stat(filePath); if (!stat.isFile()) throw new Error('not a file') }
    catch { return new Response('Not found', { status: 404 }) }
    const ext = path.extname(filePath).toLowerCase()
    const mime: Record<string, string> = {
      '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
      '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.aiff': 'audio/aiff', '.wma': 'audio/x-ms-wma',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
    }
    const range = request.headers.get('range')
    let start = 0; let end = stat.size - 1; let status = 200
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/)
      if (match) { start = match[1] ? Number(match[1]) : 0; end = match[2] ? Number(match[2]) : end; status = 206 }
      if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
      end = Math.min(end, stat.size - 1)
    }
    const headers: Record<string, string> = {
      'Content-Type': mime[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1), 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'
    }
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
    const stream = createReadStream(filePath, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
  })
  registerIpc(() => mainWindow, setMiniPlayer, () => streamPort)
  createWindow(); makeTray()
  globalShortcut.register('MediaPlayPause', () => sendPlayerAction('toggle'))
  globalShortcut.register('MediaNextTrack', () => sendPlayerAction('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendPlayerAction('previous'))
  globalShortcut.register('VolumeUp', () => sendPlayerAction('volume-up'))
  globalShortcut.register('VolumeDown', () => sendPlayerAction('volume-down'))
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', async () => {
  globalShortcut.unregisterAll()
  tray?.destroy(); tray = null
  stopStreamServer(); await stopDiscord()
  closeDatabase()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
