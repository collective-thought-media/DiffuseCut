# Character sheet workflow template

DiffuseCut ships a **built-in default** character sheet workflow (`builtin-character-sheet-v1`) so you can generate turnaround sheets without importing anything first. It is a standard ComfyUI txt2img graph (1344×768, 16:9) seeded automatically on first run. Project dashboard controls override this canvas size.

Import a custom workflow only if you want different nodes, resolution, or models.

## Required bindings

Import your workflow via **Settings → Import workflow template** with purpose **Character sheet**, then map these bindings in the bindings JSON:

| Binding | Required | Description |
|---------|----------|-------------|
| `promptNodeId` | Yes | CLIP Text Encode (positive) node |
| `promptInputKey` | No | Default `text` |
| `negativePromptNodeId` | Recommended | CLIP Text Encode (negative) node |
| `negativePromptInputKey` | No | Default `text` |
| `seedNodeId` | Yes | KSampler or equivalent seed input |
| `seedInputKey` | No | Default `seed` |
| `outputNodeIds` | Recommended | Save Image node(s) for validation |

Optional controls (same as render workflows):

- `checkpoint` control for checkpoint loader node
- `sampler` control for KSampler settings
- `lora` controls for LoRA loaders

## Prompt shape

DiffuseCut wraps the character name and description into a turnaround sheet prompt. Example positive prompt themes:

- front view, back view, left profile, right profile
- consistent character design, neutral standing pose, full body
- clean white background, studio lighting

The default negative prompt excludes watermarks, text, single-angle outputs, and low quality artifacts.

Photo-real projects use **casting portrait** layout (single full-body subject on the project **16:9** reference canvas, default 1344×768). Built-in negatives block triptychs, split-screen panels, contact sheets, multiple unrelated people, generic model faces, and turnaround-sheet artifacts. Animation and stylized presets use a four-view turnaround in the positive prompt on purpose.

Optional **Extra negative prompt (this character sheet)** on each state adds terms on top of those defaults. See [`doc/USER-CONTROLLED-PROMPTS.md`](../../doc/USER-CONTROLLED-PROMPTS.md) for copy-paste extras if you need more reinforcement.

Split **Character identity** (face, build, signature features) from each state's **Look description** (outfit only). Both are merged into the sheet prompt before generation.

## Workflow format

Export your workflow in **ComfyUI API format** (not the UI graph export). The workflow JSON should be a flat object keyed by node id strings.

## Example minimal bindings

```json
{
  "promptNodeId": "6",
  "promptInputKey": "text",
  "negativePromptNodeId": "7",
  "negativePromptInputKey": "text",
  "seedNodeId": "3",
  "seedInputKey": "seed",
  "outputNodeIds": ["9"]
}
```

## Output

Generated options are saved under:

```
characters/{characterId}/candidates/{batchId}/{optionId}.png
```

When the user selects a design, the winner is copied to `characters/{characterId}/reference.png` and unselected candidates are deleted.
