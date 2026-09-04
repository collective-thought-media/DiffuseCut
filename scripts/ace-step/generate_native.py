#!/usr/bin/env python3
"""DiffuseCut native ACE-Step 1.5 runner (run from ACE-Step install root via uv)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from acestep.gpu_config import get_global_gpu_config, resolve_lm_backend
from acestep.handler import AceStepHandler
from acestep.inference import GenerationConfig, GenerationParams, generate_music
from acestep.llm_inference import LLMHandler


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: generate_native.py <request.json>", file=sys.stderr)
        return 2

    req = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    install_root = Path(req.get("installRoot") or Path.cwd()).resolve()
    output_path = Path(req["outputPath"]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    kind = req.get("kind", "music")
    prompt = str(req.get("prompt", "")).strip()
    lyrics = str(req.get("lyrics", "")).strip()
    duration = float(req.get("durationSeconds", 30))
    duration = max(1.0, min(180.0, duration))
    bpm = int(req.get("bpm", 90))
    keyscale = str(req.get("keyscale", "A minor"))
    seed = req.get("seed")

    if not prompt:
        print("prompt is required", file=sys.stderr)
        return 2

    if kind == "voiceover":
        caption = "spoken word voiceover, dry studio recording, no music bed"
        lyrics = prompt
        instrumental = False
        thinking = True
        use_cot_caption = True
    elif kind == "sfx":
        caption = prompt
        lyrics = ""
        instrumental = True
        thinking = False
        use_cot_caption = False
        bpm = 60
        keyscale = "C major"
        duration = max(8.0, min(22.0, duration))
    else:
        caption = prompt
        lyrics = lyrics or "[Instrumental]"
        instrumental = True
        thinking = True
        use_cot_caption = True

    gpu = get_global_gpu_config()
    quantization = "int8_weight_only" if gpu.quantization_default else None
    offload_to_cpu = gpu.offload_to_cpu_default
    offload_dit_to_cpu = gpu.offload_dit_to_cpu_default
    lm_backend = resolve_lm_backend(gpu.recommended_backend, gpu)

    print(
        json.dumps(
            {
                "gpuTier": gpu.tier,
                "gpuMemoryGb": round(gpu.gpu_memory_gb, 2),
                "quantization": quantization,
                "offloadToCpu": offload_to_cpu,
                "lmBackend": lm_backend,
            }
        ),
        flush=True,
    )

    dit = AceStepHandler()
    llm = LLMHandler()

    print("init DiT...", flush=True)
    dit.initialize_service(
        project_root=str(install_root),
        config_path="acestep-v15-turbo",
        device="cuda",
        offload_to_cpu=offload_to_cpu,
        offload_dit_to_cpu=offload_dit_to_cpu,
        quantization=quantization,
    )

    print("init LM...", flush=True)
    llm.initialize(
        checkpoint_dir=str(install_root / "checkpoints"),
        lm_model_path="acestep-5Hz-lm-1.7B",
        backend=lm_backend,
        device="cuda",
        offload_to_cpu=offload_to_cpu,
    )

    params = GenerationParams(
        task_type="text2music",
        caption=caption,
        lyrics=lyrics,
        instrumental=instrumental,
        bpm=bpm,
        duration=duration,
        keyscale=keyscale,
        vocal_language="en",
        thinking=thinking,
        use_cot_caption=use_cot_caption,
        use_cot_metas=False,
        use_cot_language=False,
    )
    if seed is not None:
        params.seed = int(seed)

    config = GenerationConfig(batch_size=1, audio_format="flac")
    save_dir = output_path.parent

    print("generate...", flush=True)
    result = generate_music(dit, llm, params, config, save_dir=str(save_dir))
    if not result.success:
        print(f"FAIL: {result.error}", file=sys.stderr)
        return 1

    written = None
    for audio in result.audios or []:
        candidate = audio.get("path")
        if candidate and Path(candidate).exists():
            written = Path(candidate)
            break

    if not written:
        flacs = sorted(save_dir.glob("*.flac"), key=lambda p: p.stat().st_mtime, reverse=True)
        if flacs:
            written = flacs[0]

    if not written or not written.exists():
        print("generation succeeded but no audio file was written", file=sys.stderr)
        return 1

    if written.resolve() != output_path.resolve():
        output_path.write_bytes(written.read_bytes())
        if written.suffix.lower() == ".flac" and output_path.suffix.lower() != ".flac":
            try:
                written.unlink(missing_ok=True)
            except OSError:
                pass

    print(
        json.dumps(
            {
                "ok": True,
                "outputPath": str(output_path),
                "sourcePath": str(written),
                "durationSeconds": duration,
                "caption": caption,
                "lyrics": lyrics,
                "bpm": bpm,
                "keyscale": keyscale,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
