# Location reference workflows

DiffuseCut ships three built-in location reference workflows:

| File | Use case |
|------|----------|
| `workflow.api.json` (character sheet fallback) | First angle, no anchor yet (txt2img) |
| `workflow-img2img.api.json` | Legacy img2img anchor workflow (deprecated, kept for in-flight batches). |
| `workflow-ipadapter.api.json` | **Default for anchored angles.** New composition from prompt, set look from establishing reference. |

## IP-Adapter setup (required for anchored angles)

Anchored location angles (after you save an establishing wide) use **IP-Adapter** when available. IP-Adapter is tuned for **style and set matching**, not copying the wide composition. For macro, close-up, and low-angle shots, DiffuseCut lowers IP-Adapter weight, shortens its influence window, switches to square framing, and puts your angle description first in the prompt.

Without IP-Adapter, DiffuseCut falls back to **txt2img** so your angle description can drive a new camera setup. img2img cannot produce independent angles from a wide master.

1. **Custom nodes:** [ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
   ```bash
   cd ComfyUI/custom_nodes
   git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git
   ```
2. **Models** (SDXL, match your checkpoint family):
   - `ComfyUI/models/ipadapter/ip-adapter-plus_sdxl_vit_h.safetensors`
   - `ComfyUI/models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`

   Download links are in the IPAdapter_plus repo README. Use **ComfyUI Manager** if you prefer one-click installs.

3. Restart ComfyUI. DiffuseCut expects nodes `IPAdapterUnifiedLoader` and `IPAdapterAdvanced`.

RealVisXL and other SDXL checkpoints work with the `PLUS (high strength)` preset in the bundled workflow.
