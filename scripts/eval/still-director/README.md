# Still Director evals

Self-evaluations for multi-provider storyboard stills. DiffuseCut keeps character / location canon. Providers create pixels (local Comfy thin profiles, Google Gemini Image, fal Flux, OpenAI, Replicate, Midjourney bridge, NightCafe, or folder import).

## What Cursor actually uses

Cursor `GenerateImage` is a separate agent image pipeline. It is not your chat model. Public Cursor 2.4 notes and staff replies identify the backend as Google Gemini Image / Nano Banana Pro class, and Cursor can change the default without a Settings toggle. DiffuseCut cannot call Cursor's tool from the app runtime. The closest first-party API is Google AI Gemini Image with multi-reference parts. `folder_import` is how Cursor-generated assets re-enter the film OS.

## Industry techniques we map to

See `src/lib/stills/techniques.ts`. Prefer native multi-reference compose for character+set+prop. Do not pile DiffuseCut preprocess soup back on. Optical punch-in stays local and non-generative.

## Run

```bash
# Harness-off smoke + fixture load (no API keys required)
npm run eval:stills

# Grade live outputs later
npm run eval:stills -- --provider google_gemini_image --grade scripts/eval/still-director/grades.example.json

# Import Cursor / Midjourney downloads named with fixture ids
npm run eval:stills -- --provider folder_import --import-dir path/to/inbox
```

## Visual grades

Copy `grades.example.json`. Score each dimension 1..5. Weighted pass threshold defaults to 3.6. A case only fully passes when automated gates and visual grades both clear.

## Pass bar (Sand Storm)

You would approve the still as an LTX seed without regenerating. Identity and set continuity hold. No RemBG / sticker / half-denoised artifacts. Prompt sent equals brief when preprocess is off.
