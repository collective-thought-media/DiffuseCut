#!/usr/bin/env python3
"""LAN Kokoro TTS service (runs on GPU box, no cloud)."""

from __future__ import annotations

import argparse
import io
import os
import tempfile
import wave
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

app = FastAPI(title="DiffuseCut Kokoro TTS", version="1.0")
_kokoro = None
_model_dir: Path
_sample_rate = 24000


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    voice: str = "am_michael"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


def resolve_model_dir() -> Path:
    env = os.environ.get("KOKORO_MODEL_DIR", "").strip()
    if env:
        return Path(env)
    candidates = [
        Path(r"M:\ComfyUI\models\kokoro-onnx"),
        Path(__file__).resolve().parent / "kokoro-models",
    ]
    for c in candidates:
        if (c / "kokoro-v0_19.onnx").is_file():
            return c
    return candidates[0]


def get_kokoro():
    global _kokoro, _model_dir
    if _kokoro is not None:
        return _kokoro
    from kokoro_onnx import Kokoro

    _model_dir.mkdir(parents=True, exist_ok=True)
    model_path = _model_dir / "kokoro-v0_19.onnx"
    voices_path = _model_dir / "voices.bin"
    if not model_path.is_file() or not voices_path.is_file():
        raise RuntimeError(
            f"Missing Kokoro weights in {_model_dir}. "
            "Run scripts/voiceover/install-kokoro-models.ps1 on the host."
        )
    _kokoro = Kokoro(str(model_path), str(voices_path))
    return _kokoro


def samples_to_wav_bytes(samples, sample_rate: int) -> bytes:
    import numpy as np

    arr = np.asarray(samples, dtype=np.float32)
    arr = np.clip(arr, -1.0, 1.0)
    pcm = (arr * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


@app.get("/health")
def health():
    try:
        get_kokoro()
        ready = True
        err = None
    except Exception as exc:  # noqa: BLE001
        ready = False
        err = str(exc)
    return {
        "ok": ready,
        "engine": "kokoro-onnx",
        "model_dir": str(_model_dir),
        "error": err,
    }


@app.post("/tts")
def tts(req: TtsRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "text required")
    try:
        kokoro = get_kokoro()
        samples, sample_rate = kokoro.create(text, voice=req.voice, speed=req.speed)
        wav = samples_to_wav_bytes(samples, sample_rate)
        return Response(content=wav, media_type="audio/wav")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, str(exc)) from exc


def main() -> int:
    global _model_dir
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=17958)
    args = parser.parse_args()
    _model_dir = resolve_model_dir()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
