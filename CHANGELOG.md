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
- Dual reference no longer copies the character sheet's empty studio background over the location. Auto and Integrate in scene remain the modes that lock the saved location plate.
- Closer location angles keep the establishing set layout instead of inventing a new room that only shares the mood. Close-up prompts no longer inject temple-staircase language into every location.
- Location angles can punch in from the establishing plate with an optical crop and scale. Same room pixels, tighter framing, no diffusion.
- Fresh projects prefer Krea 2 turbo for stills when that UNET stack is installed on ComfyUI and the project has not locked an SDXL checkpoint yet.
- Shot stills with a character reference image no longer inject the state's look description or wardrobe lock text, so an old redhead / dress paragraph cannot override a regenerated dragon sheet. The newest front angle is preferred when several front angles exist.
- Visual reference on the storyboard shows the exact character and location image files sent to ComfyUI, so a stale sheet is obvious when prompt and negatives cannot override IP-Adapter.
- Shot cast reference resolution no longer drops nested character angles and falls back to a leftover state-level image path.
- Integrate / Dual shot prompts no longer force "one person" or "human scale," and when a character sheet is attached they lock species and body plan to that reference so a dragon sheet is not overwritten by a human-sounding name.
- Saving a Front character reference clears other Front angles in that look, so an older redhead sheet cannot keep competing with the one you just accepted.

- Export honors the project output size and no longer depends on FFmpeg lavfi.
- Show in folder opens Explorer and selects the file.
- Storyboard packet export (stills plus shot notes) for outside video tools.
- Install clip attaches an outside video to a shot as the finished render.
- `npm start` launches the production local app (no Next.js developer overlay). Use `npm run dev` only while editing source.
