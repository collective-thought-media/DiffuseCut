# DiffuseCut E2E Agent Playbook

Use this document in a **fresh Cursor chat** with a high-capability model to drive DiffuseCut end-to-end as a real user. The goal is representative coverage: touch every major surface once, fully generate **1 character sheet**, **1 location plate**, **1 to 2 storyboard stills**, **1 to 2 LTX video renders**, and **one final export**, then review output quality.

Do **not** modify existing dev fixtures (Lisa, Demon's Ascent, or other personal test projects). Always create a new isolated eval project.

---

## Prerequisites

1. **Repo:** DiffuseCut at this workspace root.
2. **Dev server:** `npm run dev` on port **3004** (includes the background worker).
3. **Doctor:** `npm run doctor` should pass app deps (Node, app data dir). FFmpeg and ComfyUI warnings are OK until export/render phases.
4. **ComfyUI:** Reachable from Settings or project endpoints (for example `http://127.0.0.1:8188`). Needs SDXL checkpoint, LTX 2.3 I2V nodes/models for the deep path.
5. **Time:** Representative run often takes **30 to 90 minutes** depending on GPU queue.

You restart local servers yourself when needed. Do not ask the operator to restart manually.

---

## Quick start (harness-first)

```bash
npm run doctor
npm run dev
npm run eval:journey
```

Reports land in `{appData}/eval-runs/{runId}/` with `report.json`, `report.md`, and `creative-pack.json`.

Flags:

```bash
npm run eval:journey -- --runner cursor --creative scripts/eval/default-creative-pack.json
npm run eval:journey -- --runner grokbot --creative path/to/grok-pack.json
npm run eval:journey -- --dry-run
npm run eval:journey -- --skip-export
npm run eval:journey -- --model "Claude Opus"
```

After the harness finishes, use **browser MCP** to fill the quality rubric in `report.md` by watching the export MP4 and Finishing preview.

---

## Architecture primer

| Layer | Role |
| --- | --- |
| Next.js App Router | UI and REST API (`src/app/api/`) |
| SQLite + Drizzle | Projects, shots, jobs, templates |
| Background worker | Polls asset generation, render, and export queues |
| ComfyUI | Character sheets, location refs, shot stills, LTX video |
| FFmpeg | Final mux and encode |

Project tab order: **Dashboard, Characters, Locations, Storyboard, Render, Finishing, Export, Settings**.

See [`doc/PROJECT-STATUS.md`](./PROJECT-STATUS.md) for feature-level QA notes.

---

## Creative content

**Option A:** Use [`scripts/eval/default-creative-pack.json`](../scripts/eval/default-creative-pack.json).

**Option B:** Invent an original 60 to 90 second story and save JSON matching [`scripts/eval/creative-pack.schema.json`](../scripts/eval/creative-pack.schema.json).

**Option C (Grokbot):** Send the prompt in [`scripts/eval/grok-creative-director.md`](../scripts/eval/grok-creative-director.md) via `grokbot_send`, save JSON, then `npm run eval:journey -- --runner grokbot --creative <path>`.

Portable content rules:

- No copyrighted characters, celebrities, or existing film titles.
- No em dashes or en dashes in user-facing strings.
- Character rear-angle prompts: inventory-style top-to-bottom details (hair, garments, boots). Avoid meta phrases like "back view", "from behind", or "camera behind".

---

## Surface checklist

The harness tracks surfaces defined in [`scripts/eval/surface-checklist.json`](../scripts/eval/surface-checklist.json). Target **90%+ touched**.

| Area | Harness | Agent browser gap-fill |
| --- | --- | --- |
| Projects, Setup, Settings | Playwright `eval-surfaces.spec.ts` | Re-check Setup after model installs |
| Dashboard | API patch logline/plot/style | Confirm visual style preset UI |
| Characters | API create + sheet generate (full image select only) | Expand angle panel UI only |
| Locations | API create + establishing generate | Open derived angle UI |
| Storyboard | API shots, reorder, placeholders | Animatic preview scrub |
| Render | API queue + poll | Render page video playback |
| Finishing | API trim + overlays | Score/dialog tabs, timeline preview |
| Export | API encode | Export page button state |
| Project settings | API storage | FPS and endpoint override UI |

---

## API index (most-used routes)

Base URL: `http://localhost:3004`

| Action | Method | Path |
| --- | --- | --- |
| Create project | POST | `/api/projects` `{ name }` |
| Update project | PATCH | `/api/projects/{id}` logline, plot, visualStyle |
| Create character | POST | `/api/projects/{id}/characters` |
| Update state look | PATCH | `/api/projects/{id}/characters/{cid}/states/{sid}` |
| Create angle | POST | `.../states/{sid}/angles` |
| Generate character sheet | POST | `.../angles/{aid}/generate-sheets` `{ count: 2, replace: true }` |
| Poll character batch | GET | `.../angles/{aid}/sheet-batch?batchId=` |
| Select character sheet | POST | `.../angles/{aid}/select-sheet` `{ optionId }` (full image only; do not use panel split) |
| Create location | POST | `/api/projects/{id}/locations` |
| Generate location ref | POST | `.../locations/.../generate-sheets` |
| Create shot | POST | `/api/projects/{id}/shots` |
| Update shot | PATCH | `/api/projects/{id}/shots/{shotId}` trim, renderOverridesJson |
| Reorder shots | POST | `/api/projects/{id}/shots/reorder` |
| Generate placeholder | POST | `/api/projects/{id}/shots/{shotId}/generate-placeholders` |
| Select placeholder | POST | `.../select-placeholder` |
| Hydrate render settings | GET | `/api/projects/{id}/render-settings?hydrate=1&templateId=builtin-ltx-i2v-v1` |
| Queue render | POST | `/api/render-jobs` `{ projectId, shotIds, workflowTemplateId }` |
| Poll render jobs | GET | `/api/render-jobs?projectId=` |
| Save overlays | PUT | `/api/projects/{id}/overlays` |
| Queue export | POST | `/api/export` `{ projectId, settings: { format: "mp4" } }` |
| Poll export | GET | `/api/export/{jobId}` |
| Generation stack | GET | `/api/projects/{id}/generation-stack` |
| Storage breakdown | GET | `/api/projects/{id}/storage` |

Integrate-in-scene still mode: PATCH shot `renderOverridesJson` to `{"stillReferenceMode":"integrate_in_scene"}` before generating placeholders (requires character and location references).

---

## Grokbot parallel track

Grokbot has **no in-repo DiffuseCut integration**. It is the **creative director only**.

1. `grokbot_list_agents` to find your bot.
2. `grokbot_send` with the prompt from [`scripts/eval/grok-creative-director.md`](../scripts/eval/grok-creative-director.md).
3. Validate JSON with `tsx -e "import { loadCreativePack } from './scripts/eval/creative-pack'; loadCreativePack('path')"` or run the harness (it validates on load).
4. Compare reports: `eval-runs/cursor-*` vs `eval-runs/grokbot-*`.

---

## Out of scope for eval pass (do not fail)

These are **in progress** or optional. Record in report notes only:

1. **Diptych / triptych panel split** (`Use this design (front + back)`, left/right panel crop, canvas expand to 16:9). Do not test or require this workflow. Select character references with `{ "optionId": "..." }` only (full image).
2. **Do not modify** Lisa, Demon's Ascent, or other existing dev fixture projects.

---

## Known product gaps (do not fail eval)

Record these in the report notes:

1. **Text overlays** preview in Finishing but are **not burned into FFmpeg export**.
2. **Export** requires at least one rendered shot with `videoPath`.
3. **Integrate in scene** and composited modes depend on ComfyUI compositing nodes; harness falls back to standard placeholders when unavailable.

---

## Pass criteria (representative eval)

**Must pass**

- `npm run doctor`: app deps green (ComfyUI + FFmpeg required for full run, not dry-run).
- `npm run eval:journey` completes without fatal error OR agent equivalent via API.
- Isolated eval project created (name contains `E2E Eval`).
- At least **1 character sheet** generated and selected (full panel, not split).
- At least **1 location** establishing reference generated and selected.
- At least **1 storyboard placeholder** generated and selected.
- At least **1 shot** rendered to MP4 via LTX (`builtin-ltx-i2v-v1`).
- At least **1 export** MP4 written under `{appData}/eval-runs/{runId}/`.
- Surface coverage **≥85%** touched (pending surfaces OK if documented with reason).
- Quality rubric filled in `report.md` after watching export.

**Optional (bonus, not required)**

- Second character sheet, integrate-in-scene placeholder, composited placeholder, ACE-Step score, Grokbot creative pack, Playwright UI pass.

---

## Suggested agent first message (Fable / frontier run)

```
You are running the DiffuseCut representative E2E eval.

Read doc/E2E-AGENT-PLAYBOOK.md first.

Rules:
- Create a NEW isolated project only. Never edit other projects already on the machine.
- Do NOT test diptych/triptych panel split or "Use this design (front + back)". That feature is in progress. Use full-image select-sheet only.
- Start with: npm run doctor && npm run eval:journey -- --runner fable --model "Fable"
- If the harness fails one step, fix or document, then continue manually via API/browser until export MP4 exists.
- Fill the quality rubric in the eval report when done.

Dev server should already be on http://localhost:3004 with worker. ComfyUI is the URL in Settings.
```

---

## Quality rubric (manual review)

After export, open the copied MP4 under `eval-runs/{runId}/` and fill `report.md`:

| Key | Question |
| --- | --- |
| characterIdentity | Do references match written look descriptions? |
| locationCoherence | Does the environment stay consistent? |
| shotComposition | Do stills respect cast, location, and prompts? |
| motionPlausibility | Are renders believable without heavy flicker? |
| audioSync | If audio was added, does preview stay aligned? |
| trimCorrectness | Does export honor Finishing trim in/out? |
| exportOverall | Watchability, pacing, artifacts, story clarity |

---

## Suggested agent first message (generic)

```
Read doc/E2E-AGENT-PLAYBOOK.md and execute the full representative eval.
Use npm run eval:journey unless I provide a custom creative pack.
Fill quality rubric in the report after reviewing the export.
Do not touch existing dev fixture projects.
```

---

## Related files

- Harness: [`scripts/eval/run-user-journey.ts`](../scripts/eval/run-user-journey.ts)
- Default story: [`scripts/eval/default-creative-pack.json`](../scripts/eval/default-creative-pack.json)
- Playwright surfaces: [`e2e/eval-surfaces.spec.ts`](../e2e/eval-surfaces.spec.ts)
- Project journal: [`doc/PROJECT-STATUS.md`](./PROJECT-STATUS.md)
