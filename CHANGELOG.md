# Changelog

## v0.2.1-preview.1 — 2026-10-22

- Fixed processed playback output routing: the selected output device is applied to the AudioContext graph, changes retarget the live graph, and unsupported/unavailable routes report an actionable error. System default remains a valid choice.
- Added on-demand stable/preview release browsing. MyRiff backs up its local data before opening an installer; because this repository is private, release downloads use the signed-in GitHub browser rather than storing credentials or tokens in the app. Installing and rolling back remain explicit manual actions.
- Added safe undo for single-track and bulk MyRiff-generated tagged copies. Undo only removes regular files that still match their recorded size, modification time and SHA-256; modified, missing or unverifiable copies are skipped, and original source tracks are never deleted.
- Added optional local acoustic similarity for Local Radio, cached on device with bounded FFmpeg analysis. No audio is uploaded; this is a lightweight similarity heuristic, not a trained recommendation model.
- Added packaged startup smoke checks for the renderer root and preload bridge on Windows, macOS Intel, macOS ARM64 and Linux. The release CI matrix passed the tests, TypeScript typecheck, production build, package generation and packaged-app startup checks before this version bump.
- Retained explicit reporting for features that need hardware tests or a native backend rather than claiming guarantees the Electron Web Audio engine cannot provide.

## Known limitations

- Exact sample-perfect gapless playback across every codec/device and native exclusive/bit-perfect output require a native audio backend beyond the current Chromium Web Audio DSP pipeline.
- Streaming and remote playlist extraction depend on the provider and yt-dlp's currently supported public interfaces. MyRiff does not bypass access controls or DRM.
- The package smoke tests prove build/renderer startup, not listening quality on every physical output, provider reliability, full accessibility coverage, or code signing/notarisation.
- Karaoke word highlighting is exact only when word timestamps exist; approximate highlighting remains heuristic. Discord cover art uses a registered application asset rather than uploading arbitrary local artwork.
