#!/usr/bin/env python3
"""Generate intelligible dialog via ElevenLabs TTS (not ACE-Step music).

Optional: copy MP3 to a ComfyUI output folder so the file shows up next to GPU jobs.

Usage:
  set ELEVENLABS_API_KEY=...
  python scripts/voiceover/generate-elevenlabs-tts.py --text "Hello world" --comfy-output "M:/ComfyUI/app/output/voiceover_test"
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import urllib.error
import urllib.request

DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"  # Sarah
MODEL_ID = "eleven_multilingual_v2"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--text",
        required=True,
        help="Exact script lines to speak.",
    )
    parser.add_argument("--voice-id", default=DEFAULT_VOICE)
    parser.add_argument(
        "--out",
        default="dialog_elevenlabs_tts.mp3",
        help="Local output MP3 path.",
    )
    parser.add_argument(
        "--comfy-output",
        default="",
        help="If set, also write dialog_elevenlabs_tts.mp3 into this folder.",
    )
    args = parser.parse_args()

    api_key = (
        os.environ.get("ELEVENLABS_API_KEY")
        or os.environ.get("MUSIC_API_KEY")
        or ""
    ).strip()
    if not api_key:
        print("Set ELEVENLABS_API_KEY or MUSIC_API_KEY.", file=sys.stderr)
        return 1

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{args.voice_id}"
    payload = {
        "text": args.text.strip(),
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0,
            "use_speaker_boost": True,
        },
    }
    import json

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "xi-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            audio = resp.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        print(f"ElevenLabs TTS failed ({err.code}): {detail[:400]}", file=sys.stderr)
        return 1

    with open(args.out, "wb") as f:
        f.write(audio)
    print(f"Wrote {args.out} ({len(audio)} bytes)")

    if args.comfy_output:
        dest_dir = args.comfy_output.replace("/", os.sep)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, os.path.basename(args.out))
        shutil.copy2(args.out, dest)
        print(f"Copied to {dest}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
