#!/usr/bin/env python3
"""
Parse screenplay PDF text into narrator / character segments and optionally
render with Microsoft Edge TTS (free, no API key).

Usage:
  python scripts/voiceover/screenplay_pdf_to_audiobook.py \\
    --pdf "assets/source/script.pdf" --pages 2 --out output/audiobook_test
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Install pypdf: pip install pypdf", file=sys.stderr)
    sys.exit(1)

try:
    import edge_tts
except ImportError:
    edge_tts = None  # type: ignore

# Default cast (Edge neural voices, en-US). Not true casting, but distinct reads.
# For LAN/local TTS (Kokoro, Piper, F5), replace via --voices-json.
DEFAULT_EDGE_VOICES = {
    "NARRATOR": "en-US-ChristopherNeural",
    "AZAR": "en-US-AndrewMultilingualNeural",
    "FON": "en-US-EricNeural",
    "FÖN": "en-US-EricNeural",
    "KRS-ONE": "en-US-GuyNeural",
}
# Kokoro voice ids (local ONNX on LAN). Tune in assets/source/kokoro_cast.json.
DEFAULT_KOKORO_VOICES = {
    "NARRATOR": "am_michael",
    "AZAR": "bm_lewis",
    "FON": "am_adam",
    "FÖN": "am_adam",
    "KRS-ONE": "bm_george",
}
DEFAULT_VOICES = DEFAULT_EDGE_VOICES


@dataclass
class Segment:
    index: int
    kind: str  # "narrator" | "dialogue"
    speaker: str
    text: str


PAGE_MARKER = re.compile(r"^\s*--\s*\d+\s+of\s+\d+\s+--\s*$", re.I)
LONE_PAGE_NUM = re.compile(r"^\s*\d+\.\s*$")
# PDF extract often merges "AZAR" + "Wow thanks..." on one line with no break.
GLUED_CHARACTER = re.compile(
    r"(?P<cue>[A-Z][A-Z0-9\-]{2,18})"
    r"(?="
    r"[A-Z][a-z]{2,}"  # Wow, Peace, That, Right
    r"|YO!"
    r"|Yeah"
    r"|Well,"
    r"|No doubt"
    r"|Amazing"
    r"|Honestly"
    r"|Tell "
    r"|And ah"
    r"|Everything"
    r"|We got"
    r"|We need"
    r"|Right on"
    r"|\"[A-Za-z]"
    r")"
)
SCENE_HEADING = re.compile(
    r"^(INT\.|EXT\.|INT/EXT\.|I/E\.|EST\.|FADE|CUT TO|DISSOLVE|SMASH CUT|MATCH CUT)",
    re.I,
)
SCENE_TRANSITION = re.compile(
    r"^(FADE TO BLACK|FADE IN|FADE OUT|CUT TO BLACK|TIME CUT|TWELVE HOURS|FRIDAY |MONDAY |TUESDAY |WEDNESDAY |THURSDAY |SATURDAY |SUNDAY )",
    re.I,
)
# Character cue: mostly caps, optional parenthetical on same line
CHAR_CUE = re.compile(
    r"^(?P<name>[A-Z][A-Z0-9 \-'\.]{0,48}?)(?:\s*\([^)]*\))?\s*$"
)
# Action / stage direction while still inside a dialogue block (PDF line breaks).
PROSE_ACTION = re.compile(
    r"^(?:Azar|FON|Walter|The |A |An |He |She |Someone |They |It |We see|We hear|"
    r"The scenes|The truck|The crowd|The wasted|A spray-painted|INT\.|EXT\.)",
    re.I,
)


def normalize_speaker(name: str) -> str:
    n = name.strip().upper()
    n = n.replace("Ö", "O").replace("ö", "O")
    if n == "FON":
        return "FON"
    return n


def is_character_cue(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or len(stripped) > 55:
        return None
    if SCENE_HEADING.match(stripped) or SCENE_TRANSITION.match(stripped):
        return None
    if stripped.endswith(".") and " " in stripped and not stripped.isupper():
        return None
    if stripped in {"CRASH", "CRASH!"}:
        return None
    m = CHAR_CUE.match(stripped)
    if not m:
        return None
    name = m.group("name").strip()
    if len(name) < 2:
        return None
    # Require most letters to be uppercase (allow KRS-ONE style)
    letters = [c for c in name if c.isalpha()]
    if not letters:
        return None
    upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
    if upper_ratio < 0.85:
        return None
    # Exclude slug-like scene fragments
    if " - " in name and ("DAY" in name or "NIGHT" in name):
        return None
    return normalize_speaker(name)


def normalize_pdf_mojibake(text: str) -> str:
    """Fix common PDF encoding glitches in this export."""
    text = text.replace("\ufffd", "O")
    text = re.sub(r"FÖN", "FON", text, flags=re.I)
    text = re.sub(r"FONYO!", "FON\nYO!", text)
    return text


def split_glued_character_cues(text: str) -> str:
    """Insert line breaks before character names run into dialogue."""

    def repl(m: re.Match[str]) -> str:
        return f"\n{m.group('cue')}\n"

    return GLUED_CHARACTER.sub(repl, text)


def clean_pdf_lines(raw: str) -> list[str]:
    raw = normalize_pdf_mojibake(raw)
    raw = split_glued_character_cues(raw)
    lines: list[str] = []
    for line in raw.splitlines():
        s = line.rstrip()
        if not s.strip():
            lines.append("")
            continue
        if PAGE_MARKER.match(s) or LONE_PAGE_NUM.match(s):
            continue
        lines.append(s)
    return lines


def parse_screenplay_lines(lines: list[str]) -> list[Segment]:
    segments: list[Segment] = []
    idx = 0
    i = 0
    current_speaker: str | None = None
    dialogue_buf: list[str] = []
    narrator_buf: list[str] = []

    def flush_narrator() -> None:
        nonlocal idx, narrator_buf
        text = " ".join(narrator_buf).strip()
        narrator_buf = []
        if not text:
            return
        segments.append(
            Segment(index=idx, kind="narrator", speaker="NARRATOR", text=text)
        )
        idx += 1

    def flush_dialogue() -> None:
        nonlocal idx, dialogue_buf, current_speaker
        if not current_speaker or not dialogue_buf:
            dialogue_buf = []
            return
        text = " ".join(dialogue_buf).strip()
        dialogue_buf = []
        if not text:
            current_speaker = None
            return
        segments.append(
            Segment(
                index=idx,
                kind="dialogue",
                speaker=current_speaker,
                text=text,
            )
        )
        idx += 1
        current_speaker = None

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_dialogue()
            flush_narrator()
            i += 1
            continue

        if SCENE_HEADING.match(stripped):
            flush_dialogue()
            flush_narrator()
            narrator_buf.append(stripped)
            i += 1
            continue

        if SCENE_TRANSITION.match(stripped) and not is_character_cue(stripped):
            flush_dialogue()
            flush_narrator()
            narrator_buf.append(stripped)
            i += 1
            continue

        cue = is_character_cue(stripped)
        if cue and not stripped.startswith("("):
            flush_dialogue()
            flush_narrator()
            current_speaker = cue
            dialogue_buf = []
            i += 1
            continue

        if current_speaker is not None:
            # Parenthetical stage direction inside dialogue block -> skip line
            if stripped.startswith("(") and stripped.endswith(")"):
                i += 1
                continue
            if PROSE_ACTION.match(stripped):
                flush_dialogue()
                narrator_buf.append(stripped)
                i += 1
                continue
            dialogue_buf.append(stripped)
            i += 1
            continue

        flush_dialogue()
        narrator_buf.append(stripped)
        i += 1

    flush_dialogue()
    flush_narrator()
    return segments


def pdf_page_count(pdf_path: Path) -> int:
    return len(PdfReader(str(pdf_path)).pages)


def extract_pdf_pages(
    pdf_path: Path,
    max_pages: int | None,
    *,
    start_page: int = 0,
) -> str:
    reader = PdfReader(str(pdf_path))
    n = len(reader.pages)
    start = max(0, min(start_page, n))
    if max_pages is None or max_pages <= 0:
        end = n
    else:
        end = min(n, start + max_pages)
    parts: list[str] = []
    for p in range(start, end):
        parts.append(reader.pages[p].extract_text() or "")
    return "\n".join(parts)


def mp3_duration_seconds(path: Path) -> float:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(proc.stdout.strip() or "0")


def clip_path_for_segment(clips_dir: Path, seg: Segment) -> Path:
    safe_speaker = re.sub(r"[^\w\-]+", "_", seg.speaker)
    return clips_dir / f"{seg.index:05d}_{seg.kind}_{safe_speaker}.mp3"


def pick_voice(
    seg: Segment,
    voices: dict[str, str],
    *,
    multi_voice: bool,
    extras: list[str],
    default_narrator: str,
) -> str:
    voice = voices.get("NARRATOR", default_narrator)
    if multi_voice and seg.kind == "dialogue":
        voice = voices.get(seg.speaker)
        if not voice:
            if seg.speaker not in voices:
                voices[seg.speaker] = extras[len(voices) % len(extras)]
            voice = voices[seg.speaker]
    return voice


def wav_bytes_to_mp3(wav_bytes: bytes, mp3_path: Path) -> None:
    tmp = mp3_path.with_suffix(".wav")
    tmp.write_bytes(wav_bytes)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(tmp),
            "-codec:a",
            "libmp3lame",
            "-qscale:a",
            "3",
            str(mp3_path),
        ],
        check=True,
        capture_output=True,
    )
    try:
        tmp.unlink()
    except OSError:
        pass


def kokoro_tts_bytes(base_url: str, text: str, voice: str) -> bytes:
    import urllib.error
    import urllib.request

    payload = json.dumps({"text": text, "voice": voice, "speed": 1.0}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/tts",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read()


async def render_segments(
    segments: list[Segment],
    out_dir: Path,
    voices: dict[str, str],
    *,
    multi_voice: bool,
    skip_existing: bool = False,
    tts_engine: str = "edge",
    kokoro_url: str = "http://workhorse:17958",
) -> list[Path]:
    clips_dir = out_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []

    edge_extras = [
        "en-US-BrianNeural",
        "en-US-RogerNeural",
        "en-US-SteffanNeural",
        "en-US-JennyNeural",
        "en-US-MichelleNeural",
        "en-US-AriaNeural",
    ]
    kokoro_extras = [
        "am_eric",
        "am_liam",
        "af_bella",
        "af_nicole",
        "bm_lewis",
        "bf_emma",
    ]
    default_narrator = (
        DEFAULT_KOKORO_VOICES["NARRATOR"]
        if tts_engine == "kokoro"
        else DEFAULT_EDGE_VOICES["NARRATOR"]
    )
    extras = kokoro_extras if tts_engine == "kokoro" else edge_extras

    if tts_engine == "edge" and edge_tts is None:
        raise RuntimeError("Install edge-tts: pip install edge-tts")

    for seg in segments:
        voice = pick_voice(
            seg, voices, multi_voice=multi_voice, extras=extras, default_narrator=default_narrator
        )
        out_path = clip_path_for_segment(clips_dir, seg)
        if skip_existing and out_path.exists() and out_path.stat().st_size > 0:
            paths.append(out_path)
            continue
        if tts_engine == "kokoro":
            wav = await asyncio.to_thread(kokoro_tts_bytes, kokoro_url, seg.text, voice)
            await asyncio.to_thread(wav_bytes_to_mp3, wav, out_path)
        else:
            comm = edge_tts.Communicate(seg.text, voice)
            await comm.save(str(out_path))
        paths.append(out_path)
    return paths


def split_clips_by_duration(
    clips: list[Path],
    target_minutes: float,
    max_parts: int | None = None,
) -> list[list[Path]]:
    target_sec = max(60.0, target_minutes * 60.0)
    parts: list[list[Path]] = [[]]
    part_dur = 0.0
    for clip in clips:
        dur = mp3_duration_seconds(clip)
        if (
            parts[-1]
            and part_dur >= target_sec * 0.85
            and (max_parts is None or len(parts) < max_parts)
        ):
            parts.append([])
            part_dur = 0.0
        parts[-1].append(clip)
        part_dur += dur
    while max_parts is not None and len(parts) > max_parts:
        # Merge overflow into last part if we oversplit.
        extra = parts.pop()
        parts[-1].extend(extra)
    return [p for p in parts if p]


def ffmpeg_concat(clips: list[Path], out_file: Path) -> None:
    if not clips:
        return
    list_file = out_file.with_suffix(".concat.txt")
    lines: list[str] = []
    for i, clip in enumerate(clips):
        esc = str(clip.resolve()).replace("'", "'\\''")
        lines.append(f"file '{esc}'")
    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(out_file),
        ],
        check=True,
        capture_output=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--pages", type=int, default=0, help="0 = all pages")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--multi-voice",
        action="store_true",
        help="Use per-character Edge voices (otherwise narrator voice only).",
    )
    parser.add_argument(
        "--render",
        action="store_true",
        help="Generate MP3 clips and part files.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Entire PDF (same as --pages 0).",
    )
    parser.add_argument(
        "--pdf-batch-pages",
        type=int,
        default=2,
        help="Progress chunk size while rendering (segments per slice).",
    )
    parser.add_argument(
        "--part-minutes",
        type=float,
        default=20.0,
        help="Target minutes per output part MP3.",
    )
    parser.add_argument(
        "--max-parts",
        type=int,
        default=3,
        help="Max part MP3 count (remainder merges into last part).",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip clip MP3s that already exist (resume).",
    )
    parser.add_argument(
        "--voices-json",
        type=Path,
        default=None,
        help="Optional JSON map of SPEAKER -> Edge voice id.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print every segment while parsing.",
    )
    parser.add_argument(
        "--tts",
        choices=("edge", "kokoro"),
        default="edge",
        help="edge = Microsoft Edge TTS; kokoro = LAN Kokoro ONNX on GPU box.",
    )
    parser.add_argument(
        "--kokoro-url",
        default="http://workhorse:17958",
        help="Base URL for kokoro_tts_server.py (health + /tts).",
    )
    parser.add_argument(
        "--single-mp3",
        default="",
        help="If set, write one combined MP3 (filename only) instead of part splits.",
    )
    args = parser.parse_args()

    if args.full:
        args.pages = 0

    if args.tts == "kokoro":
        voices = dict(DEFAULT_KOKORO_VOICES)
    else:
        voices = dict(DEFAULT_EDGE_VOICES)
    if args.voices_json and args.voices_json.is_file():
        voices.update(json.loads(args.voices_json.read_text(encoding="utf-8")))

    max_pages = args.pages if args.pages > 0 else None
    total_pages = pdf_page_count(args.pdf)
    raw = extract_pdf_pages(args.pdf, max_pages)
    preprocessed = split_glued_character_cues(normalize_pdf_mojibake(raw))
    lines = clean_pdf_lines(raw)
    segments = parse_screenplay_lines(lines)
    for i, seg in enumerate(segments):
        seg.index = i

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "preprocessed.txt").write_text(preprocessed, encoding="utf-8")
    manifest = args.out / "segments.json"
    manifest.write_text(
        json.dumps([asdict(s) for s in segments], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    summary = {
        "pages": max_pages or total_pages,
        "segment_count": len(segments),
        "narrator": sum(1 for s in segments if s.kind == "narrator"),
        "dialogue": sum(1 for s in segments if s.kind == "dialogue"),
        "speakers": sorted({s.speaker for s in segments if s.kind == "dialogue"}),
        "tts": args.tts,
        "kokoro_url": args.kokoro_url if args.tts == "kokoro" else None,
        "voices": voices,
    }
    (args.out / "summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )

    print(json.dumps({k: v for k, v in summary.items() if k != "voices"}, indent=2))
    if args.verbose or len(segments) <= 40:
        for seg in segments:
            preview = seg.text[:80] + ("…" if len(seg.text) > 80 else "")
            print(f"[{seg.index:03d}] {seg.kind:8} {seg.speaker:12} {preview}")

    if args.render:
        batch_pages = max(1, args.pdf_batch_pages)
        slices = max(1, (total_pages + batch_pages - 1) // batch_pages)
        chunk = max(1, (len(segments) + slices - 1) // slices)
        print(f"Rendering {len(segments)} segments in ~{slices} batches…")

        async def render_all() -> list[Path]:
            ordered: list[Path] = []
            for start in range(0, len(segments), chunk):
                end = min(len(segments), start + chunk)
                print(f"TTS {start + 1}-{end} / {len(segments)}")
                paths = await render_segments(
                    segments[start:end],
                    args.out,
                    voices,
                    multi_voice=args.multi_voice,
                    skip_existing=args.skip_existing,
                    tts_engine=args.tts,
                    kokoro_url=args.kokoro_url,
                )
                ordered.extend(paths)
            return ordered

        clips = asyncio.run(render_all())
        if args.single_mp3:
            name = args.single_mp3.strip() or "combined.mp3"
            if not name.lower().endswith(".mp3"):
                name += ".mp3"
            combined = args.out / name
            ffmpeg_concat(clips, combined)
            dur = sum(mp3_duration_seconds(c) for c in clips)
            print(f"Wrote {combined} ({dur / 60.0:.1f} min, {len(clips)} clips)")
        else:
            parts = split_clips_by_duration(
                clips, args.part_minutes, max_parts=args.max_parts or None
            )
            parts_meta: list[dict] = []
            for i, part_clips in enumerate(parts, start=1):
                out_part = args.out / f"Black_Pelican_ep1_part_{i:02d}.mp3"
                ffmpeg_concat(part_clips, out_part)
                dur = sum(mp3_duration_seconds(c) for c in part_clips)
                parts_meta.append(
                    {
                        "file": out_part.name,
                        "clips": len(part_clips),
                        "duration_minutes": round(dur / 60.0, 1),
                    }
                )
                print(f"Wrote {out_part} ({dur / 60.0:.1f} min)")

            (args.out / "parts.json").write_text(
                json.dumps(parts_meta, indent=2), encoding="utf-8"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
