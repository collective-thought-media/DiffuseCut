# DiffuseCut

Local-first pre-production and generation pipeline for AI filmmakers. Storyboard → ComfyUI batch render → FFmpeg export — all from your browser at `localhost`.

## Prerequisites

| Dependency | Required when | Installed by `npm install`? |
|------------|---------------|----------------------------|
| Node.js 20+ | Always | No |
| npm dependencies | Always | Yes |
| Writable app data dir | Always | Auto-created |
| FFmpeg + ffprobe | Export | No |
| ComfyUI server | Render | No |
| SDXL checkpoints on ComfyUI | Character & location sheets | No |
| IP-Adapter nodes + weights | Anchored location angles (recommended) | No |
| LTX 2.3 nodes + models | Default shot video workflow | No |
| ACE-Step 1.5 on ComfyUI | Finishing score generation (recommended) | No |
| Epidemic Sound upload or ElevenLabs | Finishing musical score (optional) | No |

`npm install` does **not** install FFmpeg, ComfyUI, ML models, or music licenses.

## Quick start

```bash
git clone <your-repo-url> DiffuseCut
cd DiffuseCut
npm install
npm run doctor    # check dependencies
npm run dev       # http://localhost:3004
```

Open [http://localhost:3004/setup](http://localhost:3004/setup) on first run to review the dependency checklist.

## Installing FFmpeg

**Windows:** `winget install Gyan.FFmpeg`

**macOS:** `brew install ffmpeg`

**Linux:** `sudo apt install ffmpeg`

If FFmpeg is installed but not on PATH, set the path in **Settings → FFmpeg path override**.

## Installing ComfyUI

ComfyUI is a separate install. See [ComfyUI on GitHub](https://github.com/comfyanonymous/ComfyUI).

Start with network listen for LAN rendering:

```bash
python main.py --listen 0.0.0.0 --port 8188
```

Configure the URL in **Settings** or per-project **Render machines** (supports multiple endpoints, e.g. `:8188` and `:8189`).

## Workflow

1. **Pre-Production** — Project logline, character & location sheets (image or video refs)
2. **Storyboard** — Frame-quantized timeline, shot list, animatic preview
3. **Render** — Import ComfyUI API workflow, bind nodes, queue shots, live progress
4. **Export** — Trim, captions/credits, FFmpeg final MP4

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js on port 3004 + background worker |
| `npm run doctor` | CLI dependency checklist |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |

## Data locations

- **App data:** `%USERPROFILE%/Documents/DiffuseCut/` (Windows) or `~/Documents/DiffuseCut/`
- **Projects:** `{appData}/projects/{slug}/`
- Override via Settings or per-project root path

## License

MIT — see [LICENSE](LICENSE).
