import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as ts from 'typescript'

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'))

async function loadDatabaseModule() {
  const sourcePath = path.join(process.cwd(), 'src', 'main', 'db.ts')
  const source = await fs.readFile(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true
    },
    fileName: sourcePath
  })
  assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0, 0)
  const runtimeModule = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(
    requireFromProject,
    runtimeModule,
    runtimeModule.exports
  )
  return runtimeModule.exports
}

function addTrack(api, filePath, title) {
  api.upsertTrack({
    path: filePath,
    title,
    artist: 'Integration Artist',
    album: 'Integration Album',
    trackNo: null,
    genre: 'Test',
    year: 2024,
    duration: 180,
    artworkKey: null,
    folder: path.dirname(filePath),
    addedAt: Date.now(),
    fileSize: 2048
  })
}

test('SQLite integration: playlist ordering and backup round-trip preserve library roots, sync sources and download jobs', async () => {
  const api = await loadDatabaseModule()
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'myriff-db-roundtrip-'))
  const firstDb = path.join(tempRoot, 'first')
  const secondDb = path.join(tempRoot, 'restored')
  try {
    const musicRoot = path.join(tempRoot, 'music')
    await fs.mkdir(musicRoot, { recursive: true })
    api.initDatabase(firstDb)

    const paths = [
      path.join(musicRoot, 'one.flac'),
      path.join(musicRoot, 'two.flac'),
      path.join(musicRoot, 'three.flac')
    ]
    addTrack(api, paths[0], 'One')
    addTrack(api, paths[1], 'Two')
    addTrack(api, paths[2], 'Three')

    const playlist = api.createPlaylist('Integration Playlist')
    api.addPlaylistTracks(playlist.id, paths)
    const orderedPaths = [paths[2], paths[0], paths[1]]
    assert.deepEqual(
      api.reorderPlaylistTracks(playlist.id, orderedPaths).map(track => track.path),
      orderedPaths
    )
    assert.throws(
      () => api.reorderPlaylistTracks(playlist.id, [paths[0], paths[0], paths[2]]),
      /duplicate entries/
    )
    assert.throws(
      () => api.reorderPlaylistTracks(playlist.id, [paths[0], path.join(musicRoot, 'not-in-playlist.flac'), paths[2]]),
      /playlist changed/
    )

    api.upsertLibraryRoot(musicRoot, true)
    api.savePlaylistSource('Saved Mix', 'https://www.youtube.com/playlist?list=integration-test', 'opus')
    api.saveDownloadJob({
      id: 'integration-download-1',
      url: 'https://www.youtube.com/watch?v=integration-test',
      format: 'opus',
      status: 'downloading',
      title: 'Interrupted Track',
      percent: 42,
      speed: '1 MiB/s',
      eta: '00:20',
      completed: 0,
      total: 1,
      includePlaylist: true
    })

    const backup = api.exportBackupObject()
    assert.equal(backup.libraryRoots.length, 1)
    assert.equal(backup.playlistSources.length, 1)
    assert.equal(backup.downloadJobs.length, 1)

    // An imported backup is untrusted data: unsupported sources and malformed
    // job URLs should be ignored rather than restored as runnable work.
    backup.playlistSources.push({
      name: 'Untrusted source',
      url: 'http://example.invalid/playlist',
      format: 'mp3',
      last_synced: null,
      created_at: Date.now()
    })
    backup.downloadJobs.push({
      id: 'unsafe-job',
      url: 'javascript:alert(1)',
      format: 'opus',
      status: 'queued',
      title: 'Unsafe',
      progress: 0,
      error: '',
      updated_at: Date.now(),
      completed: 0,
      total: null,
      file_path: null,
      include_playlist: 0
    })

    api.closeDatabase()
    api.initDatabase(secondDb)
    assert.equal(api.restoreBackupObject(backup), true)

    assert.deepEqual(api.getPlaylistTracks(playlist.id).map(track => track.path), orderedPaths)
    const roots = api.listLibraryRoots()
    assert.equal(roots.length, 1)
    assert.equal(roots[0].path, musicRoot)
    assert.equal(Boolean(roots[0].watched), true)

    const sources = api.listPlaylistSources()
    assert.equal(sources.length, 1)
    assert.equal(sources[0].name, 'Saved Mix')
    assert.equal(sources[0].url, 'https://www.youtube.com/playlist?list=integration-test')

    const jobs = api.listDownloadJobs()
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].id, 'integration-download-1')
    assert.equal(jobs[0].status, 'paused')
    assert.match(jobs[0].error || '', /Restored from backup/)
    assert.equal(jobs[0].includePlaylist, true)
  } finally {
    try { api.closeDatabase() } catch { /* close only if initialisation succeeded */ }
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('SQLite integration: legacy version-1 backups without newer optional collections still restore', async () => {
  const api = await loadDatabaseModule()
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'myriff-db-legacy-backup-'))
  const sourceDb = path.join(tempRoot, 'source')
  const restoredDb = path.join(tempRoot, 'restored')
  try {
    api.initDatabase(sourceDb)
    const musicRoot = path.join(tempRoot, 'music')
    await fs.mkdir(musicRoot, { recursive: true })
    const trackPath = path.join(musicRoot, 'legacy.flac')
    addTrack(api, trackPath, 'Legacy Track')
    const backup = api.exportBackupObject()
    delete backup.libraryRoots
    delete backup.playlistSources
    delete backup.downloadJobs

    api.closeDatabase()
    api.initDatabase(restoredDb)
    assert.equal(api.restoreBackupObject(backup), true)
    assert.equal(api.listTracks().some(track => track.path === trackPath), true)
    assert.deepEqual(api.listLibraryRoots(), [])
    assert.deepEqual(api.listPlaylistSources(), [])
    assert.deepEqual(api.listDownloadJobs(), [])
  } finally {
    try { api.closeDatabase() } catch { /* close only if initialisation succeeded */ }
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})


test('SQLite integration: per-track editor sessions persist and round-trip through full backups', async () => {
  const api = await loadDatabaseModule()
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'myriff-editor-session-'))
  const sourceDb = path.join(tempRoot, 'source')
  const restoredDb = path.join(tempRoot, 'restored')
  try {
    api.initDatabase(sourceDb)
    const musicRoot = path.join(tempRoot, 'music')
    await fs.mkdir(musicRoot, { recursive: true })
    const trackPath = path.join(musicRoot, 'session-track.flac')
    addTrack(api, trackPath, 'Session Track')
    const input = {
      trackPath,
      start: 5.25,
      end: 93.4,
      speed: 1.25,
      reverb: 0.35,
      distortion: 0.2,
      eqBands: [-6, -3, 0, 1, 2, 3, 4, 5, 6, 7]
    }
    const saved = api.saveEditorSession(input)
    assert.equal(saved.trackPath, trackPath)
    assert.equal(saved.start, 5.25)
    assert.equal(saved.end, 93.4)
    assert.equal(saved.speed, 1.25)
    assert.equal(saved.reverb, 0.35)
    assert.equal(saved.distortion, 0.2)
    assert.deepEqual(saved.eqBands, input.eqBands)
    assert.equal(api.getEditorSession(trackPath)?.updatedAt, saved.updatedAt)
    assert.deepEqual(api.listEditorSessions().map(session => session.trackPath), [trackPath])

    const backup = api.exportBackupObject()
    assert.equal(backup.editorSessions.length, 1)
    api.closeDatabase()
    api.initDatabase(restoredDb)
    assert.equal(api.restoreBackupObject(backup), true)
    const restored = api.getEditorSession(trackPath)
    assert.ok(restored)
    assert.equal(restored.start, input.start)
    assert.equal(restored.end, input.end)
    assert.equal(restored.speed, input.speed)
    assert.equal(restored.reverb, input.reverb)
    assert.equal(restored.distortion, input.distortion)
    assert.deepEqual(restored.eqBands, input.eqBands)

    const { updatedAt: _updatedAt, ...editable } = restored
    api.saveEditorSession({ ...editable, start: 12.5 })
    assert.equal(api.getEditorSession(trackPath)?.start, 12.5)
    assert.equal(api.deleteEditorSession(trackPath), true)
    assert.equal(api.getEditorSession(trackPath), null)
    assert.deepEqual(api.listEditorSessions(), [])
  } finally {
    try { api.closeDatabase() } catch { /* close only if initialisation succeeded */ }
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})
