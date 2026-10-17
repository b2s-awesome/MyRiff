# Changelog

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

- No committed `package-lock.json`: the npm registry could not be resolved in the build environment, so dependency installation and lockfile generation were unavailable.
- Full TypeScript typecheck, Electron build, native `better-sqlite3` rebuild, packaged launch and audio integration tests have not passed in this environment.
- True overlapping crossfade/gapless playback, full A/B player, parametric EQ/stereo width, waveform zoom/transient snapping, word-level karaoke lyrics, keyboard shortcut capture/conflict detection, in-app update/rollback, and full cross-platform runtime validation remain incomplete.
