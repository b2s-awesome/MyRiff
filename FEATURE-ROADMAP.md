# MyRiff feature completion ledger

This document tracks the complete feature scope requested for the private MyRiff client. “Implemented” means present in this source tree; “Partial” means the user interface or initial integration exists but does not yet meet the full target; “Planned” means it still needs implementation and validation. Never treat a partial item as production-complete.

## Core product and local library

- [x] Electron + React + TypeScript main/renderer split, narrow preload IPC bridge, SQLite persistence.
- [x] Recursive local library scan, common audio formats, metadata and embedded artwork.
- [x] Grid/list views, fuzzy search, folder/artist/album/genre grouping.
- [x] Playlists reference paths and do not move originals; create/rename/delete/add/remove.
- [x] Smart playlists with multi-rule AND/OR conditions.
- [x] Watch folders, ratings, favourites, listening history, bookmarks, missing-file cleanup.
- [x] Duplicate scan by file hash and metadata; CSV inventory export.
- [x] Metadata suggestions from MusicBrainz and tagged-copy export rather than in-place edits.
- [ ] One-click undo for library metadata operations. Bulk tag editor is implemented as non-destructive multi-track tagged-copy export; it does not overwrite original files.
- [x] Persistent nested playlist folders with safe folder reassignment/deletion and folder-aware backup restore. A complete drag-and-drop playlist editor remains planned.

## Playback and Sound Lab

- [x] Play/pause, previous/next, seek, volume, shuffle, repeat, queue reorder/clear, session restore.
- [x] Web Audio EQ, presets, reverb, distortion, visualiser, output-device selection where supported.
- [x] Audio profiles that can match artist, genre or output device.
- [x] ReplayGain/loudness analysis and per-track gain metadata.
- [x] Independent pitch shifting and tempo-preserving time stretch are wired through the SoundTouch worklet; the fallback intentionally couples pitch and speed. Needs packaged runtime/audio quality validation before being called release-ready.
- [ ] True gapless playback across codec/platform combinations.
- [x] Overlapping crossfade using a preloaded second media element and shared DSP graph. Codec-specific quality needs real audio-device testing; exact sample-gapless playback remains unguaranteed.
- [x] Same-position DSP-bypass A/B comparison and ordered effect-chain graph UI. A separate synchronised dual-deck A/B transport remains unimplemented.
- [x] Parametric 10-band EQ with editable centre frequencies, configurable Q and stereo width, available in live playback, saved audio profiles and FFmpeg exports.
- [ ] Per-headphone/device calibration wizard.
- [ ] Native exclusive/bit-perfect output and explicit sample-rate/bit-depth controls.

## Playlist Studio and downloads

- [x] Playlist URL preview for supported public YouTube, YouTube Music and SoundCloud URLs.
- [x] Whole-playlist download through yt-dlp, MP3/FLAC/Opus output choices, progress and retries.
- [x] Saved source list and archive-backed “sync new tracks” workflow.
- [x] Local playlist import/export (M3U, CSV, TXT), TuneMyMusic external transfer route.
- [x] Existing-library matching report and unmatched-entry reporting.
- [x] Opt-in scheduler for periodic playlist sync with a configurable interval; runs while the app is open. Per-source rules and richer notifications remain partial.
- [x] FIFO download queue with a consistent global concurrency cap, pause/cancel handling, persisted activity and a Downloads-page retry/resume action after restart. Retrying reuses the source URL and format; partial-file continuation depends on yt-dlp and the source.
- [ ] Automatic metadata/art enrichment after download with confidence review.
- [ ] Spotify/Apple Music playlist resolution is conditional on public access/exported playlist metadata; no unsupported private API or DRM bypass.

## Audio editor and lyrics

- [x] FFmpeg export to a new file, trim start/end, section export, speed, reverb, distortion and gain EQ.
- [x] Waveform preview, section timestamps, LRCLIB lookup, LRC import, synced line highlight, manual timing and heuristic auto-timing.
- [x] Draggable waveform trim selection, 0.1-second snapping and undo/redo for waveform range changes.
- [x] Waveform zoom/pan with global-time mapping, draggable trim ranges, 0.1-second snapping and range undo/redo. Transient-aware snapping and persisted non-destructive edit sessions remain planned.
- [x] Import and display authored per-word timestamps from Enhanced LRC files; line-only lyrics retain the approximate karaoke preview. Automatic speech alignment that generates word timestamps and an external lyric-provider plug-in interface remain planned.
- [ ] Independent effect rendering per effect-chain order in offline exports.

## Discovery and integrations

- [x] Remote search/playback adapters through yt-dlp for supported sources.
- [x] Local Radio page that generates a transparent metadata-based similarity queue.
- [x] Discord Rich Presence integration hook, global media shortcuts, tray controls, optional sleep inhibition.
- [ ] Audio-fingerprint similarity and “more like this” recommendations beyond metadata heuristics.
- [ ] Configurable visualiser shader packs and saved visualiser layouts.
- [ ] Full system media-session integration and volume hotkeys validated across Windows/macOS/Linux.
- [ ] Verified Discord artwork handling for per-track art; current RPC uses a configured app asset key.

## Personalisation, privacy and release engineering

- [x] Dark/light/system theme, dynamic/custom accent, profile banner, custom CSS, compact mini-player.
- [x] UI density, UI scale, sidebar width, grid columns, corner radius, animations, artwork background, visualiser controls.
- [x] Download settings, tool path overrides, streaming priority, keyboard shortcut settings, audio profiles, privacy/history controls.
- [x] Local SQLite backups/restore, diagnostic report, source-level sanity check and smoke tests.
- [x] Portable data mode with a startup marker, database checkpoint, data-folder migration and restart-on-switch (needs packaged-runtime validation).
- [x] App-shortcut capture UI with collision detection and clearable bindings. Separate global-vs-app scope labels and configurable OS-global shortcut registration remain.
- [x] Customisation profile import/export independent of the full database backup; imported values are filtered and range-validated.
- [ ] In-app update channel and safe rollback.
- [x] Dependency-aware typecheck, regression tests, renderer/main build and Windows/macOS/Linux packaging passed on GitHub Actions. This hardening branch adds a packaged renderer/preload startup smoke test for all OSes and commits the generated lockfile after a green main-branch matrix. Interactive UI automation, audio-device integration and listening-quality tests remain planned.

## Release gates

1. **0.2.x foundation:** setup/recovery, reliable install and typecheck, library/playlist stability, local radio, Playlist Studio and settings persistence.
2. **0.3.x playback:** SoundTouch integration for independent pitch/tempo, true crossfade/gapless strategy, A/B DSP and output validation.
3. **0.4.x editor/discovery:** full waveform editing, smarter matching, provider adapters and metadata enrichment.
4. **1.0:** cross-platform packaging, upgrade/rollback, accessibility, security review and regression testing.

## Download and provider policy

MyRiff should only download audio that the user is authorised to save and that the relevant source permits. It must not bypass DRM, account gates, paywalls, or service restrictions. Playlist transfers such as TuneMyMusic move track-list metadata; they do not grant rights to download audio. External provider requests are not app telemetry, but they do leave the device when those features are used.


## Latest completion pass

- [x] Nested playlist folders with subfolders, rename/delete, unfiled recovery and playlist reassignment.
- [x] Folder-aware backup/export restoration with backwards compatibility for version-1 backups.

## Playlist editor and backup coverage

- [x] Reorder playlist entries using drag-and-drop or accessible move-earlier/move-later buttons; the main process validates the submitted order before committing it to SQLite.
- [x] Backup/export now includes watched library roots, saved playlist-sync sources and download-job history; imported active/queued jobs are normalised to paused rather than displaying a nonexistent background process.


## Release validation boundary

A green GitHub Actions package matrix proves that dependencies install, TypeScript checks pass, the renderer/main bundle builds, and platform package formats are emitted. A packaged startup smoke check additionally proves the renderer root and preload bridge initialise. It does not prove every audio format plays correctly, crossfade is sample-gapless on all hardware, remote extraction always works, or every preference has been manually validated. Those still require targeted integration tests and listening tests before a 1.0 release.
