# DiffuseCut

**0.1.0-alpha.1** (first tester cut)

Local-first pre-production and generation studio for AI filmmakers. You write the story, lock character and location looks, storyboard shots, generate stills and video through ComfyUI, finish audio (score, dialog, SFX, optional lip sync), and export an MP4. The app runs in your browser at [http://localhost:3004](http://localhost:3004).

DiffuseCut is the control room. ComfyUI is the GPU renderer for images and video. FFmpeg is the encoder. ACE-Step (optional, separate from the ComfyUI render queue) can generate musical scores. Models and custom nodes stay on the machines you already run. DiffuseCut does not ship weights, and it does not lock you to one checkpoint family.

This is an early alpha. The pipeline works end to end. Some finishing details (text overlays in the final file) are still preview-only. Expect sharp edges. License: [MIT](./LICENSE).

A fresh clone on another computer does not use anyone else's machine, LAN, or projects. App data lives under that user's Documents folder. ComfyUI is whatever URL you type in Settings (default `http://127.0.0.1:8188`).

## Model and workflow agnostic

DiffuseCut is built to drive **whatever you already run in ComfyUI**.

- **Any model.** Point DiffuseCut at your ComfyUI host. The models you see in DiffuseCut are the checkpoints, UNETs, VAEs, and text encoders already installed there. Swap SDXL, Krea, LTX, MiniMax H3, Flux-style stacks, or anything else your graphs use. DiffuseCut does not bundle or require a single vendor stack.
- **Any workflow.** Export a graph from ComfyUI in **API format**, import it in DiffuseCut **Settings → Import workflow template**, map the bindings (prompt, seed, checkpoint, outputs, and any controls you want exposed), and use that template from the UI. Day-to-day work stays in DiffuseCut. You do not need to open the ComfyUI canvas for every render.
- **Import purposes today:** shot video (Render), character sheet, and location sheet. Bind node ids once. DiffuseCut fills prompts, seeds, dimensions, and model picks from the project when you queue jobs.
- **Bundled templates are starters, not a cage.** The repo seeds ready-to-run graphs for a common happy path (Krea / SDXL stills, IP-Adapter location angles, Integrate / Dual / Scene edit shot stills, LTX and MiniMax video, LTX lip sync, face refine, Qwen instruction edit). Use them as-is, replace them, or ignore them and load your own.

If a bundled mode needs a specific custom node pack (for example IP-Adapter, LTX, MiniMax H3, or Qwen Image Edit), that only applies when you use that mode. Bring your own workflow and you bring your own node requirements with it.

## What you get

| Area | What it does |
|------|----------------|
| Dashboard | Logline, plot, visual style phrase, reference aspect ratio, project FPS |
| Characters | Cast with visual states, upload or generate reference sheets, batch options, pick winners |
| Locations | Establishing plates, IP-Adapter or txt2img angles, optical punch-in crops, uploads |
| Storyboard | Shot list, still modes and controls, animatic, stop hung packs, hybrid outside-clip path |
| Render | Queue shot video (bundled LTX or MiniMax, or any imported shot-video template) |
| Finishing | Trims, text overlay preview, musical score, sound effects, dialog / VO, lip sync |
| Export | Conformed MP4 or WebM via FFmpeg (mixes score, dialog, and SFX) |
| Setup / Settings | Dependency checks, ComfyUI endpoints, FFmpeg path, workflow imports, ACE-Step, LLM, API keys |

**Hybrid path:** export a storyboard packet (stills + shot notes), generate clips in another video tool, then **Install clip** so Finishing and Export treat them like native takes.

## Known limitations (alpha)

- Character identity can still fight the shot prompt, especially for non-human cast. Prefer a clear Front reference sheet, check Visual reference thumbnails before generating, and use Stop generation if a pack hangs.
- ComfyUI, FFmpeg, ACE-Step, and model weights are separate installs. DiffuseCut does not bundle GPUs or checkpoints. Setup flags missing optional stacks; it does not download them for you.
- Bundled shot still modes (Integrate, Dual, Scene edit, face refine, instruction edit) need matching ComfyUI custom nodes and models. Without them, those modes degrade or fail with setup-style errors. Custom imported workflows follow whatever those graphs need instead.
- Bundled Render video templates are **LTX 2.3 I2V** and **MiniMax H3 I2V**. Each needs its matching stack on ComfyUI. Still generation and storyboard writing work without either. Import another I2V / T2V workflow if you prefer a different video model.
- A separate bundled **LTX lip sync** graph (image + dialog audio to video) is used from Finishing → Dialog, not as the everyday Render template.
- Text overlays in Finishing are still preview-oriented and may not land in the exported file the way the timeline shows.
- This cut is for early testers. File issues on GitHub. Feedback from real Comfy setups is welcome.

## How it works

The browser UI and API run on your editing machine. A background worker polls generation, render, and export queues. DiffuseCut talks to ComfyUI through a server-side proxy, so the browser never has to reach the GPU host itself.

Timing is frame-quantized at the project FPS. Shot durations, trims, overlays, and audio spans are all in frames, not milliseconds.

Project tabs, in order: **Dashboard, Characters, Locations, Storyboard, Render, Finishing, Export, Project Settings**.

| Layer | Role |
|-------|------|
| Next.js app on port 3004 | UI, REST API, and ComfyUI proxy |
| SQLite + files on disk | Projects, shots, jobs, media, imported workflow templates |
| Background worker | Queues for sheets, stills, video, and export |
| ComfyUI | Image and video generation for whatever models and API workflows you install and bind |
| ACE-Step (optional) | Musical score generation (local install or remote API, separate from the ComfyUI render queue) |
| FFmpeg | Trim, mix, size, punch-in crops, and encode the final file |

`npm install` does **not** install FFmpeg, ComfyUI, ACE-Step, ML models, or music licenses.

## Prerequisites

| Dependency | Required when | Installed by `npm install`? |
|------------|---------------|----------------------------|
| Node.js 20+ | Always | No |
| npm dependencies | Always | Yes |
| Writable app data dir | Always | Auto-created |
| FFmpeg + ffprobe | Export, location punch-in | No |
| ComfyUI server | Render and image / video generation | No |
| Models / custom nodes for your chosen workflows | Generation with those workflows | No (live in ComfyUI) |

**Optional stacks used by the bundled happy-path templates** (only if you use those features):

| Stack | Bundled use |
|-------|-------------|
| SDXL checkpoints | Character and location sheets, IP-Adapter shot modes |
| Krea 2 turbo (UNET + Qwen3-VL + qwen_image VAE) | Preferred faster stills engine when present and the project has not locked an SDXL model |
| IP-Adapter nodes + weights | Anchored location angles and several shot still modes |
| Compositing nodes (Essentials / RemBG / mask helpers) | Integrate in scene and related composite still paths |
| LTX 2.3 nodes + models | Bundled LTX shot video and LTX lip sync |
| MiniMax H3 nodes + models (ComfyUI 0.30+) | Bundled MiniMax H3 I2V shot video (native stereo audio) |
| Qwen Image Edit 2511 + Lightning LoRA | Scene edit still mode and Edit with instruction |
| ComfyUI-Impact-Pack + Impact-Subpack | Optional face detail pass on shot stills |
| ComfyUI-Woosh (or ElevenLabs) | Sound effect generation on Finishing |
| ACE-Step 1.5 (local install or remote API) | Generated musical score |
| Epidemic Sound upload or ElevenLabs | Score upload / cloud score and SFX fallback |

You can open the app and write a storyboard with only Node.js. Generation and export light up as you add ComfyUI and FFmpeg. With only Node + your own imported ComfyUI workflows and models, you can skip stacks you do not care about.

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

After models and custom nodes are in place, open **Setup** and click **Re-check**. Setup probes core app deps plus common optional stacks: SDXL, IP-Adapter, compositing nodes, Qwen Image Edit, face detail (Impact Pack), LTX 2.3, MiniMax H3, ACE-Step compute, and score audio sources. Missing optional stacks show as info. They do not block you from opening projects or from importing your own workflows.

## Import your own ComfyUI workflow

1. In ComfyUI, export the graph as **API format** (not the UI-format save).
2. In DiffuseCut, open **Settings → Import workflow template**.
3. Choose a purpose: **Shot video**, **Character sheet**, or **Location sheet**.
4. Paste the workflow JSON and a bindings object that maps DiffuseCut fields (prompt, negative, seed, checkpoint / UNET controls, output nodes, and any extra controls) to node ids and input keys.
5. Save the template. Select it on Render or in project / app defaults when you generate.

See [`templates/`](templates/) for example API graphs and bindings JSON used by the bundled starters. The stub in [`templates/README.md`](templates/README.md) shows the binding shape.

## Create a project end to end

This is the happy path from an empty install to a finished MP4 using the bundled templates. Substitute your own imported workflows wherever you prefer.

### 1. Confirm the machine

Run `npm start`, open [http://localhost:3004/setup](http://localhost:3004/setup), and re-check until the core app is ready. Install FFmpeg before you care about export or punch-in. Point Settings at ComfyUI before you care about generation.

### 2. Create the project

Open **Projects**, name the film, and create it. DiffuseCut sends you to the project dashboard. Project cards can show rotating preview thumbnails from characters, locations, and storyboard stills.

### 3. Dashboard (story and look)

Write the **logline** and **plot**. Both autosave.

Pick a **visual style** preset or add your own look phrase. That phrase is mixed into later generation prompts so sheets and shots share a look. Some presets also change character-sheet layout (for example turnaround vs casting-style portrait).

Set the **reference aspect ratio** for character and location sheets. Project **FPS** shows as a badge (change it later under Project Settings). Output size for the finished video is set on Export. Whatever size you pick there is the size you get. The project still ratio also drives default Render width and height.

### 4. Characters

Add each speaking or featured person. A character can have more than one **visual state** (day clothes vs night, clean vs wrecked).

You can upload a reference still, or generate a **character sheet** through ComfyUI (bundled Krea or SDXL template, or your imported character-sheet workflow). Queue a small batch, watch progress, and pick the winner. Discard candidates you do not want. The chosen still becomes `reference.png` for that angle and is what later shots use for likeness.

Optional: turn on LLM prompt expansion in Settings (OpenAI or Ollama). When enabled it can flesh out short notes for character sheets, location angles, and shot prompts before they hit ComfyUI.

### 5. Locations

Add each place the story visits. Start with an **establishing wide**. That plate becomes the anchor.

Generate more **camera angles** from the anchor. If ComfyUI has IP-Adapter nodes and weights, the bundled path prefers that so a low angle or macro still reads as the same place. Without IP-Adapter it falls back to txt2img. You can also upload a photo of a real set, or drive location generation with an imported location-sheet workflow.

Closer angles can **punch in** from the establishing plate with an optical crop and scale (same room pixels, tighter framing, no diffusion). That path uses FFmpeg once an establishing reference exists.

### 6. Storyboard

Build the shot list. Each shot has a title, a motion prompt, a duration in frames, a location, and a cast (which characters and which visual states).

Generate a **placeholder still** per shot. DiffuseCut composes the prompt from the shot text, visual style, cast, and location. When both a character and a location reference exist, **Auto** resolves to **Integrate in scene** so subject size and position drive a real inpaint mask. You can override the still mode:

- **Scene edit:** character interacts with the set (Qwen Image Edit, if installed)
- **Integrate in scene / Composited:** paint the character into the plate (inpaint + IP-Adapter; needs compositing nodes for the full path)
- **Dual reference:** both images steer the whole frame
- **Character or location only:** single IP-Adapter reference
- **Prompt only:** no reference image

Per-shot controls (where the mode supports them): **Subject size**, **Subject position**, **Character likeness**, and optional **Face detail** (Impact Pack pass). On an existing option you can **Edit with instruction** (Qwen Image Edit) instead of regenerating from scratch.

Pick the still you want. That image is the driver for later video, not a throwaway thumbnail. Visual reference thumbnails show the exact character and location files sent to ComfyUI. Stuck packs can be stopped so Generate unlocks again.

Drag shots to reorder. Use the animatic preview to scrub the board.

**Hybrid path:** if you would rather generate a clip in another video tool, click **Export storyboard** (whole board) or **Export this shot**. You get a zip with one folder per shot (`still.png`, `shot.txt`) plus `storyboard.json`. Make the clip outside DiffuseCut, then use **Install clip** on Storyboard or Finishing. The installed file becomes that shot's render. Finishing and export treat it like a native take.

### 7. Render

Open **Render**, pick a bundled shot-video template (**Local LTX 2.3** or **Local MiniMax H3**), or select any shot-video template you imported. Confirm the model picks and controls your bindings expose (checkpoint or UNET, VAE, audio VAE for MiniMax, text encoder, resolution, negative prompt, GPU device, and so on). Image engine (SDXL vs Krea) for stills is separate from the video template.

Select the shots whose stills you like and queue them. The worker submits graphs to ComfyUI and streams progress. You can cancel in-flight jobs. When a job finishes, the MP4 is stored on the shot (`videoPath`) and plays on the Render page.

You do not have to render every shot in DiffuseCut. Mix native Comfy takes with installed outside clips.

### 8. Finishing

This is the desk after the footage exists.

**Trim** each shot with in/out handles on the timeline. Click a row to sync the inspector. The preview plays rendered video when a clip exists, and the storyboard still when it does not.

Four tabs sit on the desk:

- **Text Overlays:** timed captions and credits. These preview in the UI. They are **not** burned into the export file yet.
- **Musical Score:** upload a track (for example from Epidemic Sound), or generate one with ACE-Step (local install or remote ACE-Step API). ElevenLabs sound generation is an optional cloud fallback when you set a key and choose Auto / ElevenLabs in Settings.
- **Sound Effects:** per-shot SFX briefs, suggest / batch generate (ComfyUI-Woosh when installed, otherwise ElevenLabs if configured), volume and frame spans.
- **Dialog:** voiceover / dialog tracks. Upload a VO file (or generate a tone bed when ElevenLabs is configured), span it to the frames where it belongs, and optionally **Render lip sync** (bundled LTX image + audio workflow) so the shot video follows that dialog take.

Volume is 0 to 1, with a live percent readout. Score, dialog, and SFX spans are in frames at project FPS.

### 9. Export

Pick format (MP4 or WebM) and output size (for example 1920×1080). Export conforms every shot to that exact size (cover and crop), applies Finishing trims, and mixes score, dialog, and SFX with the shot audio.

Queue the encode. When it finishes you can open the file or reveal it in the folder. The MP4 lands under the project `exports/` directory.

### 10. Project Settings

Per-project FPS, optional ComfyUI endpoint override, character-sheet template override, storage breakdown, orphan render cleanup, and project delete (with optional media purge). App-wide Settings (FFmpeg path, default endpoints, ACE-Step compute mode, score provider, workflow imports, LLM, API keys, diagnostic report) live at `/settings`, outside any one project.

## Bundled templates (seeded)

These are created in the local database on first launch. They are starters. Swap models in Render / generation settings, or import replacements.

| Template | ID | Used for |
|----------|----|----------|
| Krea 2 turbo (txt2img) | `builtin-krea2-still-v1` | Preferred stills engine when the Krea UNET stack is installed |
| Default character sheet (txt2img) | `builtin-character-sheet-v1` | Character (and first-angle location) stills on SDXL |
| Location reference (IP-Adapter) | `builtin-location-reference-ipadapter-v1` | Location angles from an establishing plate |
| Location reference (img2img) | `builtin-location-reference-img2img-v1` | Legacy anchored location path (kept for older batches) |
| Storyboard shot (dual IP-Adapter) | `builtin-shot-dual-ipadapter-v1` | Dual reference stills |
| Storyboard shot (location plate + character) | `builtin-shot-location-plate-v1` | Composited / plate-locked still path |
| Storyboard shot (character isolate) | `builtin-shot-character-isolate-v1` | Internal composite pipeline stage |
| Storyboard shot (composite inpaint) | `builtin-shot-composite-inpaint-v1` | Internal composite pipeline stage |
| Storyboard shot (integrate in scene) | `builtin-shot-scene-integrate-inpaint-v1` | Integrate in scene still mode |
| Storyboard shot (scene edit, Qwen) | `builtin-shot-scene-edit-qwen-v1` | Scene edit still mode |
| Storyboard shot (face detail pass) | `builtin-shot-face-refine-v1` | Optional Impact Pack face refine |
| Storyboard shot (edit with instruction, Qwen) | `builtin-shot-image-edit-qwen-v1` | Instruction edits on an existing still |
| Local LTX 2.3 (image to video) | `builtin-ltx-i2v-v1` | Default Render I2V template |
| Local MiniMax H3 (image to video) | `builtin-minimax-i2v-v1` | Alternate Render I2V with native stereo audio |
| Local LTX 2.3 lip sync (image + audio) | `builtin-ltx-i2v-audio-v1` | Finishing → Dialog lip sync renders |

Musical score generation uses ACE-Step through DiffuseCut Settings (local or remote compute). It is not the same as picking a ComfyUI shot-video template on Render.

Character-into-location shot modes (Integrate in scene, Dual, Composited) still use the SDXL IP-Adapter path in the bundled graphs even when Krea is preferred for prompt-driven sheets. Pick an SDXL checkpoint for those modes, keep Krea for sheets and punch-in plates, or replace the still / video path entirely with your own imported API workflow.

## Data locations

- **App data:** `%USERPROFILE%\Documents\DiffuseCut\` on Windows, `~/Documents/DiffuseCut/` on macOS and Linux
- **Projects:** `{appData}/projects/{slug}/` (stills, renders, audio, exports)
- **Database:** `{appData}/diffusecut.db` unless you override it

Override the app data folder with `.env` (`DIFFUSECUT_DATA_DIR`) or the settings API. The Settings page shows the active path. Per-project root override exists on the create-project API for advanced layouts.

Projects are local files plus a SQLite row. Back up the app data folder if you care about the work. A clone of this git repo is the application, not your films.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Production local app on port 3004 plus worker (what testers should run) |
| `npm run doctor` | CLI dependency checklist |
| `npm run build` | Production build (also happens automatically on first `npm start`) |
| `npm run dev` | Developer hot-reload stack. Not for everyday use. |
| `npm run dev:turbo` | Dev stack with Turbopack (optional; can be flaky on Windows) |
| `npm run worker` | Background worker only (normally started by `npm start` / `npm run dev`) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright e2e |
| `npm run eval:journey` | Representative full-user E2E eval (see `doc/E2E-AGENT-PLAYBOOK.md`) |

## Feedback and issues

This alpha is meant for community testing. If something breaks on your ComfyUI setup, models, or imported workflow, [open an issue](https://github.com/collective-thought-media/DiffuseCut/issues) with what you tried, what you expected, and what happened. Bug reports and troubleshooting notes from real machines are especially useful.

## For contributors

Maintainer notes and the agent eval playbook live under [`doc/`](doc/). Prefer this README and the seeded templates under [`templates/`](templates/) as the source of truth for shipped behavior. [`doc/PROJECT-STATUS.md`](doc/PROJECT-STATUS.md) is a development journal and may lag the product. Start with [`doc/E2E-AGENT-PLAYBOOK.md`](doc/E2E-AGENT-PLAYBOOK.md) for eval runs.

## License

MIT. See [LICENSE](LICENSE).
