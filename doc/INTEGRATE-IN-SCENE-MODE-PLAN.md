# Plan: Integrate in scene (third reference mode)

Last updated: 2026-09-05  
Related: `doc/COMPOSITED-SHOT-PIPELINE.md`, `doc/USER-CONTROLLED-PROMPTS.md`, `templates/shot-composite/workflow-scene-integrate-inpaint.api.json`

> **Status 2026-09-05: Phase 1 and Phase 2 are implemented.** Integrate in
> scene now routes to `builtin-shot-scene-integrate-inpaint-v1`, a masked
> inpaint on the location plate built from core ComfyUI nodes (`SolidMask`,
> `MaskComposite`, `FeatherMask`, `SetLatentNoiseMask`). The subject region is
> the only area denoised (default 0.9; mid-range values leave a translucent
> half-formed subject), so plate geometry outside the mask is pixel-locked and
> the mask box explicitly controls subject scale and placement. Feather stays
> thin (8% of box width) because feathered pixels partially denoise and read
> as ghosting when the band is wide. Per-shot **Subject size** (small / medium / large) and **Subject
> position** (left / center / right) presets live in
> `src/lib/shot-render-overrides.ts` and drive the mask through
> `src/lib/integrate-subject-mask.ts`; the worker sizes the mask against the
> real plate dimensions (`src/lib/services/image-dimensions.ts`). The
> character IP-Adapter runs as **style transfer** (0.6 weight / 0.55 end) so
> the casting reference's pose and composition never dictate the shot pose (a
> crouched reference otherwise forces a crouch into every still); the casting
> sheet supplies identity without dictating composition, and the integrate
> prompt suffix carries lens/camera parity and natural-scale language. The
> The mask box adds 22% headroom above the nominal subject height (a hard top
> edge at head height makes the model crouch the figure or smear the face into
> the feather band). Integrate prompts strip the default establishing-view
> framing line (it invites empty scenery inside the mask), add
> subject-presence language, and drop casting-pose negatives that punish plain
> standing. After the sampler, two finishing stages run inside the same
> graph. First, a subject re-composite (rembg human segmentation on the
> decoded frame, eroded 2px + blurred 6 so no background rim survives,
> `ImageCompositeMasked` onto the original plate) discards everything the
> model invented inside the mask box except the subject; without this,
> framing-sized mask boxes (medium shot / close-up) cover most of the frame
> and the model repaints a second, mismatched background that reads as a
> superimposed panel over the real plate. Second, a harmonization inpaint
> re-diffuses the subject plus a band of surrounding plate (subject mask
> grown 20px, blurred 24, `SetLatentNoiseMask`, denoise 0.3) so diffusion,
> not alpha blending, paints the boundary: matching light, contact shadow,
> ground reflection, and real hair edges on the true plate. The raw cutout
> otherwise reads as green-screen compositing with a glow outline. The
> harmonization sampler must use the plain checkpoint model, not the
> IP-Adapter-wrapped one: injecting reference features at low denoise smears
> faces. Plate pixels outside the grown band stay locked. The Phase 2 mask
> is the center-anchored feathered box option; depth-based masks and
> ControlNet depth (Phase 4) remain future work.
>
> **Scene edit mode** (`scene_edit`, `builtin-shot-scene-edit-qwen-v1`) now
> exists alongside this pipeline and is the recommended mode when the
> character must interact with the scene (open a door, touch objects, be
> occluded by set pieces). It sends the location plate and character
> reference into Qwen Image Edit 2511 (Lightning 4-step LoRA, CFG 1.0) with
> the shot prompt wrapped as an edit instruction; no IP-Adapter, masks, or
> re-compositing. The SDXL integrate pipeline above remains for hosts
> without the Qwen models. Note: unscaled fp8 Qwen builds
> (`qwen_image_edit_fp8_e4m3fn.safetensors`) silently output noise on
> current ComfyUI (apply_rope regression); use the 2511 fp8mixed build.
>
> **Post-processing for finished stills.** Three optional follow-ups now exist
> on shot candidates. (1) A **face detail pass**
> (`builtin-shot-face-refine-v1`): when the Visual reference panel's Face
> detail control is set to refine, every base render chains a FaceDetailer
> stage (ComfyUI-Impact-Pack + Impact-Subpack, `bbox/face_yolov8m.pt`
> detector) that crops each detected face, upscales it, re-diffuses at 0.45
> denoise with a plus-face IP-Adapter carrying the character reference, and
> pastes it back; only the refined result is selectable. Requires the Impact
> Pack nodes on the ComfyUI host, otherwise the pass is skipped with a
> warning. (2) An **instruction edit** (`builtin-shot-image-edit-qwen-v1`):
> any completed candidate can be re-run through Qwen Image Edit with a typed
> instruction (fix sign text, remove an object) that becomes a new pack;
> the suffix pins everything not named in the instruction. (3) **Send to
> ComfyUI**: copies the candidate PNG into the ComfyUI input folder for
> custom workflows; the PNG also embeds its generating graph, so dragging it
> into the ComfyUI browser tab reconstructs the workflow.

---

## 1. Goal

Add a third storyboard still mode for shots that have **both** character and location references, aimed at **narrative frames** where the subject must feel inside the environment (shared lighting, depth, edges born from one diffusion pass), not pasted on top of it.

**Keep the existing Composited label unchanged:**

> **Composited (location plate + character)**

That name accurately describes the paste pipeline (isolate, cutout, stack, blend). Users who pick it should expect a set-accurate plate with a superimposed subject. Good for talking heads, presenter frames, and layout-locked thumbs when the 2D look is acceptable.

**New mode (working title):**

> **Integrate in scene (location plate)**

Shorter UI option if needed: **Integrate in scene**.

---

## 2. Mode comparison (user-facing)

| Mode | UI label | What happens | Best for |
|------|----------|--------------|----------|
| **Dual** | Character and location (dual IP-Adapter) | Single **txt2img** pass. Both refs via IP-Adapter. Environment and character invented together. | Fast exploration, loose set fidelity |
| **Composited** | Composited (location plate + character) | **Two-stage paste:** isolate on studio backdrop → rembg cutout → paste on plate → integration img2img. | Exact plate geometry, presenter / thumb look |
| **Integrate in scene** (new) | Integrate in scene (location plate) | Single **img2img** pass: location angle encoded to latent, partial denoise, character IP-Adapter, full shot prompt. No PNG paste. | Storyboard stills that should feel inhabited |

None of these solve full **3D interaction** (occlusion, hands on props, walking behind objects). Integrate in scene is the latent-native option within current SDXL + IP-Adapter tooling.

---

## 3. Technical baseline (already in repo)

Composited mode **already falls back** to location-plate img2img when compositing nodes are missing:

- Template: `builtin-shot-location-plate-v1`
- File: `templates/shot-composite/workflow-location-plate.api.json`
- Graph: `LoadImage` location plate → `VAEEncode` → `KSampler` (default denoise 0.42) + character `IPAdapterAdvanced` + shot prompts → `SaveImage`

Integrate in scene **promotes this graph to a first-class mode** with narrative-focused defaults, UI copy, and a roadmap for inpaint/depth upgrades. It is not a duplicate of Dual: Dual starts from empty latent; Integrate starts from **the saved location plate latent**.

---

## 4. Architecture

### 4.1 Reference mode enum

Extend `ShotStillReferenceMode` in `src/lib/services/shot-still-reference-mode.ts`:

```ts
| "integrate_in_scene"  // new
```

Extend `ShotStillReferenceEffectiveMode` similarly.

**Availability:** Same gate as Composited: requires both `characterPath` and `locationPath`. If only one exists, degrade like other modes (character-only or location-only).

**Auto mode:** Leave **Auto → dual** unchanged for backward compatibility. Document that filmmakers doing narrative boards should pick **Integrate in scene** explicitly. Optional later: project-level default reference mode in render settings.

### 4.2 Routing (`resolveShotStillReferencePlan`)

When `effectiveMode === "integrate_in_scene"`:

| Flag | Value |
|------|-------|
| `useDualIpAdapter` | `false` |
| `useCompositingPipeline` | `false` (no isolate stage, no rembg) |
| `useIpAdapter` | `true` |
| `workflowTemplateId` | `BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID` |
| `characterPath` / `locationPath` | both set |
| `hasLocationReferenceForPrompt` | `true` |

`generationOptionsJson` additions:

```ts
stillReferenceMode: "integrate_in_scene"
locationPlateDenoise: number   // default TBD, start 0.42–0.52
integrateCharacterIpWeight?: number  // optional override
integrateCharacterIpEndAt?: number
keyLightDirection?: KeyLightDirection  // phase 2, shared with composited
```

### 4.3 Worker

**Single option row per variant** (not two-stage pipeline). Reuse existing asset generation path for location-plate template:

- Upload character reference + location plate (same as composited composite stage uploads, minus isolate PNG).
- `buildPortraitPayload` with `referenceUsage: "location_plate"` (already implemented in `workflow-builder.ts`).
- No `pipelineStage` character/composite split in `shot-asset-generation.ts` for this mode.

### 4.4 Prompt policy

Use **full shot prompt** (location context included), unlike character isolate which strips environment words.

Suggested positive suffix (integrate-only, visible in prompt preview):

- `subject generated in the same environment as the location reference, matching scene lighting and depth, on-location cinematic storyboard still, not a cutout composite`

Suggested extra negatives (integrate-only or merged when mode active):

- `pasted cutout, floating subject, green screen composite, sticker on background, hard cutout edges, mismatched lighting direction, flat superimposed figure`

Do **not** add these globally; scope to mode or user-visible shot extras per `USER-CONTROLLED-PROMPTS.md`.

### 4.5 Default tuning (starting point)

| Parameter | Composited paste (integration) | Integrate in scene (phase 1) |
|-----------|-------------------------------|------------------------------|
| Pass count | 2 (isolate + composite) | 1 |
| Location encoding | Blurred plate under paste | Full plate latent |
| Denoise | 0.48 on pasted composite | 0.42–0.48 on plate (tune on park/deli fixtures) |
| Character IP weight | ~0.62 on composite | ~0.55–0.65 on location plate |
| Location IP | N/A on paste path | Optional weak location IP on plate (phase 2 experiment) |

Tune against Character Test fixtures (City Deli, Park path) before shipping defaults.

---

## 5. UI / UX

### 5.1 Reference mode dropdown

File: `src/components/storyboard/ShotStillReferenceControls.tsx`

Add to `MODE_LABELS`:

```ts
integrate_in_scene: "Integrate in scene (location plate)",
```

Helper text when selected:

> Encodes your saved location angle and regenerates the frame with your shot prompt and character reference. The model paints the subject into the scene in one pass. No cutout paste. Softer set lock than Composited, more natural depth than Dual.

**Do not change** Composited helper text (already describes isolate + composite).

### 5.2 `listAvailableShotStillReferenceModes`

When both refs exist, push `integrate_in_scene` alongside `dual` and `composited`:

```ts
modes.push("dual", "composited", "integrate_in_scene");
```

Order in dropdown (recommended):

1. Auto
2. Integrate in scene (location plate)  ← narrative default we recommend
3. Composited (location plate + character)
4. Dual
5. Character / location / prompt only

### 5.3 Generation stack / dependencies

Integrate in scene requires:

- IP-Adapter stack (same as dual)
- **Does not** require rembg / compositing nodes

Show in System Status: ready when IP-Adapter + SDXL checkpoint available. No `compositingAvailable` gate.

### 5.4 Prompt preview

Label the merged prompt with effective mode so users see integrate-specific suffixes/negatives before queueing.

---

## 6. Phased implementation

### Phase 1: First-class location-plate mode (MVP)

**Scope:** Routing + UI + docs + defaults. No new ComfyUI graph.

| Task | Files |
|------|-------|
| Add enum + plan routing | `shot-still-reference-mode.ts`, `types/index.ts` |
| Persist mode on shot | `schema.shots.stillReferenceMode` (if not already string-flexible) |
| Enqueue single-stage batch | `shot-asset-generation.ts` |
| UI label + helper | `ShotStillReferenceControls.tsx` |
| Tests | `shot-still-reference-mode.test.ts` |
| Docs | This file + short section in `USER-CONTROLLED-PROMPTS.md` |

**Acceptance:** Park path + Lisa shot produces a still with no paste artifacts; subject feels more in-scene than Composited paste; plate trees/geometry mostly preserved at denoise ~0.42.

### Phase 2: Regional inpaint on plate (true “integrate” upgrade)

**Problem:** Full-frame img2img drifts set details at higher denoise; low denoise weakens pose/framing control.

**Approach:** New template `workflow-scene-integrate-inpaint.api.json`:

1. Load location plate (full resolution).
2. Build a **soft subject mask** (center-weighted ellipse, depth-based mask, or open-vocabulary bbox from shot prompt). No studio isolate stage.
3. `SetLatentNoiseMask` / inpaint sampling: denoise **inside mask only** (character region 0.55–0.75), preserve plate outside mask.
4. Character IP-Adapter on inpaint pass.

Optional: use location plate **depth map** (MiDaS / DepthAnything node) to bias mask vertical placement (feet on ground).

**Worker:** Still single stage per variant (one ComfyUI prompt).

**Dependencies:** Inpaint-capable KSampler path, mask nodes (may already exist from Essentials).

### Phase 3: Key light direction (shared metadata)

User or auto-suggested **key light from camera left/right/front/overcast** stored on:

- `location_angles.key_light_direction` (preferred, plate-wide), or
- per-shot override in `renderOverridesJson`

Inject into integrate (and optionally composited integration) positive/negative prompts. See discussion in composited session; park mismatch is the motivating fixture.

### Phase 4: Optional ControlNet depth (advanced)

Feed location plate depth to ControlNet on integrate inpaint pass so pose respects ground plane and foreground/background ordering. Higher install burden; optional dependency check like LTX.

---

## 7. What we explicitly will not claim

- Integrate in scene does **not** fix occlusion, contact with props, or subject path through 3D space.
- It is still a **single still**; movement through space is a video / multi-frame problem (LTX I2V, etc.).
- Composited paste remains the right tool when **pixel fidelity to the saved plate** matters more than dimensional realism.

---

## 8. Testing plan

| Fixture | Mode | Pass criteria |
|---------|------|---------------|
| City Deli + Lisa, front-facing | Integrate | Awning geometry stable; subject not rectangular; lighting direction improved vs paste |
| Park path + Lisa | Integrate | Tree line stable; no obvious superimpose edge; compare to Composited paste side-by-side |
| Same shots | Composited | Plate lock stronger; accept 2D look |
| Same shots | Dual | Faster; looser location |

Script: extend `run-composited-test.ts` or add `run-integrate-test.ts` with mode flag.

---

## 9. Documentation updates (when implemented)

| Doc | Change |
|-----|--------|
| `doc/USER-CONTROLLED-PROMPTS.md` | Three-way comparison: Dual / Composited / Integrate |
| `doc/COMPOSITED-SHOT-PIPELINE.md` | Cross-link; clarify Composited ≠ narrative default |
| `templates/shot-composite/README.md` | Location-plate template owned by Integrate mode |
| Root `README.md` | One paragraph on reference modes (portable, no private paths) |

---

## 10. Open decisions

1. **Default denoise** for integrate MVP: 0.42 (current location plate) vs 0.48 (more pose freedom, more set drift).
2. **Auto mode:** stay dual forever vs project setting “prefer integrate when both refs exist.”
3. **Phase 2 mask:** manual bbox UI vs heuristic center ellipse vs depth-only (no UI).
4. **Rename internal id:** `integrate_in_scene` vs `scene_integrate` (prefer full phrase for readability in JSON logs).

---

## 11. Summary

| Item | Decision |
|------|----------|
| Composited label | **Keep as-is** (accurate for paste workflow) |
| New mode name | **Integrate in scene (location plate)** |
| MVP technical path | Existing `workflow-location-plate.api.json`, single worker stage |
| Narrative vs presenter | Integrate = narrative; Composited = plate-locked / presenter |
| Next quality jump | Regional inpaint on plate (phase 2), then key light metadata (phase 3) |

Phase 1 is small (mostly routing and UI). Phase 2 is where the mode earns the name “integrate” versus “img2img on a plate.”
