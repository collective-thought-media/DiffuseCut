# DiffuseCut

**0.1.0-alpha.1** (first tester cut)

Local-first pre-production and generation studio for AI filmmakers. You write the story, lock character and location looks, storyboard shots, generate stills and video through ComfyUI, finish audio, and export an MP4. The app runs in your browser at [http://localhost:3004](http://localhost:3004).

A fresh clone on another computer does not use anyone else's machine, LAN, or projects. App data lives under that user's Documents folder. ComfyUI is whatever URL you type in Settings (default `http://127.0.0.1:8188`).

This is an early alpha. The pipeline works end to end. Some finishing details (text overlays in the final file) are still preview-only.

## How it works

DiffuseCut is the control room. ComfyUI is the GPU renderer. FFmpeg is the encoder.

The browser UI and API run on your editing machine. A background worker polls generation, render, and export queues. DiffuseCut talks to ComfyUI through a server-side proxy, so the browser never has to reach the GPU host itself. You import a ComfyUI API workflow once (or use a bundled template), bind the nodes, then drive checkpoints, prompts, and the queue from DiffuseCut.

Timing is frame-quantized at the project FPS. Shot durations, trims, overlays, and audio spans are all in frames, not milliseconds.

Project tabs, in order: **Dashboard, Characters, Locations, Storyboard, Render, Finishing, Export, Project Settings**.

| Layer | Role |
|-------|------|
| Next.js app on port 3004 | UI, REST API, and ComfyUI proxy |
| SQLite + files on disk | Projects, shots, jobs, media |
| Background worker | Queues for sheets, stills, video, and export |
| ComfyUI | Character sheets, location plates, shot stills, LTX video, optional ACE-Step score |
| FFmpeg | Trim, mix, size, and encode the final file |

`npm install` does **not** install FFmpeg, ComfyUI, ML models, or music licenses.

## Prerequisites

| Dependency | Required when | Installed by `npm install`? |
|------------|---------------|----------------------------|
| Node.js 20+ | Always | No |
| npm dependencies | Always | Yes |
| Writable app data dir | Always | Auto-created |
| FFmpeg + ffprobe | Export | No |
| ComfyUI server | Render and generation | No |
| SDXL checkpoints on ComfyUI | Character and location sheets | No |
| IP-Adapter nodes + weights | Anchored location angles (recommended) | No |
| LTX 2.3 nodes + models | Default shot video workflow | No |
| Qwen Image Edit 2511 + Lightning LoRA | Scene edit shot mode (optional) | No |
| ComfyUI-Impact-Pack + Impact-Subpack | Face detail pass on shot stills (optional) | No |
| ACE-Step 1.5 on ComfyUI | Generated musical score (recommended) | No |
| Epidemic Sound upload or ElevenLabs | Finishing music (optional) | No |

You can open the app and write a storyboard with only Node.js. Generation and export light up as you add ComfyUI and FFmpeg.

## Quick start (fresh machine)

```bash
git clone https://github.com/collective-thought-media/DiffuseCut.git
cd DiffuseCut
npm install
npm run doctor
npm start
```

`npm start` is the production local app. First launch builds the bundle, then serves it without the Next.js developer overlay or hot-reload stack. Open [http://localhost:3004/setup](http://localhost:3004/setup) and work through the checklist.

`npm install` should finish without Visual Studio or C++ build tools. Next.js, SQLite, and the rest of the app come from that command. If install asks for Visual Studio, stop and update this repo. You do not install Next.js as a separate Windows app.

Use `npm run dev` only when you are changing DiffuseCut source code. That mode is slower and shows the developer error overlay.

Copy `.env.example` to `.env` only if you need a non-default port or data folder. Leave `DIFFUSECUT_DATA_DIR` empty to use `Documents/DiffuseCut` on that computer.

Create a new project on this machine. Do not copy another machine's `diffusecut.db` unless you also copy that machine's project folders.

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

In DiffuseCut, set **Settings → ComfyUI endpoints** to `http://127.0.0.1:8188` for same-machine, or `http://your-comfy-host:8188` for a GPU box on your network. You can list more than one URL. The worker uses the first host that answers.

After models and custom nodes are in place, open **Setup** and click **Re-check**. Setup probes the live ComfyUI for SDXL, IP-Adapter, LTX 2.3, and ACE-Step. Missing optional stacks show as warnings. They do not block you from opening projects.

## Create a project end to end

This is the happy path from an empty install to a finished MP4.

### 1. Confirm the machine

Run `npm start`, open [http://localhost:3004/setup](http://localhost:3004/setup), and re-check until the core app is ready. Install FFmpeg before you care about export. Point Settings at ComfyUI before you care about generation.

### 2. Create the project

Open **Projects**, name the film, and create it. DiffuseCut sends you to the project dashboard.

### 3. Dashboard (story and look)

Write the **logline** and **plot**. Both autosave.

Pick a **visual style** preset or add your own look phrase. That phrase is mixed into later generation prompts so sheets and shots share a look.

Set the **reference aspect ratio** for character and location sheets. Project **FPS** shows as a badge (change it later under Project Settings). Output size for the finished video is set on Export. Whatever size you pick there is the size you get.

### 4. Characters

Add each speaking or featured person. A character can have more than one **visual state** (day clothes vs night, clean vs wrecked).

You can upload a reference still, or generate a **character sheet** through ComfyUI (bundled SDXL txt2img template). Queue a small batch, watch progress, and pick the winner. The chosen still becomes `reference.png` for that angle and is what later shots use for likeness.

Optional: turn on LLM prompt expansion in Settings (OpenAI or Ollama) if you want the app to flesh out short notes before they hit ComfyUI.

### 5. Locations

Add each place the story visits. Start with an **establishing wide**. That plate becomes the anchor.

Generate more **camera angles** from the anchor. If ComfyUI has IP-Adapter nodes and weights, DiffuseCut prefers that path so a low angle or macro still reads as the same place. Without IP-Adapter it falls back to txt2img.

You can also upload a photo of a real set and use that as the plate.

### 6. Storyboard

Build the shot list. Each shot has a title, a motion prompt, a duration in frames, a location, and a cast (which characters and which visual states).

Generate a **placeholder still** per shot. DiffuseCut composes the prompt from the shot text, visual style, cast, and location. When both a character and a location reference exist, **Auto** tries to put the person into the plate. You can override the still mode:

- **Scene edit:** character interacts with the set (Qwen Image Edit, if installed)
- **Integrate in scene / Composited:** paint the character into the plate (inpaint + IP-Adapter)
- **Dual reference:** both images steer the whole frame
- **Character or location only:** single IP-Adapter reference
- **Prompt only:** no reference image

Pick the still you want. That image is the driver for later video, not a throwaway thumbnail.

Drag shots to reorder. Use the animatic preview to scrub the board.

**Hybrid path:** if you would rather generate a clip in another video tool, click **Export storyboard** (whole board) or **Export this shot**. You get a zip with one folder per shot (`still.png`, `shot.txt`) plus `storyboard.json`. Make the clip outside DiffuseCut, then use **Install clip** on Storyboard or Finishing. The installed file becomes that shot's render. Finishing and export treat it like a native take.

### 7. Render

Open **Render**, keep the default **LTX 2.3 I2V** template (or import your own ComfyUI API graph and bind nodes). Confirm checkpoint, UNET, VAE, text encoder, resolution, and negative prompt.

Select the shots whose stills you like and queue them. The worker submits graphs to ComfyUI and streams progress. When a job finishes, the MP4 is stored on the shot (`videoPath`) and plays on the Render page.

You do not have to render every shot in DiffuseCut. Mix native LTX takes with installed outside clips.

### 8. Finishing

This is the desk after the footage exists.

**Trim** each shot with in/out handles on the timeline. Click a row to sync the inspector. The preview plays rendered video when a clip exists, and the storyboard still when it does not.

Three tabs sit on the desk:

- **Text Overlays:** timed captions and credits. These preview in the UI. They are **not** burned into the export file yet.
- **Musical Score:** upload a track (for example from Epidemic Sound), or generate one with ACE-Step on ComfyUI. ElevenLabs is an optional fallback if you set a key in Settings.
- **Dialog:** voiceover tracks, same editor, filtered to dialog. Upload a VO file and span it to the frames where it belongs.

Volume is 0 to 1, with a live percent readout. Score and dialog spans are in frames at project FPS.

### 9. Export

Pick format (MP4 or WebM) and output size (for example 1920×1080). Export conforms every shot to that exact size (cover and crop), applies Finishing trims, and mixes score, dialog, and SFX with the shot audio.

Queue the encode. When it finishes you can open the file or reveal it in the folder. The MP4 lands under the project `exports/` directory.

### 10. Project Settings

Per-project FPS, optional ComfyUI endpoint override, character-sheet template override, and storage tools (orphan render cleanup). App-wide Settings (FFmpeg path, default endpoints, score provider, workflow imports, API keys) live at `/settings`, outside any one project.

## Bundled ComfyUI templates

| Template | Used for |
|----------|----------|
| Character sheet (SDXL txt2img) | Character turnaround stills |
| Location reference (IP-Adapter) | Location angles from an establishing plate |
| LTX 2.3 I2V | Default shot video from a still |
| ACE-Step 1.5 | Finishing score generation |

You can import your own ComfyUI **API** workflows in Settings and bind them as shot video, character sheet, or location sheet templates.

## Data locations

- **App data:** `%USERPROFILE%\Documents\DiffuseCut\` on Windows, `~/Documents/DiffuseCut/` on macOS and Linux
- **Projects:** `{appData}/projects/{slug}/` (stills, renders, audio, exports)
- **Database:** `{appData}/diffusecut.db` unless you override it

Override the data folder with Settings, `.env` (`DIFFUSECUT_DATA_DIR`), or a per-project root path.

Projects are local files plus a SQLite row. Back up the app data folder if you care about the work. A clone of this git repo is the application, not your films.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Production local app on port 3004 plus worker (what testers should run) |
| `npm run doctor` | CLI dependency checklist |
| `npm run build` | Production build (also happens automatically on first `npm start`) |
| `npm run dev` | Developer hot-reload stack. Not for everyday use. |
| `npm run typecheck` | TypeScript check |
| `npm run eval:journey` | Representative full-user E2E eval (see `doc/E2E-AGENT-PLAYBOOK.md`) |

## For contributors

Maintainer notes, QA status, and the agent eval playbook live under [`doc/`](doc/). Start with [`doc/PROJECT-STATUS.md`](doc/PROJECT-STATUS.md) and [`doc/E2E-AGENT-PLAYBOOK.md`](doc/E2E-AGENT-PLAYBOOK.md).

## License

MIT. See [LICENSE](LICENSE).
