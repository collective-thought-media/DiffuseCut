# Local dev scripts

Scripts for setting up the same-machine stack most open-source users will run.

| Script | Purpose |
|--------|---------|
| `install-ace-step-local.ps1` | Clone ACE-Step 1.5, `uv sync`, Python 3.12 venv. Default: `%LOCALAPPDATA%\DiffuseCut\ace-step\ACE-Step-1.5` |
| `start-ace-step-api.ps1` | Run ACE-Step HTTP API on a GPU machine (port 8002). Point DiffuseCut Settings at `http://LAN-IP:8002` for remote score generation. |
| `install-comfyui-local.ps1` | Clone ComfyUI for SDXL / IP-Adapter / LTX renders (not score music). Default: `%LOCALAPPDATA%\DiffuseCut\comfyui` |

Score generation in DiffuseCut uses **native ACE-Step** via `scripts/ace-step/generate_native.py`, not ComfyUI audio nodes.

Maintainer-only remote-host helpers (rename/ignore for local desk setup):

| Script | Purpose |
|--------|---------|
| `install-git-workhorse.ps1` | Git for Windows on the remote ComfyUI GPU host (required for `git clone` custom nodes) |
| `install-epicrealism-workhorse.ps1` | epiCRealism XL CrystalClear checkpoint on a remote ComfyUI host |
| `install-compositing-nodes-workhorse.ps1` | Verify compositing nodes (ImageCompositeMasked, ImageToMask, InvertMask) for multi-stage shot compositing |
| `install-mask-blur-workhorse.ps1` | Install ComfyUI Essentials (`MaskBlur+`) for soft subject mask edges before paste |
| `restart-comfy-after-mask-blur-workhorse.ps1` | Stop ComfyUI, finish Essentials pip deps, restart, verify `MaskBlur+` |
| `redownload-clip-vision-workhorse.ps1` | CLIP vision weights on a remote host |
| `patch-comfy-model-paths.ps1` | Patch `extra_model_paths.yaml` |

To re-export the bundled LTX example template: `../export-ltx-i2v-template.py` with
`COMFYUI_URL`, `LTX_EXPORT_SCRIPT`, and `LTX_TEMPLATE_SRC` in the environment.
