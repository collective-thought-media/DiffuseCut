# Storyboard shot compositing workflows



Phased compositing for reference-guided storyboard stills.



## Phase 1: Location plate + character IP-Adapter (`workflow-location-plate.api.json`)



Single ComfyUI graph. Encodes the saved location angle into the latent (partial denoise, default 0.42), applies character IP-Adapter, and lets the shot prompt drive pose and framing.



Requires ComfyUI_IPAdapter_plus (same as dual IP-Adapter shots). Used when compositing nodes are unavailable.



## Phase 2: Character isolate (`workflow-character-isolate.api.json`)



Generates the cast member on a neutral white seamless backdrop for use as a foreground layer. The worker strips location/set words from the shot prompt so this stage does not invent a new street or storefront.



## Phase 3: Paste + integration pass (`workflow-composite-inpaint.api.json`)



Three steps inside one ComfyUI graph:



1. **Rough paste:** blur the saved location plate, mask the isolate (white/gray backdrop colors), composite the subject over the plate.

2. **Integration img2img:** encode the pasted composite and run KSampler at partial denoise (default 0.38) with the full shot prompt and character IP-Adapter. This pass unifies lighting, depth, and edges. Pasting alone is not the final image.

3. **Save** the integrated still.



## Denoise defaults



| Stage | Default | Notes |

|-------|---------|-------|

| Location plate init (fallback) | 0.42 | When compositing nodes unavailable |

| Composite integration pass | 0.38 | img2img from pasted composite seed |



## DiffuseCut reference mode



Select **Composited (location plate + character)** in the storyboard shot editor when both character and location references exist. Dual IP-Adapter remains the default in Auto mode.



When compositing custom nodes are unavailable on ComfyUI, DiffuseCut falls back to the Phase 1 single-workflow template.


