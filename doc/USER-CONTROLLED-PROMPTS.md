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
| Per shot | Storyboard generation, **Extra negative prompt (this shot)** | Override or add terms for one frame |
| Preview | Prompt preview before queueing | Shows merged positive and negative text sent to ComfyUI |

Merging is explicit: base negatives from prompt building, then project extras, then shot extras. Nothing silent and scene-specific should reappear after the user clears their fields.

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

## Related implementation

- `src/lib/services/image-generation-overrides.ts` — merge helper for user negatives
- `src/lib/shot-render-overrides.ts` — per-shot `stillNegativePrompt`
- `RenderSettings.imageDefaultNegative` — project-wide still-image extra
- `src/components/sheets/SheetGenerationControls.tsx` — shot-level UI
- `src/components/render/RenderSettingsPanel.tsx` — project-level UI

When removing a bad hardcoded policy, delete the constant and wire control to the user instead of replacing one hidden list with another.
