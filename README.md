# MyRiff

**MyRiff** is an independent, local-first desktop music player built with Electron, React and TypeScript. It takes inspiration from the *feature set* of [Riff](https://github.com/rootscripts/riff), but does not copy its source code. MyRiff is released under the MIT License.

> **Important:** This repository is a working early build, not a claim that every provider-specific capability is production-complete. Streaming services change frequently. MyRiff cannot promise ad-free playback, bypass a provider's access controls, or guarantee a public playlist extractor will work. Only download or edit audio you are entitled to use.

## Features in this build

| Area | Implemented | Notes |
|---|---|---|
| Local library | Yes | Bulk tag editor exports multiple tagged copies with optional shared artist/album/year overrides and title templates; originals are not overwritten. Recursive scan for FLAC, MP3, WAV, OGG, M4A, OPUS and several other common formats; title, artist, album, track, genre, year, duration and embedded art; fuzzy search; album/artist/folder/genre grouping; grid/list views. |
| Playlists | Yes | SQLite-backed create, rename, delete, add, remove and reorder with drag-and-drop or move controls. Items reference source paths; deleting a playlist does not delete audio files. |
| Playback | Yes | Play/pause, seek for local files, volume, next/previous, shuffle, repeat modes, saved position and queue. Settings include short, low-level left/centre/right output diagnostic tones routed to the selected output when supported. HTML media playback does not guarantee gapless transitions on all codecs/platforms. |
| Real-time DSP | Yes, with fallback caveat | 10-band parametric EQ with editable centre frequencies and Q, stereo width, presets, reverb, distortion, plus SoundTouch-worklet tempo and semitone pitch processing when the worklet loads. The fallback couples pitch and speed. The worklet path has source-level checks but still needs packaged audio-quality validation. |
| Local radio/discovery | Yes, hybrid | Uses local artist, genre, album, year, ratings and favourites; optional acoustic ranking decodes bounded audio segments through FFmpeg and compares cached spectral/chroma profiles. Analysis stays on device and is cached by file identity/version. It is not a trained music model and remains a similarity heuristic. |
| Search/stream | Partial | yt-dlp-backed search for YouTube and SoundCloud results plus a local HTTP proxy for playback. YouTube Music uses YouTube search results in this build. Remote seeking and all codec/provider combinations are not guaranteed. |
| Downloads | Yes, with external tools | MP3/FLAC/Opus selection, progress events, retry/resume using retained partial files, and file-manager access. Saved playlist sources support opt-in scheduled sync while MyRiff is open. When opt-in auto-enrichment is enabled, finished downloads are added to a persistent MusicBrainz metadata-review queue; matches are confidence-scored and reviewed before exporting a new tagged copy, never rewriting the original. yt-dlp and usually FFmpeg must be installed. Output is written to `Music/MyRiff Downloads`. |
| Playlist import | Partial | Extractor-supported public playlists are parsed and entries are matched to the local library. Unmatched entries are reported, not automatically downloaded. Spotify/Apple Music often restrict anonymous track-list access; support depends on the currently available public page/extractor. |
| Audio editor | Yes, with FFmpeg | Waveform preview with drag-to-select trim range, 0.1-second snapping and trim-range undo/redo; export a new file with speed, reverb, distortion and EQ. Source files are not overwritten. Full zoom and persisted per-track non-destructive edit sessions (trim range, speed, reverb, distortion and 10-band EQ) are supported; transient-aware snapping remains planned. |
| Lyrics | Yes | LRCLIB lookup, LRC/TXT import including Enhanced LRC word timestamps, synced line highlighting, per-line manual timing, authored word highlighting when timestamps exist and approximate karaoke highlighting otherwise. Local onset/energy-assisted auto-timing is heuristic; review it. Timings are stored locally for local tracks. |
| Theme/UI | Yes | Dark/light theme, sampled album-art accent, custom CSS, profile banner, responsive sidebar and compact mini-player window; customisation profile import/export. |
| Updates & recovery | Manual, on demand | Choose stable or preview releases, check public GitHub release metadata, select the installer for the current OS/architecture, and export a full MyRiff backup before opening an installer. Updates and rollbacks remain manual; MyRiff never replaces its own binaries in the background. |
| OS integration | Partial | Configurable OS-global media and MyRiff-volume shortcuts (separate from app-scoped bindings), browser media-session metadata/actions and tray controls; optional sleep inhibition and portable data mode. Discord Rich Presence needs a Discord application ID and working local Discord IPC; it uses the `myriff` large-image asset key rather than uploading local cover art. |
| Privacy | Yes by design | No app accounts, telemetry or analytics are included. Customisation profiles can be exported/imported independently of full database backups. Online searches/lyrics/streaming naturally contact those external services. |

## Build and release validation

GitHub Actions runs dependency installation, production dependency audit, source checks, regression tests, a full TypeScript typecheck and an Electron/Vite build. It packages Windows, macOS Intel, macOS ARM64 and Linux deliverables, then smoke-tests the packaged renderer/preload startup on each OS (Linux under Xvfb). A green run proves package creation and startup readiness, not every audio device/codec combination or listening quality. See [BUILDING.md](BUILDING.md) and [BUILD-STATUS.md](BUILD-STATUS.md) for build instructions and validation boundaries.

## Requirements

- Node.js LTS 22 or newer (the one-click Windows setup installs the current LTS)
- npm
- yt-dlp for stream search, playback proxy, downloads and supported playlist imports
- FFmpeg for audio conversion and the audio editor
- A working desktop environment for Electron

MyRiff does not bundle yt-dlp or FFmpeg in this source archive. On Windows, download executables from their official project release pages and either add them to `PATH` or set their full paths under **Settings → External tools**. On macOS, `brew install yt-dlp ffmpeg` is a convenient option. On Linux, install `yt-dlp` and `ffmpeg` with your distribution's package manager. Keep both tools updated because media site extractors can stop working without notice.

## One-click setup on Windows

1. Extract the MyRiff project ZIP to a normal folder (for example, `Documents\MyRiff`).
2. Double-click `Install-MyRiff-Windows.bat`.
3. Allow WinGet installers to request elevation if Windows asks. The script installs Node.js LTS, FFmpeg and yt-dlp, then attempts Deno and runs `npm install` and `npm run typecheck`.
4. If native dependency compilation fails, it offers to install Python and Visual Studio C++ Build Tools and retry. These are optional, large downloads and are not installed unless needed.

The setup log is saved as `myriff-setup.log` in the project folder. The installer reads native process stdout/stderr through .NET and checks each child's actual exit code, so npm deprecation warnings written to stderr should not stop setup. Deno 2.3+ is preferred for yt-dlp. If WinGet cannot install Deno (including error `0x8A15002B`), setup continues when Node.js 22+ is available; MyRiff explicitly selects Node as yt-dlp's JavaScript runtime in that case. YouTube extraction still depends on yt-dlp and its bundled EJS support and can change as the provider changes.

Troubleshooting: if an earlier installer run stopped while checking `ffmpeg --version`, rerun the updated `Install-MyRiff-Windows.bat`. Windows PowerShell 5.1 can treat stderr from native programs as a terminating error when `$ErrorActionPreference` is `Stop`, even when the executable is simply printing its version. The updated script runs native processes through .NET with separate stdout/stderr readers for version checks, WinGet, npm installation, and typechecking; success is based on the process exit code instead of PowerShell's stderr handling. Previously installed tools are detected and skipped.

## Development

From the project directory:

```bash
npm install
npm run dev
```

`postinstall` asks electron-builder to rebuild native dependencies, including `better-sqlite3`, against Electron. If the native module does not load after changing Node/Electron versions, run:

```bash
npm run rebuild:native
```

TypeScript validation:

```bash
npm run typecheck
```

Production compile without creating an installer:

```bash
npm run build
```

## Create installers

Build each platform on its native OS for the most reliable results. Native dependencies and macOS code-signing/notarisation make cross-platform packaging less predictable.

### Windows (PowerShell)

```powershell
npm install
npm run dist:win
```

Outputs include an NSIS installer and ZIP under `release/`.

### macOS (Terminal)

```bash
npm install
npm run dist:mac
```

Outputs include a DMG and ZIP under `release/`. For distribution outside your own machine, configure Apple Developer signing and notarisation; without signing, macOS can show Gatekeeper warnings.

### Linux

```bash
npm install
npm run dist:linux
```

Outputs include AppImage, Debian package and tarball under `release/`. Some Linux distributions may require additional Electron runtime libraries. AppImage may require FUSE support on older systems.

### Build all three through GitHub Actions

The workflow in `.github/workflows/build.yml` builds on Windows, macOS and Ubuntu runners and uploads each platform's artifacts. Push a branch or run it manually from the Actions tab.

## Project layout

```text
MyRiff/
├── assets/                 # App icon assets (PNG, ICO, ICNS, SVG)
├── src/
│   ├── main/
│   │   ├── index.ts        # Electron window, custom protocols, tray and media keys
│   │   ├── ipc.ts          # IPC handlers, dialogs, integrations and process dispatch
│   │   ├── db.ts           # SQLite schema and persistence
│   │   ├── library.ts      # Recursive scan and metadata/art cache
│   │   ├── streaming.ts    # yt-dlp search, proxy, downloads and playlist parsing
│   │   ├── editor.ts       # FFmpeg exports and filters
│   │   ├── lyrics.ts       # LRCLIB and LRC parsing
│   │   └── discord.ts      # Optional Discord Rich Presence
│   ├── preload/
│   │   ├── index.ts        # Narrow, typed renderer bridge
│   │   └── index.d.ts
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx     # Navigation, player, workflows and settings
│   │       ├── styles.css  # UI theme and responsive layout
│   │       ├── useAudioEngine.ts
│   │       └── components/
│   │           ├── TrackGrid.tsx
│   │           ├── PlayerBar.tsx
│   │           └── EffectsPanel.tsx
│   └── shared/types.ts
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
└── LICENSE
```

## Validation

Run `npm test` for the repository smoke tests and `npm run lint:source` for required-file, settings-schema, and IPC-reference checks. These tests are lightweight structural checks, not a substitute for the full `npm run typecheck`, real playback tests, or testing the packaged app on each OS.

## Data and privacy

Library metadata, artwork-cache references, playlists, watched library roots, saved playlist sync sources, download job history, settings, playback state, completed download history and local lyric timings live in `myriff.sqlite` under Electron's `app.getPath('userData')` directory. Album-art cache files are stored beside that database in an `artwork/` directory. The app does not relocate local audio when scanning or managing playlists.

Online functionality sends searches/URLs to yt-dlp's target service, lyric requests to LRCLIB and media requests to the chosen provider. These external calls are necessary for those features and are not app telemetry.

## Safety notes

- Child processes are started with argument arrays (`shell: false`); do not point external-tool settings at untrusted wrappers. The ESM preload is unsandboxed as required by Electron, but the renderer still has context isolation, no Node integration, and a narrow explicit IPC bridge.
- Streaming URLs are validated to the supported YouTube/SoundCloud hostnames before being passed to yt-dlp.
- Custom CSS intentionally runs in the renderer context and can break the interface; it does not grant Node.js access.
- The mini-player and media-key support vary by desktop environment and OS.
- Review provider terms and your local law before downloading or redistributing anything.

## License

MIT. See [LICENSE](LICENSE).


### Nested playlist folders

Playlists can be filed in folders and subfolders. Folder operations only change MyRiff's database references; they never move, rename, or delete the original audio files. Deleting a folder removes that folder subtree and returns its playlists to Unfiled. Folder structure, watched library roots, saved playlist-sync sources and download-job history are included in MyRiff backups. Queued or in-progress jobs restore as paused so the UI never implies a dead process is still running.
