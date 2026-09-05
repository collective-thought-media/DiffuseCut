# User-controlled generation prompts

DiffuseCut is a creative tool. The person running it must be able to steer image and video output without fighting hidden defaults baked into the codebase.

## The problem with hardcoded negatives

Negative prompts are powerful. They tell the model what to avoid. When those strings live only in server code, the user cannot see them, edit them, or turn them off. The app looks broken: the positive prompt says one thing, the model does another, and there is no lever to pull.

A real failure mode we hit in development:

- A shot needed a **neutral gray studio backdrop** (location reference).
- The character reference sheet had a **beige textured wall** behind the subject.
- The system also injected a **global negative** that penalized gray/neutral backdrops (intended to stop character sheets from looking like gray reference layouts).
- Result: the model fought the gray background the user asked for. Output drifted beige or muddy. Nothing in the UI explained why.

That is not a model bug. It is a product bug caused by **invisible, inflexible prompt policy**.

## Design principle

**Do not hardwire aesthetic or scene-specific negative prompts** (or positive prompt fragments) that target one kind of look, backdrop, color, material, or style unless the user can inspect and override them.

Flexible systems expose prompt inputs. Rigid systems hide assumptions and surprise people later.

## What we do instead

Generation bias the user should control belongs in **settings they can read and change**:

| Layer | Where | Purpose |
|-------|--------|---------|
| Project default | Render settings, **Default extra negative prompt (still images)** | Optional baseline for the whole project |
| Per character state | Character Sheet Generator, **Extra negative prompt (this character sheet)** | Optional terms for one state's sheet batch |
| Per shot | Storyboard generation, **Extra negative prompt (this shot)** | Override or add terms for one frame |
| Preview | Prompt preview before queueing | Shows merged positive and negative text sent to ComfyUI |

Merging is explicit: base negatives from prompt building, then project extras, then per-entity extras (character sheet or shot). Nothing silent and scene-specific should reappear after the user clears their fields.

## Suggested extra negatives (copy-paste presets)

These are optional starting points. Paste into the field, tune for your character or shot, and use prompt preview before queueing. Do not negative traits you want in the positive prompt (for example, do not add `blonde hair` if blonde hair belongs in **Character identity**).

### Photo-real character sheet (casting portrait)

Photo-real projects (**Look: Photo-real cinematic**) already merge these terms into the built-in character sheet negative before your extras. You do not need to paste them unless you want to reinforce or extend the list.

Use **Extra negative prompt (this character sheet)** for shot-specific tweaks only. Do not negative traits you want in the positive prompt (for example, do not add `blonde hair` if blonde hair belongs in **Character identity**).

Full optional preset (overlaps baked-in defaults; paste only if you want extra reinforcement):

```
different person, another woman, face swap, inconsistent identity, generic model face, stock photo model, beauty campaign, soft glam makeup, clean polished look, sweet innocent expression, symmetrical doll face, influencer portrait, split screen, diptych, two panels, side by side, comparison sheet, multiple subjects
```

Terms that most often push toward a realistic casting face (use alone or mix in):

```
generic model face, stock photo model, beauty campaign, soft glam makeup, symmetrical doll face, influencer portrait
```

Layout-only subset when identity is fine but the canvas splits into two panels:

```
split screen, diptych, two panels, side by side, comparison sheet, multiple subjects
```

This preset improves realism and batch consistency. It does not hard-lock the same face across character states; each state is still independent txt2img until identity-anchored generation ships.

**Layout note:** Photo-real character sheets use a single casting portrait in the positive prompt (one person, one angle). Animation and stylized presets intentionally use a four-view turnaround in the positive prompt; only photo-real gets the split-panel and multi-subject negatives above.

## What may still live in code (narrow exceptions)

Some strings are not "creative taste"; they enforce **workflow shape** so a template produces usable assets:

- Layout guards (e.g. "not a four-view character sheet") when the product expects a single storyboard frame
- Shot-type guards tied to detected intent (rear view, macro detail) where the UI already reflects that mode
- Character-sheet background negatives **only when no location reference exists**, so txt2img sheets do not inherit random environments

Even these should stay **minimal**, **documented**, and **easy to relax** if they block legitimate work. Prefer user-visible fields when the tradeoff is aesthetic rather than structural.

## Guidelines for contributors and agents

1. **Never add global negatives** for colors, backdrops, materials, or style families (beige, tan, gray seamless, plaster, etc.) without a user-facing control.
2. **Never inject dual IP-Adapter or virtual-backdrop suffixes** that the user cannot see in prompt preview.
3. **Prefer opt-in** over opt-out: let the user add "avoid beige wall" if they need it, rather than forcing "avoid gray" on everyone.
4. **When fixing a bad output**, fix references, IP-Adapter order, or model choice before adding new hidden negatives.
5. **If you add prompt logic**, ensure prompt preview and generation use the same merge path so WYSIWYG holds.

## Why this matters for flexibility

Filmmakers use the same pipeline for different looks: gray seamless stages, warm practical interiors, exteriors, stylized sets. A hidden negative trained on one project's pain becomes another project's ceiling.

User control keeps DiffuseCut adaptable: swap checkpoint or Krea stack, tune IP-Adapter, add a line to the negative field, regenerate. No redeploy, no archaeology in `prompt-preprocess.ts`, no mystery beige.

## Storyboard reference modes (dual, composited, integrate)

**Auto / dual** runs one diffusion pass with character and location IP-Adapter. Location influence is weaker (typical location weight around 0.28). Good default when you want a single fast pass.

**Integrate in scene** (opt-in, requires both character and location references) encodes the saved location angle as an img2img latent, partial denoise (default 0.42), and character IP-Adapter. One pass paints the subject into the environment. No cutout paste. Best for narrative storyboard stills where the character should feel inside the set.

**Composited** (opt-in, requires both character and location references) locks the saved location angle as an img2img plate and applies character IP-Adapter for identity and wardrobe. Your shot prompt still drives pose and framing.

When ComfyUI has compositing nodes installed (`ImageCompositeMasked`, `MaskComposite`, `VAEEncode`, and related mask nodes), Composited mode runs a two-stage pipeline: character isolate on a neutral backdrop (location words stripped from the prompt), then rough paste onto the saved location plate followed by a partial img2img integration pass (default denoise 0.48). Without those nodes, Composited falls back to the single location-plate workflow above.

Dual remains the default in Auto when both references exist. Choose **Integrate in scene** for narrative boards where depth and lighting should match the plate. Choose **Composited** when pixel fidelity to the saved plate matters more than dimensional realism (presenter frames, layout-locked thumbs).

See also: `doc/INTEGRATE-IN-SCENE-MODE-PLAN.md`, `doc/COMPOSITED-SHOT-PIPELINE.md`.

## Related implementation

- `src/lib/services/image-generation-overrides.ts` — merge helper for user negatives
- `src/lib/shot-render-overrides.ts` — per-shot `stillNegativePrompt`
- `RenderSettings.imageDefaultNegative` — project-wide still-image extra
- `src/components/sheets/SheetGenerationControls.tsx` — character sheet and shot extra-negative UI
- `src/components/sheets/CharacterSheetGenerator.tsx` — per-state character sheet generation
- `src/components/render/RenderSettingsPanel.tsx` — project-level UI

When removing a bad hardcoded policy, delete the constant and wire control to the user instead of replacing one hidden list with another.
