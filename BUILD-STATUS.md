# MyRiff build status

Last verified: 2026-10-22.

## Verified code matrix before the version bump

[GitHub Actions run 39696612211](https://github.com/b2s-awesome/MyRiff/actions/runs/39696612211) passed on the output-routing change set immediately before this release branch was versioned. It passed:

- Production dependency audit, source sanity, syntax transpilation and regression tests.
- Full TypeScript typecheck and Electron/Vite production build.
- Windows NSIS/ZIP packaging plus a packaged-app startup smoke test.
- macOS Intel DMG/ZIP packaging plus a packaged-app startup smoke test.
- macOS ARM64 DMG/ZIP packaging plus a packaged-app startup smoke test.
- Linux AppImage/DEB/tarball packaging plus an Xvfb packaged-app startup smoke test.

This release branch bumps the application version to 0.2.1. The release branch's own CI run must pass before its preview release is considered published.

## What CI does not prove

- Music playback quality and device selection with physical audio hardware/drivers.
- Crossfade quality over every codec/provider, or exact sample-gapless and bit-perfect/exclusive output.
- Provider-specific streaming/playlist extractor reliability, which can change independently of MyRiff.
- Full interactive accessibility testing or all platform-specific media-key behaviors.
- Code signing/notarisation. Windows/macOS packages may show platform security prompts.

A green package build plus a startup smoke test is a meaningful release gate, not proof that every advanced feature is manually validated.
