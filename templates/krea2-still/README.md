# Krea 2 turbo still image (local)

Local text-to-image using the Krea 2 turbo stack on ComfyUI.

## Models (defaults)

| Role | File |
|------|------|
| UNET | `krea2_turbo_fp8_scaled.safetensors` in `models/diffusion_models/` |
| CLIP | `qwen3vl_4b_fp8_scaled.safetensors` type `krea2` in `models/text_encoders/` |
| VAE | `qwen_image_vae.safetensors` in `models/vae/` |

## Sampler defaults

8 steps, CFG 1.0, euler, simple scheduler (turbo model).

## DiffuseCut

Select **Krea 2 turbo** in the storyboard Image model picker, or set `characterSheetTemplateId` to `builtin-krea2-still-v1` in Render settings. Tune UNET/VAE/encoder in Render under Image generation.

IP-Adapter dual-reference shots still use SDXL until a Krea reference workflow exists.
