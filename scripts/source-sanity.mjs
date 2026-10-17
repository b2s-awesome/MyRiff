import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const requiredFiles = [
  'package.json', 'electron.vite.config.ts', 'src/main/index.ts', 'src/main/ipc.ts',
  'src/main/db.ts', 'src/main/appPaths.ts', 'src/main/library.ts', 'src/main/streaming.ts', 'src/main/editor.ts',
  'src/main/lyrics.ts', 'src/main/metadata.ts', 'src/main/audioAnalysis.ts', 'src/main/waveform.ts',
  'src/main/discord.ts', 'src/preload/index.ts', 'src/preload/index.d.ts',
  'src/shared/types.ts', 'src/renderer/src/App.tsx', 'src/renderer/src/styles.css',
  'src/renderer/src/components/PlaylistStudio.tsx', 'src/renderer/src/components/AdvancedSettings.tsx',
  'src/renderer/src/components/PowerToolsPage.tsx', 'LICENSE', 'README.md', 'FEATURE-ROADMAP.md', 'BUILD-STATUS.md', 'CHANGELOG.md'
]
const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)))
if (missing.length) {
  console.error('Missing required project files:\n' + missing.map(x => ` - ${x}`).join('\n'))
  process.exitCode = 1
} else {
  console.log(`Project structure OK (${requiredFiles.length} required files).`)
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const script of ['dev', 'build', 'typecheck', 'test', 'lint:source', 'lint:syntax', 'verify', 'dist:win', 'dist:mac', 'dist:linux']) {
  if (!pkg.scripts?.[script]) {
    console.error(`Missing npm script: ${script}`)
    process.exitCode = 1
  }
}
const types = fs.readFileSync(path.join(root, 'src/shared/types.ts'), 'utf8')
const requiredSettings = ['dynamicAccent', 'downloadConcurrency', 'downloadRetries', 'effectChain', 'crossfadeSeconds', 'audioOutputDeviceId', 'uiDensity', 'cornerRadius', 'uiScale', 'sidebarWidth', 'gridColumns', 'visualizerStyle', 'keyboardShortcuts', 'audioProfiles', 'historyEnabled', 'playlistImportMatchThreshold', 'portableMode', 'playlistAutoSync', 'playlistSyncIntervalHours']
const missingSettings = requiredSettings.filter(key => !new RegExp(`\\b${key}\\s*:`).test(types))
if (missingSettings.length) {
  console.error('Missing customisation settings: ' + missingSettings.join(', '))
  process.exitCode = 1
} else {
  console.log(`Customisation schema OK (${requiredSettings.length} key settings checked).`)
}
const ipc = fs.readFileSync(path.join(root, 'src/main/ipc.ts'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8')
const invokedChannels = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(match => match[1])
const missingChannels = [...new Set(invokedChannels)].filter(channel => !ipc.includes(`'${channel}'`))
if (missingChannels.length) {
  console.error('Preload IPC channels without a matching main-process handler/reference: ' + missingChannels.join(', '))
  process.exitCode = 1
} else {
  console.log(`IPC channel references OK (${new Set(invokedChannels).size} invoke channels checked).`)
}
if (!process.exitCode) console.log('Source sanity passed.')
