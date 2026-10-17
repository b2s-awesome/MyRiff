import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('package exposes development, validation and all platform build commands', () => {
  const pkg = JSON.parse(read('package.json'))
  for (const key of ['dev', 'build', 'typecheck', 'test', 'lint:source', 'lint:syntax', 'verify', 'dist:win', 'dist:mac', 'dist:linux']) assert.ok(pkg.scripts[key], `missing ${key}`)
})

test('customisation schema includes the core appearance, playback and privacy controls', () => {
  const source = read('src/shared/types.ts')
  for (const field of ['theme', 'accent', 'dynamicAccent', 'customCss', 'bannerPath', 'uiDensity', 'cornerRadius', 'uiScale', 'sidebarWidth', 'gridColumns', 'visualizerStyle', 'keyboardShortcuts', 'audioProfiles', 'portableMode', 'historyEnabled', 'confirmDestructiveActions']) {
    assert.match(source, new RegExp(`\\b${field}\\s*:`), `missing setting ${field}`)
  }
})

test('playlist studio includes bulk downloads, import, saved sync and TuneMyMusic route', () => {
  const source = read('src/renderer/src/components/PlaylistStudio.tsx')
  for (const phrase of ['startPlaylistDownload', 'previewPlaylist', 'importPlaylistFile', 'savePlaylistSource', 'syncPlaylistSource', 'openTuneMyMusic']) assert.ok(source.includes(phrase), `missing ${phrase}`)
})

test('renderer uses a narrow preload bridge rather than Node integration', () => {
  const main = read('src/main/index.ts')
  assert.match(main, /contextIsolation:\s*true/)
  assert.match(main, /nodeIntegration:\s*false/)
  assert.match(read('src/preload/index.ts'), /contextBridge\.exposeInMainWorld\('myriff'/)
})

test('playlist downloads validate supported sources and use child-process arguments', () => {
  const source = read('src/main/streaming.ts')
  assert.match(source, /shell:\s*false/)
  assert.match(source, /--download-archive/)
  assert.match(source, /--yes-playlist/)
})


test('customisation profile import/export is wired through a validated main-process handler', () => {
  const main = read('src/main/ipc.ts')
  const preload = read('src/preload/index.ts')
  const ui = read('src/renderer/src/components/AdvancedSettings.tsx')
  assert.match(main, /settings-profile:export/)
  assert.match(main, /settings-profile:import/)
  assert.match(main, /myriff-settings-profile/)
  assert.match(preload, /exportSettingsProfile/)
  assert.match(preload, /importSettingsProfile/)
  assert.match(ui, /Export customisation/)
  assert.match(ui, /Import customisation/)
})

test('scheduled playlist sync is opt-in and interval-configurable', () => {
  const types = read('src/shared/types.ts')
  const db = read('src/main/db.ts')
  const ipc = read('src/main/ipc.ts')
  const ui = read('src/renderer/src/components/AdvancedSettings.tsx')
  assert.match(types, /playlistAutoSync:\s*boolean/)
  assert.match(types, /playlistSyncIntervalHours:\s*number/)
  assert.match(db, /playlistAutoSync:\s*false/)
  assert.match(ipc, /configurePlaylistScheduler/)
  assert.match(ipc, /scheduledPlaylistSources/)
  assert.match(ui, /Automatically sync saved playlists/)
})


test('portable mode has a startup marker, data migration, and restart-safe switching path', () => {
  const paths = read('src/main/appPaths.ts')
  const db = read('src/main/db.ts')
  const ipc = read('src/main/ipc.ts')
  const ui = read('src/renderer/src/components/AdvancedSettings.tsx')
  assert.match(paths, /myriff-portable\.flag/)
  assert.match(paths, /app\.setPath\('userData', portableUserDataPath\)/)
  assert.match(db, /wal_checkpoint\(TRUNCATE\)/)
  assert.match(ipc, /app\.relaunch\(\)/)
  assert.match(ipc, /fsSync\.cpSync/)
  assert.match(ui, /Portable data mode/)
})


test('downloads expose resumable pause semantics without relying on platform-specific process suspension', () => {
  const streaming = read('src/main/streaming.ts')
  const ipc = read('src/main/ipc.ts')
  const preload = read('src/preload/index.ts')
  const ui = read('src/renderer/src/components/PlaylistStudio.tsx')
  assert.match(streaming, /export function pauseDownload/)
  assert.match(streaming, /pausedDownloads/)
  assert.match(streaming, /status: 'paused'/)
  assert.match(ipc, /download:pause/)
  assert.match(preload, /pauseDownload/)
  assert.match(ui, /Pause download/)
  assert.match(ui, /Resume download/)
})


test('waveform editor supports drag-to-select trim ranges and trim-range undo/redo controls', () => {
  const waveform = read('src/renderer/src/components/WaveformPreview.tsx')
  const app = read('src/renderer/src/App.tsx')
  assert.match(waveform, /onPointerDown/)
  assert.match(waveform, /onPointerMove/)
  assert.match(waveform, /onRangeChange/)
  assert.match(waveform, /Math\.round\(raw \* 10\) \/ 10/)
  assert.match(app, /undoTrimRange/)
  assert.match(app, /redoTrimRange/)
  assert.match(app, /onRangeChange=\{commitTrimRange\}/)
})


test('SoundTouch playback path does not multiply tempo through both the media element and worklet', () => {
  const source = read('src/renderer/src/useAudioEngine.ts')
  assert.match(source, /soundTouch\.playbackRate\.value = tempo/)
  assert.match(source, /audio\.playbackRate = 1/)
  assert.match(source, /audioRef\.current\.playbackRate = 1/)
  assert.match(source, /preservesPitch = false[\s\S]*playbackRate = Math\.max/)
})

test('CI resolves one npm lockfile and shares it across validation and native platform builds', () => {
  const workflow = read('.github/workflows/build.yml')
  assert.match(workflow, /npm install --package-lock-only --ignore-scripts/)
  assert.match(workflow, /name: dependency-lock/)
  assert.match(workflow, /npm ci --no-audit --no-fund/)
  assert.match(workflow, /windows-latest/)
  assert.match(workflow, /macos-latest/)
  assert.match(workflow, /ubuntu-latest/)
})


test('keyboard shortcuts can be captured and duplicate bindings are rejected', () => {
  const settings = read('src/renderer/src/components/AdvancedSettings.tsx')
  const app = read('src/renderer/src/App.tsx')
  assert.match(settings, /Press a key combination/)
  assert.match(settings, /const conflict = Object\.entries\(settings\.keyboardShortcuts\)/)
  assert.match(settings, /Backspace/)
  assert.match(app, /event\.metaKey \? 'Meta\+'/)
})


test('lyrics offer an explicitly approximate karaoke word-highlight preview', () => {
  const app = read('src/renderer/src/App.tsx')
  const styles = read('src/renderer/src/styles.css')
  assert.match(app, /Karaoke preview/)
  assert.match(app, /renderKaraokeWords/)
  assert.match(app, /consumed \/ totalWeight <= progress/)
  assert.match(styles, /\.karaoke-word\.sung/)
})


test('bulk tag editor exports new copies through the main process and never overwrites sources', () => {
  const main = read('src/main/ipc.ts')
  const preload = read('src/preload/index.ts')
  const ui = read('src/renderer/src/components/PowerToolsPage.tsx')
  assert.match(main, /metadata:bulk-export-copies/)
  assert.match(main, /exportMetadataTaggedCopy\(track\.path, outputPath/)
  assert.match(main, /Choose destination for tagged copies/)
  assert.match(preload, /bulkExportMetadataCopies/)
  assert.match(ui, /Bulk tag editor/)
  assert.match(ui, /Export \{bulkSelected\.size\} tagged copies/)
})
