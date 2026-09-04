"""One-off: print ComfyUI model base class for a checkpoint."""
import sys

sys.path.insert(0, ".")

import comfy.model_base as mb
import comfy.sd
import folder_paths

name = sys.argv[1] if len(sys.argv) > 1 else "realismFusion_v10.safetensors"
path = folder_paths.get_full_path("checkpoints", name)
model, *_ = comfy.sd.load_checkpoint_guess_config(
    path,
    output_vae=True,
    output_clip=True,
    embedding_directory=folder_paths.get_folder_paths("embeddings"),
)
cls = type(model.model).__name__
is_sdxl = isinstance(
    model.model, (mb.SDXL, mb.SDXLRefiner, mb.SDXL_instructpix2pix)
)
print(f"checkpoint={name}")
print(f"model_class={cls}")
print(f"is_sdxl={is_sdxl}")
