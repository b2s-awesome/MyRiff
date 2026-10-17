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

5. When successful, the Windows NSIS installer and ZIP are written to `release\`. The script records output in `myriff-build.log` and stops at the first failed step.

The first build requires internet access so npm can download dependencies. If npm reports `EAI_AGAIN`, `ENOTFOUND`, `ECONNRESET`, or a registry timeout, fix the network/DNS/proxy issue and rerun; do not treat a source archive as an installed application.

## Build without local npm access: GitHub Actions

The repository includes a workflow that resolves one npm dependency graph, uploads the generated lockfile as the `dependency-lock` artifact, validates the source, and produces native packages for Windows, macOS, and Linux. Because the source archive has no committed lockfile, the workflow generates it once per run and shares that exact lockfile across the validation and platform jobs.

1. Create a GitHub repository and upload the **contents** of this folder.
2. Open **Actions → Build MyRiff → Run workflow**.
3. Wait for the `Validate source` job and all three platform build jobs to finish.
4. Download `myriff-windows`, `myriff-macos`, or `myriff-linux` from the completed workflow run's **Artifacts** section.
5. To publish a GitHub Release with all three platforms, push a version tag such as `v0.2.0`. The workflow attaches the generated packages to that release.

GitHub Actions is the recommended path when the development machine cannot reach npm's registry. A successful source test alone does not prove the full app builds; the workflow runs syntax checks, tests, a TypeScript typecheck, a renderer/main build, and electron-builder packaging before publishing artifacts. The generated lockfile is also attached to tagged releases for later reproducibility.

## Local commands

- `npm install --no-audit --no-fund` — download dependencies.
- `npm run lint:source` — source structure and preload IPC sanity checks.
- `npm run lint:syntax` — TypeScript/TSX syntax transpilation.
- `npm run verify` — runs source checks, tests, typecheck and a renderer/main build.
- `npm test` — lightweight project regression tests.
- `npm run typecheck` — TypeScript validation.
- `npm run dev` — launch development mode.
- `npm run dist:win` — Windows installer and ZIP.
- `npm run dist:mac` — macOS DMG and ZIP (run on macOS).
- `npm run dist:linux` — Linux AppImage, deb, and tarball (run on Linux).

## Build status and limitations

MyRiff pins its direct dependencies, but a committed `package-lock.json` is still required for fully repeatable dependency resolution; this archive could not generate one because the npm registry was unreachable during preparation. MyRiff uses native `better-sqlite3`, so native modules must be rebuilt for Electron's runtime. Use the provided scripts/workflow rather than copying a `node_modules` folder from another OS. macOS packages are unsigned unless signing credentials are configured; Windows packages are not code-signed by default. Smart recommendations currently use local metadata heuristics, and some audio transitions/editor controls remain partial as documented in `FEATURE-ROADMAP.md`.
