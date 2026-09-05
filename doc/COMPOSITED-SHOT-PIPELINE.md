# Composited storyboard stills (multi-stage pipeline)

Last updated: 2026-09-04  
Related: `templates/shot-composite/README.md` (partially stale, see section 12), `doc/USER-CONTROLLED-PROMPTS.md`, `doc/INTEGRATE-IN-SCENE-MODE-PLAN.md`, `doc/SESSION-2026-09-04.md`

This document records work completed after the earlier 2026-09-04 session log: the full **Composited** shot reference mode (location plate + character on set), rembg-based subject cutout, worker and UI progress fixes, ComfyUI dependency gaps, and validation on a real character/location test project.

For narrative storyboard stills where the subject should feel inside the environment (not pasted on top), use **Integrate in scene** instead. See `doc/INTEGRATE-IN-SCENE-MODE-PLAN.md`.

---

## 1. What Composited mode does

When a storyboard shot has **both** a character reference and a saved location angle, the user can choose **Composited (location plate + character)** instead of dual IP-Adapter or location-only modes.

If ComfyUI exposes the required compositing node classes, DiffuseCut runs a **two-stage worker pipeline** (four option rows for a 2-variant batch):

| Stage | Template | Purpose |
|-------|----------|---------|
| 1. Character isolate | `builtin-shot-character-isolate-v1` | txt2img person on a neutral studio backdrop; location words stripped from prompt |
| 2. Composite + integration | `builtin-shot-composite-inpaint-v1` | Cut out subject, paste on blurred location plate, img2img integration pass |

If compositing nodes are **missing**, Composited still appears in the UI but routes to the **location-plate fallback** (`builtin-shot-location-plate-v1`): one graph, partial denoise on the location latent plus character IP-Adapter. That is not true paste compositing.

Detection: `isCompositingPipelineAvailable()` in `src/lib/services/compositing-pipeline.ts` probes ComfyUI `/object_info` for every class in `COMPOSITING_NODE_CLASSES` (`src/lib/compositing-defaults.ts`).

---

## 2. Composite workflow graph (current)

File: `templates/shot-composite/workflow-composite-inpaint.api.json`

Steps inside **one** ComfyUI prompt per composite option:

1. Load location plate, character reference, and character isolate PNG (uploaded by worker).
2. **Blur** location plate (`ImageBlur`, default radius 16, sigma 2).
3. **Scale** isolate (`ImageScale`, default 920×820, center crop).
4. **Segment subject** with rembg (`RemBGSession+` → `ImageRemoveBackground+`, model `u2net_human_seg`, provider **CPU**).
5. **Match color** to location plate (`ImageColorMatch+`, LAB space, default factor 0.78).
6. **Soften mask** (`MaskBlur+` amount 8 → `GrowMask` expand 4).
7. **Paste** (`ImageCompositeMasked` at x=212, y=20).
8. **Integrate** (`VAEEncode` → `KSampler` img2img, default denoise **0.48**, character IP-Adapter weight ~0.58–0.62 at runtime).
9. **Save** final still.

Bindings: `templates/shot-composite/bindings-composite-inpaint.json`

Defaults: `src/lib/compositing-defaults.ts` and `src/lib/services/shot-still-reference-mode.ts` (`generationOptionsJson` on each batch).

---

## 3. rembg replaces color-based masking (Pack 9 → Pack 11)

### Problem (Packs 3–9)

Earlier composite graphs used **`ImageColorToMask`** against white/gray backdrop colors. That failed in practice because:

- Character isolate outputs often had **tan/beige studio walls**, not pure white or gray.
- Tan trousers and tan backdrop collapsed into one color region.
- Result: **full rectangular paste** on the location plate (visible cutout), even when the pipeline ran both stages successfully.

### Fix

Removed the color-mask chain. Added:

- Node **40:** `RemBGSession+` (`u2net_human_seg`, `providers: "CPU"`)
- Node **41:** `ImageRemoveBackground+` (IMAGE + MASK outputs)
- Mask path: 41 → `MaskBlur+` (31) → `GrowMask` (25) → `ImageCompositeMasked` (20)
- Paste source: cutout **IMAGE** from node 41

CPU was chosen over CUDA after hangs on a multi-GPU host; CPU cutout is fast once onnxruntime is installed (~4s in ComfyUI after warm-up).

### Character isolate tuning (same period)

- Stronger isolate prompt suffix: flat light gray cyclorama, explicit negatives for street/storefront/tan walls (`src/lib/shot-pipeline-shared.ts`).
- IP-Adapter weight on isolate template lowered to **0.32** (`workflow-character-isolate.api.json`).
- Isolate still often renders **warm tan** backdrop despite prompts; rembg human segmentation handles that better than color keys.

---

## 4. ComfyUI dependency: rembg needs onnxruntime

### Symptom

Composite jobs **queued and never finished**. GPU idle. No ComfyUI error surfaced to DiffuseCut. Pack 10 ran ~15+ minutes until the test script timed out.

### Root cause

`rembg` Python package was present in ComfyUI's venv but **`onnxruntime` was not**. ComfyUI Essentials nodes (`RemBGSession+`, `ImageRemoveBackground+`) blocked indefinitely on first use.

Direct Python test on the GPU host:

```text
No onnxruntime backend found.
Please install rembg with CPU or GPU support:
    pip install "rembg[cpu]"
```

### Fix (operator / install script)

In **ComfyUI's** Python venv (not DiffuseCut's):

```bash
pip install "rembg[cpu]" onnxruntime
```

Then restart ComfyUI. First run downloads `u2net_human_seg.onnx` (~176 MB) to the user cache (e.g. `~/.u2net` or rembg cache path on Windows).

Updated: `scripts/local-dev/install-compositing-nodes-workhorse.ps1` now pip-installs `rembg[cpu]` and `onnxruntime` after Impact Pack requirements.

### Gap in app health checks

`dependency-checker.ts` verifies **node class names** only. It does **not** verify onnxruntime or rembg runtime. A host can show "Compositing ready" and still hang on first composite. **Follow-up:** optional rembg smoke check or install hint in System Status.

---

## 5. Validation history (Character Test / City Deli shot)

Internal test fixture used during development:

- Project: Character Test
- Shot: City street deli, `stillReferenceMode: composited`
- Script: `scripts/local-dev/run-composited-test.ts [label]` (reseed templates, enqueue 2 variants, poll, copy outputs to `scratch/composited-test/`)

| Pack | Notes | Visual result |
|------|-------|---------------|
| 1–2 | Dual IP-Adapter / early templates | Not composited |
| 3–6, 8–9 | `builtin-shot-composite-inpaint-v1` with color mask | Pipeline ran; **square tan cutout** |
| 7 | Location-plate fallback | No compositing |
| 9 | Color mask + mask blur 6, integration 0.48 | Pipeline ran; **total failure** visually |
| 10 | rembg workflow | **Hung** (missing onnxruntime) |
| **11** (`pack11-rembg-fixed`, batch `bWvv_6NngX7KopzX3iZsL`) | rembg + onnxruntime + CPU provider | **Success** (~75 s for 2 variants). Subject on real deli plate, bokeh, no rectangle cutout |

Outputs saved under `scratch/composited-test/pack11-rembg-fixed-bWvv_6NngX7KopzX3iZsL/`.

Smoke test script: `scripts/local-dev/test-rembg-cpu.mjs` (minimal ComfyUI rembg graph; use env `WOOSH_COMFY_URL` or default LAN ComfyUI URL).

Workhorse rembg Python test: `scripts/local-dev/test-rembg-workhorse.ps1` (copy to GPU host and run with ComfyUI venv Python).

---

## 6. Worker reliability and progress UX

### ComfyUI progress labels

New: `src/lib/asset-generation-status.ts`

- Maps ComfyUI executing node IDs to friendly labels (e.g. "Cutting subject out of background", "Integration pass (img2img)").
- `resolveShotOptionDisplayProgress()` shows Stage 1 status on the composite option card while Stage 2 is still queued.

### WebSocket vs poll

`worker/index.ts` was overwriting websocket status every 2s with generic "Generating on ComfyUI". Fixed to **preserve** detailed websocket messages and only fill generic text when stale.

### Stale and orphan job handling

Added in `worker/index.ts`:

| Constant | Value | Behavior |
|----------|-------|----------|
| `ASSET_ORPHAN_PROMPT_GRACE_MS` | 120 s | Prompt absent from queue and not in history → fail option |
| `ASSET_COMPOSITE_STAGE_TIMEOUT_MS` | 8 min | Running composite with no heartbeat → fail |
| `ASSET_DEFAULT_STAGE_TIMEOUT_MS` | 15 min | Other stages |

Covers ComfyUI restarts and infinite rembg hangs without silent stuck batches.

### Storyboard UI

- Per-option status with heartbeat age and stale warning on option cards (`ShotPlaceholderGenerator.tsx`, `use-shot-placeholder-batch.ts`).
- Removed duplicate amber banner / generate-button hint during generation (status lives on option cards only).

---

## 7. API and client error handling

| Change | File | Purpose |
|--------|------|---------|
| Safe JSON parse on non-JSON error bodies | `src/lib/parse-api-response.ts` | Fixes `Unexpected token 'I', "Internal S"...` when server returns plain text 500 |
| `HttpError` with status **409** | `src/lib/api-helpers.ts` | Duplicate batch enqueue |
| Throw 409 on replace conflict | `shot-asset-generation.ts`, `asset-generation-queue.ts`, `location-asset-generation.ts` | Client can show "batch already running" instead of opaque 500 |

---

## 8. Installing compositing on another machine

DiffuseCut **ships workflows** in `templates/shot-composite/` and seeds them via `seedBuiltinWorkflowTemplates()`. Users do **not** rebuild graphs in the ComfyUI UI.

They **must** configure their ComfyUI host:

### Required node classes

From `COMPOSITING_NODE_CLASSES`:

- `ImageCompositeMasked`, `ImageBlur`, `ImageScale`, `GrowMask`, `VAEEncode` (core ComfyUI or common packs)
- `RemBGSession+`, `ImageRemoveBackground+`, `MaskBlur+` (**ComfyUI Essentials** custom nodes)
- Same **IP-Adapter** stack as dual-reference shots (`ComfyUI_IPAdapter_plus`, SDXL plus weights, CLIP vision)

### Python (ComfyUI venv)

```bash
pip install "rembg[cpu]" onnxruntime
```

Restart ComfyUI after custom node and pip changes.

### Maintainer script

`scripts/local-dev/install-compositing-nodes-workhorse.ps1` (remote GPU host layout). Adapt `$AppRoot` for local installs or use `install-comfyui-local.ps1` as the starting point.

### Runtime probe

Point DiffuseCut at `http://127.0.0.1:8188` (or LAN URL) in Settings. Generation stack exposes `compositingAvailable: true` when all node classes are present.

---

## 9. Product limits (documented for scope)

### What compositing is good for

- Character **in front of** a location plate (storyboard still, shallow DoF).
- Locking set layout from saved location angle + identity from character sheet.
- Waist-up / medium / full-body **standing** on a backdrop-like relationship to the environment.

### What it is not good for (yet)

- **Environmental interaction**: hands on props, occlusion behind counters, sitting, depth ordering between subject and foreground objects.
- That needs layered plates, depth-aware compositing, or single-pass generation with acceptance of weaker character lock.

### Face / eye quality (deferred)

Front-facing composited shots expose classic SDXL eye artifacts (asymmetric pupils, crossed gaze). The integration img2img pass (denoise 0.48) can **rewrite** facial detail. Hosted image services often hide **CodeFormer / face inpaint / ADetailer** post-passes; DiffuseCut does not run those yet. GPU hosts may already have `FaceRestoreCFWithModel` (CodeFormer); wiring it into the composite workflow is a planned follow-up.

---

## 10. Operator scripts and restart

| Script | Purpose |
|--------|---------|
| `scripts/local-dev/run-composited-test.ts` | Enqueue composited batch, poll up to 15 min, save manifest + PNGs |
| `scripts/local-dev/test-rembg-cpu.mjs` | ComfyUI API rembg smoke test |
| `scripts/local-dev/test-rembg-workhorse.ps1` | Python rembg session test on GPU host |
| `scripts/local-dev/restart-comfy-workhorse.ps1` | Restart ComfyUI on remote host (copy to host `_agent` folder) |
| `scripts/local-dev/install-compositing-nodes-workhorse.ps1` | Impact Pack clone, pip deps, rembg/onnxruntime, node verification |

After worker changes, restart DiffuseCut dev (`npm run dev`, port **3004** per project registry).

After template JSON changes, reseed runs automatically via test script or app seed path so DB templates match files on disk.

---

## 11. File index (new or heavily modified)

| Area | Paths |
|------|-------|
| Composite workflow | `templates/shot-composite/workflow-composite-inpaint.api.json`, `bindings-composite-inpaint.json` |
| Character isolate | `templates/shot-composite/workflow-character-isolate.api.json` |
| Defaults / detection | `src/lib/compositing-defaults.ts`, `src/lib/services/compositing-pipeline.ts` |
| Isolate prompts | `src/lib/shot-pipeline-shared.ts`, `src/lib/services/shot-pipeline.ts` |
| Reference mode routing | `src/lib/services/shot-still-reference-mode.ts`, `shot-asset-generation.ts` |
| Progress labels | `src/lib/asset-generation-status.ts` |
| Worker | `worker/index.ts` |
| UI | `src/components/storyboard/ShotPlaceholderGenerator.tsx`, `use-shot-placeholder-batch.ts` |
| API errors | `src/lib/parse-api-response.ts`, `src/lib/api-helpers.ts` |
| Install | `scripts/local-dev/install-compositing-nodes-workhorse.ps1`, test scripts above |
| Tests | `src/lib/__tests__/shot-still-reference-mode.test.ts` |

---

## 12. Known gaps and follow-ups

1. **Update** `templates/shot-composite/README.md` (still describes color mask and integration denoise 0.38).
2. **Dependency checker:** detect rembg/onnxruntime or document mandatory pip step prominently in README.
3. **Face restore:** optional CodeFormer pass after composite for front-facing shots.
4. **Integration denoise:** tune down (0.30–0.35) when face visible to reduce eye drift.
5. **Negative prompts:** add eye anatomy terms for front-facing composited shots.
6. **Portable install doc** in root README for composited mode (currently only local-dev scripts and this file).
7. **Uncommitted changes** at time of writing: compositing/rembg/progress work may not be on git main until explicitly committed.

---

## 13. Quick test (any developer)

1. Install ComfyUI + Essentials + IP-Adapter + SDXL checkpoint (epiCRealism XL or similar).
2. `pip install "rembg[cpu]" onnxruntime` in ComfyUI venv; restart ComfyUI.
3. Run DiffuseCut; confirm compositing shows ready in System Status / generation stack.
4. Create shot with character + location references; set mode to **Composited**; generate.
5. Optional: `npx tsx scripts/local-dev/run-composited-test.ts my-label` on a project with composited shot configured.

Expected timing after rembg model cache warm-up: roughly **30–90 seconds per variant** (isolate + composite), not 15+ minutes.
