# DiffuseCut

**0.1.0-alpha.1** (first tester cut)

Local-first pre-production and generation pipeline for AI filmmakers. Storyboard, ComfyUI batch render, and FFmpeg export from your browser at `http://localhost:3004`.

A fresh clone on another computer does not use this machine, its LAN, or anyone else's projects. App data lives under that user's Documents folder. ComfyUI is whatever URL you type in Settings (default `http://127.0.0.1:8188`).

## Prerequisites

| Dependency | Required when | Installed by `npm install`? |
|------------|---------------|----------------------------|
| Node.js 20+ | Always | No |
| npm dependencies | Always | Yes |
| Writable app data dir | Always | Auto-created |
| FFmpeg + ffprobe | Export | No |
| ComfyUI server | Render | No |
| SDXL checkpoints on ComfyUI | Character and location sheets | No |
| IP-Adapter nodes + weights | Anchored location angles (recommended) | No |
| LTX 2.3 nodes + models | Default shot video workflow | No |
| Qwen Image Edit 2511 + Lightning LoRA | Scene edit shot mode and instruction edits (optional) | No |
| ComfyUI-Impact-Pack + Impact-Subpack | Face detail pass on shot stills (optional) | No |
| ACE-Step 1.5 on ComfyUI | Finishing score generation (recommended) | No |
| Epidemic Sound upload or ElevenLabs | Finishing musical score (optional) | No |

`npm install` does **not** install FFmpeg, ComfyUI, ML models, or music licenses.

## Quick start (fresh machine)

```bash
git clone https://github.com/collective-thought-media/DiffuseCut.git
cd DiffuseCut
npm install
npm run doctor
npm start
```

`npm start` is the production local app. First launch builds the bundle, then serves it without the Next.js developer overlay or hot-reload stack. Open [http://localhost:3004/setup](http://localhost:3004/setup) and work through the checklist.

Use `npm run dev` only when you are changing DiffuseCut source code. That mode is slower and shows the developer error overlay.

Copy `.env.example` to `.env` only if you need a non-default port or data folder. Leave `DIFFUSECUT_DATA_DIR` empty to use `Documents/DiffuseCut` on that computer.

Create a new project on the laptop. Do not copy another machine's `diffusecut.db` unless you also copy that machine's project folders.

## Installing FFmpeg

**Windows:** `winget install Gyan.FFmpeg`

**macOS:** `brew install ffmpeg`

**Linux:** `sudo apt install ffmpeg`

If FFmpeg is installed but not on PATH, set the path in **Settings → FFmpeg path override**.

## Installing ComfyUI

ComfyUI is a separate install. See [ComfyUI on GitHub](https://github.com/comfyanonymous/ComfyUI).

Start it locally, or on another machine you control:

```bash
python main.py --listen 0.0.0.0 --port 8188
```

In DiffuseCut, set **Settings → ComfyUI endpoints** to `http://127.0.0.1:8188` for same-machine, or `http://your-comfy-host:8188` for a GPU box on your network.

## Workflow

1. **Pre-Production.** Project logline, character and location sheets (image or video refs).
2. **Storyboard.** Frame-quantized timeline, shot list, animatic preview. Export a still packet, or install a clip from another video tool.
3. **Render.** Import a ComfyUI API workflow, bind nodes, queue shots, live progress.
4. **Finishing.** Trim, captions, score, dialog, and SFX.
5. **Export.** FFmpeg final MP4 at the project output size.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Production local app on port 3004 plus worker (what testers should run) |
| `npm run doctor` | CLI dependency checklist |
| `npm run build` | Production build (also happens automatically on first `npm start`) |
| `npm run dev` | Developer hot-reload stack. Not for everyday use. |
| `npm run typecheck` | TypeScript check |
| `npm run eval:journey` | Representative full-user E2E eval (see `doc/E2E-AGENT-PLAYBOOK.md`) |

## E2E eval

For a frontier-agent end-to-end pass (create project, touch every major surface, render 1 to 2 shots, export final video), see [`doc/E2E-AGENT-PLAYBOOK.md`](doc/E2E-AGENT-PLAYBOOK.md). Run `npm run eval:journey` after `npm run dev` and `npm run doctor`. Reports are written under your app data folder in `eval-runs/`.

## Data locations

- **App data:** `%USERPROFILE%/Documents/DiffuseCut/` (Windows) or `~/Documents/DiffuseCut/`
- **Projects:** `{appData}/projects/{slug}/`
- Override via Settings, `.env`, or a per-project root path

## License

MIT. See [LICENSE](LICENSE).
