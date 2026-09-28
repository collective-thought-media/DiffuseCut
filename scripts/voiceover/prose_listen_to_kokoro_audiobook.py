#!/usr/bin/env python3
"""Render a prose listen markdown file to one MP3 via LAN Kokoro ONNX (3090 workhorse).

Skips title lines (# ...) and horizontal rules. Splits body into TTS-sized chunks.

Usage:
  python prose_listen_to_kokoro_audiobook.py \\
    --markdown assets/source/hyzergate-vs-control-gate-for-listen.md \\
    --out output/listen/hyzergate-vs-control-gate-postmortem \\
    --kokoro-url http://127.0.0.1:17958 \\
    --voice am_michael
"""

from __future__ import annotations

import argparse
import audioop
import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path

MAX_CHARS = 480


def load_paragraphs(md_path: Path) -> list[str]:
    raw = md_path.read_text(encoding="utf-8")
    blocks: list[str] = []
    for part in re.split(r"\n\s*\n+", raw):
        lines = []
        for line in part.splitlines():
            s = line.strip()
            if not s or s == "---":
                continue
            if s.startswith("#"):
                s = re.sub(r"^#+\s*", "", s).strip()
            lines.append(s)
        text = " ".join(lines).strip()
        if text:
            blocks.append(text)
    return blocks


def chunk_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    buf = ""
    for sent in sentences:
        if not sent:
            continue
        candidate = f"{buf} {sent}".strip() if buf else sent
        if len(candidate) <= max_chars:
            buf = candidate
        else:
            if buf:
                chunks.append(buf)
            if len(sent) <= max_chars:
                buf = sent
            else:
                for i in range(0, len(sent), max_chars):
                    chunks.append(sent[i : i + max_chars])
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def kokoro_wav(base_url: str, text: str, voice: str, speed: float) -> bytes:
    payload = json.dumps({"text": text, "voice": voice, "speed": speed}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/tts",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return resp.read()


def resolve_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    for candidate in (
        Path(r"M:\ComfyUI\app\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def write_wav_clip(wav_bytes: bytes, wav_path: Path) -> None:
    wav_path.write_bytes(wav_bytes)


def _read_wav(path: Path) -> tuple[tuple[int, int, int, int, int, int], bytes]:
    with wave.open(str(path), "rb") as wf:
        params = wf.getparams()
        return params, wf.readframes(wf.getnframes())


def _align_frames(
    params: tuple[int, int, int, int, int, int],
    frames: bytes,
    target: tuple[int, int, int, int, int, int],
) -> bytes:
    nch, sw, fr, _, _, _ = params
    tnch, tsw, tfr, _, _, _ = target
    if (nch, sw) != (tnch, tsw):
        raise RuntimeError(f"WAV channel/width mismatch: {params} vs {target}")
    if fr == tfr:
        return frames
    converted, _ = audioop.ratecv(frames, sw, nch, fr, tfr, None)
    return converted


def wav_concat(clips: list[Path], out_wav: Path) -> None:
    if not clips:
        return
    params, frames0 = _read_wav(clips[0])
    frames = [_align_frames(params, frames0, params)]
    for clip in clips[1:]:
        p, fr = _read_wav(clip)
        frames.append(_align_frames(p, fr, params))
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), "wb") as out:
        out.setparams(params)
        for chunk in frames:
            out.writeframes(chunk)


def wav_to_mp3(ffmpeg: str, wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-qscale:a",
            "3",
            str(mp3_path),
        ],
        check=True,
        capture_output=True,
    )


def health_ok(base_url: str) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/health", timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return bool(body.get("ok")), json.dumps(body)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--markdown", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--kokoro-url", default="http://127.0.0.1:17958")
    parser.add_argument("--voice", default="am_michael")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--max-chars", type=int, default=MAX_CHARS)
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    ok, detail = health_ok(args.kokoro_url)
    if not ok:
        print(f"Kokoro not ready at {args.kokoro_url}: {detail}", file=sys.stderr)
        return 2

    paragraphs = load_paragraphs(args.markdown)
    segments: list[str] = []
    for para in paragraphs:
        segments.extend(chunk_text(para, args.max_chars))

    args.out.mkdir(parents=True, exist_ok=True)
    clips_dir = args.out / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    (args.out / "segments.json").write_text(
        json.dumps(segments, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    ffmpeg = resolve_ffmpeg()
    clip_paths: list[Path] = []
    for i, text in enumerate(segments):
        clip = clips_dir / f"{i:04d}.wav"
        if args.skip_existing and clip.is_file() and clip.stat().st_size > 0:
            clip_paths.append(clip)
            continue
        print(f"TTS {i + 1}/{len(segments)} ({len(text)} chars)")
        wav = kokoro_wav(args.kokoro_url, text, args.voice, args.speed)
        write_wav_clip(wav, clip)
        clip_paths.append(clip)

    combined_wav = args.out / "hyzergate-vs-control-gate-postmortem.wav"
    wav_concat(clip_paths, combined_wav)
    print(f"Wrote {combined_wav} ({len(clip_paths)} clips)")
    if ffmpeg:
        combined_mp3 = args.out / "hyzergate-vs-control-gate-postmortem.mp3"
        wav_to_mp3(ffmpeg, combined_wav, combined_mp3)
        print(f"Wrote {combined_mp3}")
    else:
        print("ffmpeg not found; WAV only (no MP3).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
