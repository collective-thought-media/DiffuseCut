#!/usr/bin/env python3
"""Optional maintainer script: re-export an LTX I2V API workflow into templates/ltx-i2v/.

Requires a separate ComfyUI pipeline repo and a running ComfyUI instance.
All paths and URLs come from environment variables or CLI flags. Nothing is
hardwired to a specific machine or network.

Environment variables (optional):
  COMFYUI_URL              ComfyUI base URL (default: http://127.0.0.1:8188)
  LTX_EXPORT_SCRIPT        Path to run-ltx-talking-head-test.py (or equivalent)
  LTX_TEMPLATE_SRC         Path to video_ltx2_3_i2v.json (UI subgraph export)
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "templates" / "ltx-i2v"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--comfy-url",
        default=os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188"),
        help="ComfyUI base URL",
    )
    parser.add_argument(
        "--export-script",
        default=os.environ.get("LTX_EXPORT_SCRIPT", ""),
        help="Path to the LTX export helper script (Python module)",
    )
    parser.add_argument(
        "--template-src",
        default=os.environ.get("LTX_TEMPLATE_SRC", ""),
        help="Path to the LTX I2V UI workflow JSON",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=1280,
        help="Reference width used while patching the export",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=720,
        help="Reference height used while patching the export",
    )
    return parser.parse_args()


def load_ltx_module(script_path: Path):
    spec = importlib.util.spec_from_file_location("ltx_runner", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    args = parse_args()

    if not args.export_script:
        print(
            "Set LTX_EXPORT_SCRIPT or pass --export-script to your pipeline export helper.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not args.template_src:
        print(
            "Set LTX_TEMPLATE_SRC or pass --template-src to the LTX UI workflow JSON.",
            file=sys.stderr,
        )
        sys.exit(1)

    export_script = Path(args.export_script).expanduser().resolve()
    template_src = Path(args.template_src).expanduser().resolve()

    if not export_script.is_file():
        raise FileNotFoundError(f"Export script not found: {export_script}")
    if not template_src.is_file():
        raise FileNotFoundError(f"Template source not found: {template_src}")

    ltx = load_ltx_module(export_script)

    ltx.COMFY = args.comfy_url.rstrip("/")
    ltx.TEMPLATES = template_src.parent
    ltx.WIDTH = args.width
    ltx.HEIGHT = args.height
    ltx.FPS = 24
    ltx.DURATION_S = 3.0
    ltx.LENGTH = ltx._length_8n1(3.0)

    object_info = ltx.http_json("GET", "/object_info")
    prompt = ltx.convert_subgraph(template_src, object_info)
    prompt = ltx.patch_i2v(prompt, "placeholder.png", 0)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "workflow.api.json"
    out_path.write_text(json.dumps(prompt, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(prompt)} nodes)")
    print(
        "Review workflow.api.json and replace any machine-specific model names "
        "with neutral placeholders before committing."
    )


if __name__ == "__main__":
    main()
