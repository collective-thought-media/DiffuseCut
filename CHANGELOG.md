# Changelog

## 0.1.0-alpha.1

First cut for a small tester group. Install from a fresh clone on any machine. App data, ComfyUI URL, and FFmpeg path are local to that install.

- First `npm start` pins the Next.js project root so a clone under the user home folder does not fail the production build.
- `npm start` runs `npm install` when project dependencies are missing. Next.js is an npm dependency, not a separate Windows install.
- SQLite uses `better-sqlite3` 12.9.0, which has Node 24 Windows prebuilds, so a current LTS install does not need Visual Studio C++ tools.
- First production build typecheck now passes. The export reveal helper is no longer an illegal route export.
- Setup re-reads the Windows PATH and looks in WinGet folders for FFmpeg, so a winget install does not stay missing until a new terminal.
- Character sheet Generate no longer looks selected-but-disabled. The shown ComfyUI model is saved, and a blocked button now says why.
- Storyboard shots use the current character-angle picture, not an older state-level sheet left behind after a regenerate.
- Developer mode no longer enables Turbopack by default. On Windows it was racing the client manifest after Next restarted, which 500'd every page into a white screen. `npm start` was never on that path. Use `npm run dev -- --turbo` only if you want the old bundler.
- The project still ratio (16:9, 9:16, 21:9, 2:1, or 1:1) now sets video output too. The Render tab width and height default to that canvas. You should not have to enter them again.
- `npm start` rebuilds after `git pull` when the last production build is from an older commit, so testers are not left on a stale app.

- Export honors the project output size and no longer depends on FFmpeg lavfi.
- Show in folder opens Explorer and selects the file.
- Storyboard packet export (stills plus shot notes) for outside video tools.
- Install clip attaches an outside video to a shot as the finished render.
- `npm start` launches the production local app (no Next.js developer overlay). Use `npm run dev` only while editing source.
