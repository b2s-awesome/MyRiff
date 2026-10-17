# Building MyRiff

## Windows: build an installer locally

1. Install **Node.js 22 LTS** from <https://nodejs.org/>.
2. Extract the complete `MyRiff` project folder to a normal writable directory (not inside a ZIP).
3. Open PowerShell in that folder.
4. Run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\Build-MyRiff-Windows.ps1
   ```

5. After the build passes, find the NSIS installer and ZIP in `release\`.

The first build requires internet access so npm can download dependencies. If npm reports `EAI_AGAIN`, `ENOTFOUND`, `ECONNRESET`, or a registry timeout, fix the network/DNS/proxy issue and rerun.

## Build without local npm access: GitHub Actions

The `Build MyRiff` workflow resolves one dependency lockfile and shares it across source validation and all platform jobs. After a push to `main` passes validation, packaging and startup checks for **all three platforms**, the workflow commits that same lockfile to the repository. When package manifests change, CI updates the lockfile but only persists it after the complete build matrix succeeds.

The workflow produces a Windows NSIS installer, a macOS DMG, and Linux AppImage/DEB/tarball packages. Each platform job launches the packaged executable in a clean temporary profile and checks that the renderer root and preload API initialise; Linux runs under Xvfb. These are startup smoke tests, not substitutes for listening tests with physical audio devices.

1. Open **Actions → Build MyRiff → Run workflow** or push a commit.
2. Wait for **Validate source** and all three platform jobs to finish.
3. Download `myriff-windows`, `myriff-macos`, or `myriff-linux` from the completed run's **Artifacts** section. Artifacts contain installable deliverables rather than the unpacked app directory.
4. To publish a GitHub Release with the packages, push a version tag such as `v0.2.0`; the release job attaches the generated packages.

GitHub Actions is the recommended route when the development machine cannot reach the npm registry.

## Local commands

- `npm install --no-audit --no-fund` — install dependencies and update the lockfile if needed.
- `npm run lint:source` — source structure and preload IPC sanity checks.
- `npm run lint:syntax` — TypeScript/TSX syntax transpilation.
- `npm run verify` — source checks, tests, typecheck and renderer/main build.
- `npm test` — project regression tests.
- `npm run typecheck` — TypeScript validation.
- `npm run dev` — launch development mode.
- `npm run dist:win` — Windows installer and ZIP (run on Windows).
- `npm run dist:mac` — macOS DMG and ZIP (run on macOS).
- `npm run dist:linux` — Linux AppImage, DEB and tarball (run on Linux).
- `npm run smoke:packaged` — verify the built app's renderer and preload startup after a platform `dist` command; Linux should run it under Xvfb or a graphical session.

## Platform caveats

- MyRiff does not bundle yt-dlp or FFmpeg in the source archive; configure their paths or install them separately.
- macOS artifacts are unsigned unless signing credentials are configured; Windows installers are not code-signed by default.
- Portable data mode requires a writable data directory next to the executable.
- Local Radio recommendations use metadata heuristics; public provider playlist extraction can change with third-party services.
- See `FEATURE-ROADMAP.md` for advanced audio, OS integration and editor capabilities that still need further implementation or runtime testing.
