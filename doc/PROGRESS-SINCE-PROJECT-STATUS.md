# DiffuseCut — Progress since `PROJECT-STATUS.md`

Last updated: 2026-09-03 (evening)  
Continues from: [`doc/PROJECT-STATUS.md`](./PROJECT-STATUS.md)  
Reference test project: **Demon's Ascent** (`FpszjyqoP6T4V5NUzFW4A`, slug `demon-s-ascent-Fpszjy`)

This document captures the major work completed after the first project journal was written. It focuses on **Finishing sound effects**, **export UX**, and **pipeline polish** that turned DiffuseCut from a render-and-trim tool into something closer to a full AI filmmaking desk.

---

## Why this matters (product positioning)

DiffuseCut is built around a linear pipeline that most tools do not offer in one local app:

**Characters → Locations → Storyboard → Render (ComfyUI) → Finishing → Export**

Each stage feeds the next. ComfyUI is the execution engine on a LAN GPU box; DiffuseCut is the control surface. The goal is headless ComfyUI: bind workflows once, then generate sheets, placeholders, shot videos, score, SFX, and a final mux without opening the native ComfyUI UI for day-to-day work.

As of this session, Demon's Ascent exercises that full path: nine rendered LTX shots, a generated orchestral score (ACE-Step), per-shot SFX (Woosh), trim-aware preview, and a successful FFmpeg export to `exports/`.

---

## 1. Auto sound effects (Finishing)

### Architecture locked in

| Concern | Approach |
|---------|----------|
| **Musical score** | ACE-Step on ComfyUI (primary) |
| **Sound effects** | ComfyUI-Woosh first, ElevenLabs fallback |
| **SFX must not use ACE-Step** | ACE-Step is score-only; it produces musical output, not foley |

### What we built

- **Per-shot SFX tracks** on Finishing (`ShotSfxEditor`): one SFX track per storyboard shot, linked by `targetShotId` and `single_shot` span mode.
- **Shot-derived prompts at generate time** (`resolve-sfx-generation-prompt.ts`): cues rebuilt from the linked shot title + prompt every time you hit Generate, not stale text from an old batch.
- **Ranked cue extraction** (`shot-sfx-suggest.ts`): hero events (lightning, explosions) beat generic foley; weather and ambience as support; up to three concrete cues in the brief.
- **Batch generate** (`shot-sfx-batch.ts`, API `POST .../audio/sfx/batch`) wired the same way as single-track generate.
- **Woosh ComfyUI integration** (`comfy-woosh-generation.ts`, `scripts/woosh/comfy-t2a-workflow.json`): queue T2A on port 8188, download MP3, fit to shot duration.
- **Lightning shots get a strike layer**: separate impulsive crack + rain/wind bed, composited with FFmpeg. Woosh alone often produced sustained noise, not a bolt; a short synthetic crack layer guarantees an audible strike at frame zero.
- **Preview mix improvements** (`FinishingPreview.tsx`): score ducks to ~42% while an SFX track is active; audio elements remount when `filePath` or `updatedAt` changes (fixes stale cached clips after regenerate).

### Workhorse / ComfyUI fixes (GPU box)

- Woosh model junction: `app/models/woosh` → `models/woosh` when Comfy scanned the wrong folder.
- Workflow MP3 quality node: invalid `192k` → `320k`.
- `force_offload: true` broke back-to-back generations; set to `false`.
- Direct test script: `scripts/local-dev/woosh-direct-test.mjs` (verified door creak, UI swoosh, lightning prompts independently of the app).

### Tests added

- `src/lib/__tests__/shot-sfx-suggest.test.ts`
- `src/lib/__tests__/resolve-sfx-generation-prompt.test.ts`

### QA notes (honest)

- **Refresh ≠ regenerate.** Playing in Finishing replays files on disk; only Generate creates new audio.
- Export audio timing for SFX on shots 2–9 still uses input seek, not timeline delay (see gaps below). Preview is more accurate than export for SFX placement.
- Per-track volume (0.85 on SFX) applies in preview, not yet in FFmpeg `amix`.

---

## 2. Export page rebuild (encoder-style UX)

The old Export page showed **"Export started."** and stopped. Root cause: API returned `{ job }` but the UI polled for `data.jobId`, so progress never updated even while the worker finished in the background.

### What we built

- **Polling fix**: API now returns `{ job, jobId }`; UI polls `GET /api/export/[id]` every 750ms until complete or failed.
- **Progress in the worker** (`ffmpeg-export.ts` + `worker/index.ts`): trim shots → encode concat → mix audio, with `progress`, `progressMessage`, `currentFrame`, `totalFrames`, and `previewFramePath` written to `export_jobs`.
- **DB migration**: new columns on `export_jobs` for progress message, preview frame path, frame counters.
- **Frame previews during export**: JPEG snapshots every 10 frames (stored under `.diffusecut/export-previews/{jobId}/`), served via the media API.
- **AME-style UI** (`ExportEncoderPanel.tsx`):
  - Queue panel with status badge (Waiting / Encoding / Complete / Failed)
  - Progress bar + percentage + stage label
  - Frame counter (e.g. Frame 240 of 624)
  - Live preview thumbnail while encoding; final video player when done
  - **Open file** and **Show in folder** (`POST /api/export/[id]/reveal`) for Windows Explorer / default app
- **Resume on page load**: `GET /api/projects/[id]/export` lists recent jobs; page reconnects to a running or last completed job.

### Verified on Demon's Ascent

- Full export ~26s MP4 with all nine trimmed shots and mixed audio (`exports/export-*-audio.mp4`).
- FFmpeg 8.1.1 on PATH; worker auto-started via `npm run dev`.

---

## 3. Navigation and settings cleanup

- **Removed Settings from project tab bar** (`ProjectNav.tsx`). App-wide Settings remain in the top-right header (`/settings`).
- Per-project settings page (`/projects/[id]/settings`) still exists for ComfyUI endpoint overrides and storage tools; Render links there when needed.

---

## 4. Other fixes touched this session

- **Settings health recheck** after save (without breaking CSS on failed compile races).
- **Dev server / worker restarts** after pipeline changes (port 3004 per Dark Lab registry).
- **UI copy rule**: no em/en dashes in user-facing strings (`src/app/`, `src/components/`).

---

## Reference project state (Demon's Ascent)

| Item | State |
|------|--------|
| Shots | 9 / 9 rendered (`render_status: done`, MP4 under `renders/`) |
| Timeline | 624 frames @ 24 fps (~26 s) |
| Musical score | 1 track, ACE-Step generated |
| SFX | 9 per-shot tracks; shots 4 & 5 include lightning strike layer (regenerated with synthetic crack) |
| Export | At least one successful `export-*-audio.mp4` in `exports/` |
| ComfyUI | URL from Settings (default `http://127.0.0.1:8188`) |

Project files on disk: `%USERPROFILE%/Documents/DiffuseCut/projects/{slug}/`

---

## Known gaps (still open)

1. **Export SFX timeline sync** — FFmpeg uses `-ss` on audio inputs as file seek, not timeline placement; shots after shot 1 can be mis-timed vs Finishing preview. Needs `adelay` / `apad` per track.
2. **Export per-track volume** — `track.volume` ignored in `amix`; preview ducking not baked.
3. **Text overlays** — preview only; not burned into export (unchanged from prior doc).
4. **Woosh lightning quality** — hybrid synthetic crack + Woosh bed is a workaround; prompt/model tuning continues later.
5. **ProjectStepNav** — still skips Finishing in prev/next chain (full tab bar is correct).

---

## Key files added or heavily changed

| Area | Path |
|------|------|
| SFX suggest + lightning | `src/lib/services/shot-sfx-suggest.ts` |
| SFX generate pipeline | `src/lib/services/sfx-audio-generation.ts`, `resolve-sfx-generation-prompt.ts` |
| Woosh Comfy client | `src/lib/services/comfy-woosh-generation.ts` |
| Strike composite / synthetic crack | `src/lib/services/audio-score-generation.ts` |
| SFX UI | `src/components/finishing/ShotSfxEditor.tsx` |
| Export encoder UI | `src/components/export/ExportEncoderPanel.tsx` |
| Export progress + previews | `src/lib/services/ffmpeg-export.ts` |
| Export reveal (open folder) | `src/app/api/export/[id]/reveal/route.ts` |
| Project export jobs list | `src/app/api/projects/[id]/export/route.ts` |
| Woosh workflow | `scripts/woosh/comfy-t2a-workflow.json` |
| Woosh direct test | `scripts/local-dev/woosh-direct-test.mjs` |

---

## Suggested next steps

1. Fix export audio graph: timeline delays, volumes, optional score ducking to match Finishing preview.
2. Burn text overlays into export (FFmpeg `drawtext` or pre-render pass).
3. End-to-end QA checklist on a second project (not only Demon's Ascent).
4. Demo video / README GIF showing the full pipeline for open-source launch.
5. Continue Woosh SFX quality pass (ElevenLabs strike fallback when key present).

---

## Related docs

- [`doc/PROJECT-STATUS.md`](./PROJECT-STATUS.md) — full pipeline journal and QA matrix (baseline)
- [`README.md`](../README.md) — install and prerequisites
- [`scripts/local-dev/README.md`](../scripts/local-dev/README.md) — workhorse helper scripts
- Dark Lab dev registry: [`../LOCAL-DEV-PROJECTS.md`](../../LOCAL-DEV-PROJECTS.md) (DiffuseCut port **3004**)

---

*Update this file when the next major feature block lands (export audio sync, overlay burn-in, or public release prep).*
