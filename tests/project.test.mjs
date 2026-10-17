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
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/)
  assert.match(workflow, /Smoke-test packaged Linux app under Xvfb/)
  assert.match(workflow, /Smoke-test packaged Windows app/)
  assert.match(workflow, /cancel-in-progress: true/)
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


test('remote streaming forwards source MIME and valid byte ranges and cleans up on disconnect', () => {
  const source = read('src/main/streaming.ts')
  assert.match(source, /--get-url/)
  assert.match(source, /requestHeaders\.Range = range/)
  assert.match(source, /upstream\.headers\.get\('content-type'\)/)
  assert.match(source, /fallbackStreamMimeType/)
  assert.match(source, /Readable\.fromWeb\(upstream\.body/)
  assert.match(source, /res\.on\('close'/)
  assert.match(source, /liveStreamRequests\.clear\(\)/)
  assert.doesNotMatch(source, /'Content-Type': 'audio\/webm'/)
})


test('playback lab exposes ordered DSP chain controls and same-position bypass comparison', async () => {
  const panel = await read('src/renderer/src/components/EffectsPanel.tsx')
  assert.match(panel, /Effect chain/)
  assert.match(panel, /moveEffect/)
  assert.match(panel, /effectsBypass: !settings\.effectsBypass/)
  assert.match(panel, /A\/B toggles the DSP bypass without seeking/)
})

test('waveform editor supports zoom, pan and global-time mapping for precise trim work', async () => {
  const waveform = await read('src/renderer/src/components/WaveformPreview.tsx')
  assert.match(waveform, /setZoom/)
  assert.match(waveform, /setViewOffset/)
  assert.match(waveform, /visibleStartTime/)
  assert.match(waveform, /globalIndex/)
})


test('playlist folders are nested, survive backup restore, and never delete source tracks', () => {
  const db = read('src/main/db.ts')
  const ipc = read('src/main/ipc.ts')
  const preload = read('src/preload/index.ts')
  const types = read('src/shared/types.ts')
  const app = read('src/renderer/src/App.tsx')
  assert.match(db, /CREATE TABLE IF NOT EXISTS playlist_folders/)
  assert.match(db, /parent_id INTEGER REFERENCES playlist_folders\(id\) ON DELETE CASCADE/)
  assert.match(db, /folder_id INTEGER REFERENCES playlist_folders\(id\) ON DELETE SET NULL/)
  assert.match(db, /ALTER TABLE playlists ADD COLUMN folder_id/)
  assert.match(db, /export function createPlaylistFolder/)
  assert.match(db, /export function movePlaylistToFolder/)
  assert.match(db, /WITH RECURSIVE folder_tree\(id\)/)
  assert.match(db, /playlistFolders: db\.prepare\('SELECT \* FROM playlist_folders'\)/)
  assert.match(db, /INSERT OR IGNORE INTO playlists\(id,name,created_at,folder_id\)/)
  for (const channel of ['playlist:folder-list','playlist:folder-create','playlist:folder-rename','playlist:folder-delete','playlist:move-to-folder']) {
    assert.ok(ipc.includes(channel), `missing IPC handler ${channel}`)
    assert.ok(preload.includes(channel), `missing preload method for ${channel}`)
  }
  assert.match(types, /export interface PlaylistFolder/)
  assert.match(types, /folderId: number \| null/)
  assert.match(app, /renderPlaylistFolder/)
  assert.match(app, /Move playlist to folder/)
  assert.match(app, /preserved in Unfiled/)
})


test('packaged smoke test verifies renderer and preload initialization with bounded timeout', () => {
  const main = read('src/main/index.ts')
  const script = read('scripts/smoke-packaged.mjs')
  assert.match(main, /MYRIFF_SMOKE_MARKER/)
  assert.match(main, /did-finish-load/)
  assert.ok(main.includes('window.myriff'))
  assert.match(script, /30_000/)
  assert.match(script, /rendererLoaded/)
  assert.match(script, /preloadApi/)
  assert.match(script, /linux-unpacked/)
  assert.match(script, /win-unpacked/)
  assert.ok(script.includes("Contents', 'MacOS', 'MyRiff'"))
})

test('build workflow smoke-tests each OS and persists the lockfile after the full platform matrix', () => {
  const workflow = read('.github/workflows/build.yml')
  assert.match(workflow, /npm run smoke:packaged/)
  assert.match(workflow, /xvfb-run --auto-servernum npm run smoke:packaged/)
  assert.ok(workflow.includes("artifact_path: 'release/*.exe'"))
  assert.ok(workflow.includes("artifact_path: 'release/*.dmg'"))
  assert.ok(workflow.includes('release/*.AppImage'))
  assert.ok(workflow.includes('persist-lockfile:'))
  assert.ok(workflow.includes('needs: [resolve-dependencies, validate, build]'))
  assert.ok(workflow.includes('git push origin HEAD:main'))
  assert.ok(!workflow.includes(['name: dependency-lock', '          path: release-assets'].join('\\n')))
})
