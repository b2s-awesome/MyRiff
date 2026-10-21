# Changelog

## Unreleased — release manager and local discovery

- Added an on-demand stable/preview release browser with OS/architecture-aware installer selection and a mandatory local backup before opening an installer. The app does not silently replace its own binaries; older releases still require a manual install.
- Added optional local spectral/chroma similarity ranking for Local Radio. Audio segments are processed with FFmpeg, bounded for resource use, and cached locally by file identity and feature version; no audio is uploaded.
- Added strict GitHub host/path validation for release pages and installer links, plus regression coverage for the release flow.


## Release hardening in progress

- Added a packaged startup smoke-test runner that verifies the renderer root and preload bridge before requiring a clean exit.
- Added startup smoke testing for Windows, macOS and Linux; Linux uses Xvfb.
- Restricted CI download artifacts to installable packages rather than including unpacked app directories.
- Added a post-matrix job to persist the exact dependency lockfile only after all validation and platform builds pass.
- Updated documentation to distinguish successful packaging from real audio playback and hardware validation.

These additional smoke/lockfile changes must pass the current branch's own Actions run before being treated as verified.


## Unreleased — completion pass

- Added opt-in scheduled synchronisation for saved playlist sources, with configurable intervals while MyRiff is running.
- Added pause-and-resume workflow for downloads. Pausing stops yt-dlp and relies on its retained partial files and `--continue` when resumed; this is not OS-level process suspension.
- Added customisation profile JSON export/import, separate from full database backup. Import filters keys and validates common numeric ranges, enum values, EQ bands, effect order, shortcuts and audio profiles.
- Added portable data mode with a marker file, SQLite WAL checkpointing, data-directory copy and restart on switching. The executable directory must be writable; packaged runtime migration still requires testing.
- Added waveform drag-to-select trim ranges with 0.1-second snapping and undo/redo for waveform range changes.
- Added a bulk metadata copy editor for multi-track artist/album/year overrides and title templates, with per-file failure reporting and no source overwrite.
- Added an approximate karaoke word-highlight preview that explicitly does not claim authored word-level timing.
- Corrected the SoundTouch path so media-element playback rate remains at 1× when the worklet controls tempo; the fallback explicitly couples pitch and speed.
- Pinned direct dependency versions, added syntax transpilation checks, added an aggregate `verify` command, and expanded source regression tests.

## Known release blockers

- A committed `package-lock.json` is being added by CI only after the full main-branch validation and packaging matrix passes.
- TypeScript typecheck, Electron build, and Windows/macOS/Linux package jobs have since passed in GitHub Actions. Packaged startup smoke tests and real audio playback/device tests remain separate gates.
- True overlapping crossfade/gapless playback, full A/B player, parametric EQ/stereo width, waveform zoom/transient snapping, word-level karaoke lyrics, keyboard shortcut capture/conflict detection, in-app update/rollback, and full cross-platform runtime validation remain incomplete.


## Unreleased

- Add nested playlist folders with subfolders, direct playlist assignment, folder-aware backup restore, and safe folder deletion that preserves playlists.
- Improve playback lab with real overlapping crossfade, ordered DSP effects, and waveform zoom/pan (after CI validation).
