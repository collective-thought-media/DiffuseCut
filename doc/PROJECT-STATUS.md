# DiffuseCut — Project journal & QA status

Last updated: 2026-09-03  
Primary dev port: **3004**  
Reference test project: create a new local project for QA. Do not rely on another machine's database.

This document captures what we have built so far, what we learned while building it, and where we are in the linear pipeline walk (Dashboard → Export). It is meant for maintainers and future contributors, not end-user install docs (see root `README.md` for that).

---

## Product vision (why this exists)

DiffuseCut is a **local-first, open-source** pre-production and generation pipeline for AI filmmakers. The browser UI runs on the editing machine (`localhost:3004`). ComfyUI runs locally or on a LAN GPU host (for example `http://127.0.0.1:8188` or `http://your-comfy-host:8188`). FFmpeg handles final mux/export.

The design goal is **headless ComfyUI**: import API workflows once, bind nodes, then drive checkpoint/LoRA/prompt/render queue from DiffuseCut without opening the native ComfyUI UI for day-to-day work.

Storage is on disk under the user's app data folder (`~/Documents/DiffuseCut/` or `%USERPROFILE%/Documents/DiffuseCut/`), with optional per-project root override.

---

## Architecture (what we learned)

| Layer | Role |
|-------|------|
| **Next.js App Router** | UI + Route Handlers (API) |
| **SQLite + Drizzle** | Projects, shots, jobs, settings, workflow templates |
| **Background worker** | Polls render, asset-generation, and export queues (started with `npm run dev`) |
| **ComfyUI client** | REST (queue, history, upload, models) + WebSocket progress bridge |
| **FFmpeg** | Trim concat, audio mix, final encode |

Important design decisions we settled on early:

- **Frame-quantized timing** everywhere (not milliseconds). Shots, trims, overlays, and audio spans all use frames at project FPS.
- **Multi-endpoint ComfyUI**: JSON array of URLs at app and project level; worker picks first reachable host.
- **Explicit dependency checking** instead of silent failure (`/setup`, `npm run doctor`, Settings health panel).
- **Bundled workflow templates** for the happy path, plus import for custom ComfyUI graphs.
- **Server-side ComfyUI proxy** so the browser never talks to LAN ComfyUI directly (no CORS pain).

---

## Global app areas (outside a project)

### Projects (`/`)

| Item | Status | QA notes |
|------|--------|----------|
| Create / list projects | Built | Basic flow works |
| Project cards with rotating preview thumbnails | Built | Character, location, and storyboard image paths cycle like character cards |
| Navigate into project dashboard | Built | |

**QA confidence:** Medium. Thumbnail enrichment tested in unit tests; not manually verified on many projects.

### Setup (`/setup`)

| Item | Status | QA notes |
|------|--------|----------|
| Dependency checklist | Built | Node, npm, app data dir, FFmpeg, ComfyUI server |
| ComfyUI capability probes | Built | SDXL checkpoints, IP-Adapter, LTX 2.3 I2V, ACE-Step 1.5 |
| Score audio sources summary | Built | ACE-Step on ComfyUI, Epidemic Sound upload, optional ElevenLabs |
| Re-check + continue gate | Built | Only **app** deps block "Continue" |

**QA confidence:** Medium–high for structure; live ComfyUI probes depend on workhorse being up.

### Settings (`/settings`)

| Item | Status | QA notes |
|------|--------|----------|
| FFmpeg path override | Built | |
| ComfyUI endpoints (JSON array) | Built | Supports LAN workhorse |
| Default character sheet template | Built | |
| LLM prompt expansion (OpenAI / Ollama) | Built | Optional |
| Score generator preference | Built | Auto (ACE-Step → ElevenLabs), ACE-Step only, ElevenLabs only, upload only |
| ACE-Step checkpoint override | Built | Defaults to auto-detect `ace_step_1.5_turbo_aio.safetensors` |
| ElevenLabs API key | Built | Optional fallback |
| Import workflow templates | Built | shot_video, character_sheet, location_sheet |
| Diagnostic report copy | Built | |

**QA confidence:** Medium. Settings save/recheck wired; ACE-Step generation on workhorse needs end-to-end Finishing test.

---

## Linear pipeline: project tabs

Project navigation order (`ProjectNav`): **Dashboard → Characters → Locations → Storyboard → Render → Finishing → Export → Settings**.

We have been working roughly in this order. Below: what exists, what we QA'd in development, and what still needs a deliberate pass.

---

### 1. Dashboard (`/projects/[id]`)

**Built**

- Logline and plot with debounced autosave
- Visual style presets panel (project-wide look phrases)
- Reference aspect ratio panel (character/location sheet canvas sizing)
- Default FPS badge
- Step nav (prev/next) toward Characters

**QA confidence:** Medium. Autosave pattern is consistent with other pages; no deep regression pass.

**Remaining QA**

- Visual style actually flows into all generation prompts as expected
- Reference aspect ratio respected on character sheet and location outputs

---

### 2. Characters (`/projects/[id]/characters`)

**Built**

- Character list with state thumbnail cycling
- Character detail: identity, multiple **visual states** per character
- Reference media: upload, URL import
- **Character sheet generation** via ComfyUI (built-in txt2img template, batch options, SSE progress)
- Optional LLM prompt expansion
- Generation stack panel (endpoint, checkpoint, IP-Adapter availability)
- Select winning sheet → `reference.png`; discard candidates

**Bundled template:** `builtin-character-sheet-v1` (`templates/character-sheet/`)

**QA confidence:** Medium. Generation stack and sheet flow exist; full batch on workhorse not recently re-run in this chat.

**Remaining QA**

- Multi-option batch pick UX under load
- LLM expansion with OpenAI vs Ollama
- Video reference uploads on characters (if used)

---

### 3. Locations (`/projects/[id]/locations`)

**Built**

- Location list with state/angle preview thumbnails
- Location detail: story states → camera angles
- Establishing wide as anchor; derived angles after anchor exists
- **IP-Adapter workflow** when ComfyUI has nodes + weights (preferred)
- Fallback to txt2img when IP-Adapter unavailable (img2img legacy template deprecated in copy)
- Angle-aware prompt composition (macro, low angle, etc. adjust IP-Adapter weight/framing)
- Reference upload/import per angle

**Bundled templates:** IP-Adapter (`workflow-ipadapter.api.json`), legacy img2img

**QA confidence:** Medium. IP-Adapter install script exists for workhorse (`scripts/local-dev/install-ipadapter-workhorse.ps1`); in-app angle generation needs fresh pass.

**Remaining QA**

- Anchored angle quality vs establishing wide (composition independence)
- Setup page IP-Adapter warning when nodes missing
- First angle (no anchor) txt2img path

---

### 4. Storyboard (`/projects/[id]/storyboard`)

**Built**

- Frame-quantized timeline; drag-reorder shots
- Animatic preview (placeholder images/videos)
- Per-shot editor: title, motion prompt, duration in frames
- Shot cast editor (characters + visual states)
- Visual reference focus (location vs character)
- **Shot placeholder generation** (ComfyUI batch, multi-option, SSE)
- Prompt preview APIs

**QA confidence:** Medium. Core editing works; placeholder batch less recently exercised.

**Remaining QA**

- Reorder persistence and playhead after reorder
- Placeholder video vs image in animatic
- Cast + location refs reflected in generated placeholder prompts

---

### 5. Render (`/projects/[id]/render`)

**Built**

- Workflow template picker (default: **LTX 2.3 I2V**)
- Binding wizard / template validation
- Render settings: checkpoint, UNET, VAE, text encoder, resolution, negative prompt, GPU device
- Queue selected shots; dependency + binding validation before queue
- Live job progress (SSE + ComfyUI WebSocket bridge)
- Cancel jobs; shot `renderStatus` and `videoPath` updates
- Multi-endpoint ComfyUI support

**Bundled template:** `builtin-ltx-i2v-v1` (`templates/ltx-i2v/`)

**QA confidence:** High for **Demon's Ascent**: all 9 shots have `videoPath` under `renders/*.mp4`. Render page native `<video controls>` playback confirmed smooth.

**Remaining QA**

- Full LTX stack on a clean ComfyUI install (Setup warnings)
- Custom imported shot_video workflows
- Multi-GPU endpoint failover
- Long batch (10+ shots) worker stability

---

### 6. Finishing (`/projects/[id]/finishing`)

**Built (recent focus area)**

- Timeline preview: rendered MP4s when available, else storyboard placeholders
- **Hybrid playback fix**: native `video.play()` for rendered clips (timeline driven by `onTimeUpdate`); interval advance only for image-only shots. Fixes stutter/freeze that Render page did not have.
- HTTP Range support on media route for seeking
- **Trim overhaul**: visual in/out handles on timeline (`TrimShotClip`), compact trim inspector, row click sync, keyboard nudge, debounced PATCH (300ms)
- Drag-reorder shots on finishing timeline
- Three desk tabs:
  - **Text Overlays** — timed captions/credits (`OverlayEditor`), preview in UI
  - **Musical Score** — music tracks, span modes, upload, generate
  - **Dialog** — voiceover tracks (same editor layout, different copy/kind filter)
- Volume label: **Volume (0 to 1)** with live percent readout
- Title case on tab labels and section headings
- Audio: **ACE-Step 1.5 on ComfyUI**, **ElevenLabs** optional, **Epidemic Sound upload** always available

**QA confidence:** Medium–high for playback and trim (implemented + unit tests). Audio generation: ACE-Step wiring new; ElevenLabs path previously hit "no key" before ACE-Step was added.

**Remaining QA**

- Generate score via ACE-Step on workhorse end-to-end (full film span vs segment spans)
- Upload Epidemic Sound track + trim + preview sync
- Dialog tab ElevenLabs generate (sound-gen, not true TTS)
- Text overlay timing vs preview at scrub points
- Export handoff: trims + audio carried correctly (see Export)

**Known gap:** Text overlays preview in Finishing but are **not burned into export** yet (see Export).

---

### 7. Export (`/projects/[id]/export`)

**Built**

- Final bake to MP4 (H.264) or WebM
- Applies per-shot **trim in/out** from Finishing
- Mixes **audio tracks** from Finishing (`amix`)
- Async export job + progress polling
- Output under project `exports/`

**QA confidence:** Low–medium. Pipeline exists; not fully re-validated after Finishing trim/playback changes.

**Remaining QA**

- Full Demon's Ascent export with trims + musical score
- FFmpeg missing path / custom FFmpeg path from Settings
- Long timeline export memory/time
- **Text overlays in export** (not implemented in FFmpeg path — product gap)

---

### 8. Project Settings (`/projects/[id]/settings`)

**Built**

- Per-project FPS default
- ComfyUI endpoints override
- Character sheet template override
- Storage tools: orphan render file count/size, purge

**QA confidence:** Low–medium.

**Remaining QA**

- Purge orphans safety (only truly orphaned files)
- Endpoint override vs app default resolution

---

## Dependency & ComfyUI stack (Setup checklist)

What Setup now verifies against **bundled workflows** and Finishing:

| Check | Used for |
|-------|----------|
| ComfyUI server reachable | All generation |
| SDXL checkpoints | Character sheets, location sheets |
| IP-Adapter nodes + weights + CLIP vision | Anchored location angles |
| LTX 2.3 nodes + UNET/VAE/checkpoints | Default shot video render |
| ACE-Step 1.5 nodes + checkpoint | Finishing score generation |
| Score audio summary | ACE-Step / Epidemic upload / ElevenLabs |

Typical GPU host stack: ComfyUI with IP-Adapter, LTX 2.3, and ACE-Step 1.5 (`ace_step_1.5_turbo_aio.safetensors`).

---

## Built-in workflow templates

| ID | Purpose | Folder |
|----|---------|--------|
| `builtin-character-sheet-v1` | Character turnaround txt2img | `templates/character-sheet/` |
| `builtin-location-reference-ipadapter-v1` | Location angles from anchor | `templates/location-reference/` |
| `builtin-location-reference-img2img-v1` | Legacy (deprecated) | `templates/location-reference/` |
| `builtin-ltx-i2v-v1` | Shot video I2V | `templates/ltx-i2v/` |

ACE-Step: reference workflow at `templates/ace-step-music/workflow.api.json`; runtime graph built in `src/lib/services/ace-step-audio-generation.ts` (not seeded as DB template).

---

## Automated tests (unit)

Vitest covers core logic (not UI or live ComfyUI):

- Frame timing, trim clamp/validate, video sync
- Audio track span modes
- Project preview paths, location preview
- Prompt preprocess, visual style, shot composition
- Workflow builder references, render settings validation
- ComfyUI workflow requirement helpers, error formatting

**No E2E or API integration tests yet.**

---

## Session log (high-signal changes from recent development)

Chronological themes from building and hardening the app:

1. **Initial scaffold** — Next.js, SQLite, worker, ComfyUI client, dependency checker, MIT OSS direction.
2. **Headless ComfyUI** — Bindings, render settings, model/LoRA pickers, LAN endpoints, live render progress.
3. **Pre-production** — Characters, locations, states, sheets, IP-Adapter location angles.
4. **Storyboard** — Frame timeline, placeholders, cast/location refs on shots.
5. **Render** — LTX I2V default; Demon's Ascent full render completed.
6. **Finishing playback bug** — Root cause: storyboard-style `setInterval` + pause/seek on video. Fix: native video playback + `onTimeUpdate` sync (`FinishingPreview`, `video-sync.ts`, media Range headers).
7. **Project index thumbnails** — `previewPaths` on project cards.
8. **Trim desk overhaul** — Visual handles, timeline sync, debounced saves, compact inspector.
9. **Finishing tabs** — Text Overlays | Musical Score | Dialog (reverted modal approach).
10. **Setup dependencies expanded** — IP-Adapter, LTX, checkpoints, score sources.
11. **Score audio** — Epidemic Sound upload path + ElevenLabs optional + **ACE-Step on ComfyUI** with Settings provider preference.

---

## E2E eval harness

A representative full-user eval (isolated project, surface checklist, 1 to 2 LTX renders, final export, JSON/Markdown report) lives in [`doc/E2E-AGENT-PLAYBOOK.md`](./E2E-AGENT-PLAYBOOK.md). Run `npm run eval:journey` with the dev server and worker up; optional Grokbot creative packs via [`scripts/eval/grok-creative-director.md`](../scripts/eval/grok-creative-director.md). Reports: `{appData}/eval-runs/{runId}/`.

---

## QA summary matrix

Legend: **Done** = exercised and believed working · **Partial** = built but needs pass · **Untested** = not deliberately verified · **Gap** = known missing behavior

| Area | Built | QA | Notes |
|------|-------|-----|-------|
| Projects list + thumbnails | Yes | Partial | Unit tests only |
| Setup / doctor | Yes | Partial | Needs workhorse online |
| App Settings | Yes | Partial | ACE-Step prefs new |
| Dashboard | Yes | Partial | |
| Characters + sheets | Yes | Partial | |
| Locations + IP-Adapter | Yes | Partial | Workhorse-dependent |
| Storyboard | Yes | Partial | |
| Render + LTX | Yes | **Done** | Demon's Ascent 9/9 MP4s |
| Finishing preview | Yes | **Done** | Playback fix verified |
| Finishing trim | Yes | Partial | Unit tests + UI pass |
| Finishing overlays | Yes | Partial | Preview only |
| Finishing score (ACE-Step) | Yes | **Untested** | Wired this session |
| Finishing score (upload) | Yes | Partial | |
| Finishing dialog | Yes | Untested | ElevenLabs sound-gen |
| Export video+trim+audio | Yes | Untested | Post-finishing |
| Export text overlays | **Gap** | N/A | Not in FFmpeg pipeline |
| Project settings / purge | Yes | Untested | |

---

## Recommended QA order (what to test next)

Working left-to-right on **Demon's Ascent** (or a fresh clone project):

1. **Setup** — Re-check with workhorse URL; confirm ACE-Step + IP-Adapter + LTX lines green.
2. **Settings** — Score generator = Auto or ACE-Step; ComfyUI endpoint = workhorse.
3. **Characters / Locations** — One quick regen each if refs stale (optional).
4. **Storyboard** — Scrub animatic; edit one shot duration; confirm frame math.
5. **Render** — Queue one shot if testing changes (optional; batch already complete on Demon's Ascent).
6. **Finishing** — Sequential playback all 9 clips; trim in/out on 2–3 shots; debounce save; scrub while paused.
7. **Finishing → Musical Score** — Generate short segment via ACE-Step; upload Epidemic track on second track; verify preview mix.
8. **Finishing → Dialog** — Optional ElevenLabs generate if key present.
9. **Finishing → Text Overlays** — Add timed overlay; confirm preview only (expect no burn-in on export yet).
10. **Export** — Full MP4 with trims + score; verify duration and audio sync.
11. **Project Settings** — Purge orphans on a copy project only (destructive).

---

## Known gaps & future work

- **Burn text overlays into export** (FFmpeg drawtext or pre-render pass).
- **ProjectStepNav** skips Finishing in prev/next chain; full tab bar is correct — align or document.
- **True dialog/TTS** vs ElevenLabs sound-generation bed for Dialog tab.
- **Integration tests** for API routes and worker loops.
- **README workflow step** still says "Export — Trim, captions" but trim lives on Finishing; update when polishing docs.
- **Remove or hide deprecated** location img2img template when safe for in-flight users.
- **Open-source release prep**: LICENSE, contribution guide, screenshot/GIF demo, example project bundle (optional).

---

## Key file map (for contributors)

| Concern | Path |
|---------|------|
| Dependency checks | `src/lib/services/dependency-checker.ts` |
| ComfyUI client | `src/lib/services/comfyui-client.ts` |
| ACE-Step generation | `src/lib/services/ace-step-audio-generation.ts` |
| Score routing | `src/lib/services/score-audio-source.ts`, `audio-score-generation.ts` |
| Finishing trim | `src/lib/finishing/trim.ts`, `TrimShotClip.tsx`, `TrimEditor.tsx` |
| Finishing playback | `FinishingPreview.tsx`, `video-sync.ts` |
| FFmpeg export | `src/lib/services/ffmpeg-export.ts` |
| Worker | `worker/index.ts` |
| Builtin templates | `src/lib/db/seed-builtin-templates.ts`, `templates/` |
| Project nav | `src/components/project/ProjectNav.tsx` |

---

## Related docs

- Root `README.md` — install and prerequisites
- `templates/location-reference/README.md` — IP-Adapter install
- `scripts/local-dev/README.md` — maintainer ComfyUI helper scripts (not required for OSS users)
- Dark Lab registry: `../LOCAL-DEV-PROJECTS.md` (port 3004)

---

*This file should be updated as we complete QA passes and ship major features. After each pipeline section sign-off, update the QA matrix and "Recommended QA order" sections.*
