# MyRiff build status

Last checked: 2026-10-16.

## Verified in the available environment

- `npm run lint:source`: passed; 25 required files, 19 settings keys and 74 IPC invoke references checked.
- `npm test`: passed, 15 tests.
- `npm run lint:syntax`: passed, all 27 TypeScript/TSX source files transpiled without syntax diagnostics. The test was run using the globally installed TypeScript compiler because project dependencies were not installed.
- Source ZIP archive integrity: passed.

## Not verified

- `npm run typecheck` against installed project dependencies. The attempted check stops at TS2688 because `@types/node` and `vite/client` are unavailable without installed dependencies.
- `npm run build` / `npm run dist:win`, `dist:mac`, `dist:linux`.
- Launching the packaged Electron app, native `better-sqlite3` ABI rebuild, audio output and SoundTouch playback quality.
- End-to-end playlist downloads, portable-mode data migration, bulk FFmpeg tagging, and OS integration on each platform.

## Why the native build is still blocked here

The environment cannot resolve `registry.npmjs.org` (`curl` reports `Could not resolve host`) and `npm install` times out with an empty npm cache. This is a network/DNS limitation, not evidence that the app compiles. The GitHub Actions workflow now generates one lockfile on a network-enabled runner, shares it across the validation and native platform jobs, and only publishes artifacts after typecheck and packaging succeed.

## Release decision

**Do not treat this as a verified installer yet.** Use the workflow or a network-enabled Windows machine to complete the typecheck, package, launch and audio integration gates. Remaining functional limitations are tracked in `FEATURE-ROADMAP.md`.
