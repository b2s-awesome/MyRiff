# MyRiff build status

Last inspected: 2026-10-17.

## Previously verified on GitHub Actions

The completed package matrix at [run 39070481049](https://github.com/b2s-awesome/MyRiff/actions/runs/39070481049) passed:

- Dependency installation and production dependency audit.
- Source sanity, TypeScript/TSX syntax transpilation and regression tests.
- Full TypeScript typecheck and Electron/Vite renderer + main-process build.
- Windows NSIS/ZIP packaging, macOS DMG/ZIP packaging, and Linux AppImage/DEB/tarball packaging.

After the download scheduler was merged, [run 39071993319](https://github.com/b2s-awesome/MyRiff/actions/runs/39071993319) was also building against the updated main branch. Use the live run page for its final conclusion.

## New hardening work on this branch

- Packaged application smoke tests for Windows, macOS and Linux. The test waits for the renderer root and preload API to initialise and then requires a clean exit.
- Linux startup smoke tests use Xvfb.
- CI artifacts are narrowed to installable deliverables, not the whole unpacked application tree.
- A lockfile persistence job commits the dependency graph only after the full validation and three-platform package matrix succeeds.

Do not treat these new checks as passed until the branch's own GitHub Actions run completes green.

## Still not proven by CI

- Listening tests with local music files and physical audio outputs, including crossfade quality across codecs.
- Provider-specific stream/playlist extraction reliability, which can change independently of this application.
- Full automated UI interaction/accessibility coverage and upgrade/rollback validation.
- Code signing and notarisation. Windows and macOS packages may show platform security prompts.
- All features marked partial or planned in `FEATURE-ROADMAP.md`.

A green package build plus a startup smoke test is a meaningful release gate, but is not proof that every advanced feature has been manually validated.
