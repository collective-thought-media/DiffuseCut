# Grokbot creative director prompt

Use this prompt with the `grokbot_send` MCP tool. Grok returns a single JSON object matching [`creative-pack.schema.json`](./creative-pack.schema.json). Save the reply to a file, then run:

```bash
npm run eval:journey -- --runner grokbot --creative path/to/grok-pack.json
```

If Grok wraps JSON in markdown fences, the harness `parseCreativePackFromText` helper strips them.

---

## Prompt (copy below the line)

You are the creative director for a DiffuseCut eval film. Invent an original, IP-free short story suitable for a 60 to 90 second animatic.

Return **only** valid JSON matching this shape (no commentary outside the JSON):

```json
{
  "title": "string",
  "logline": "string",
  "plot": "string",
  "visualStylePreset": "photoreal_cinematic",
  "referenceAspectRatio": "16_9",
  "characters": [
    {
      "name": "string",
      "description": "string",
      "state": {
        "name": "string",
        "lookDescription": "detailed wardrobe and appearance for image generation",
        "angles": [
          {
            "name": "Front full body",
            "viewDescription": "Full body front three-quarter, head to toe, casting reference framing"
          }
        ]
      }
    }
  ],
  "locations": [
    {
      "name": "string",
      "description": "string",
      "state": {
        "name": "string",
        "lookDescription": "detailed environment description",
        "angles": [
          {
            "name": "Establishing wide",
            "viewDescription": "Wide establishing view of the full environment"
          }
        ]
      }
    }
  ],
  "shots": [
    {
      "title": "string",
      "prompt": "still image prompt for storyboard",
      "motionPrompt": "video motion description for LTX render",
      "characterIndex": 0,
      "locationIndex": 0,
      "stillReferenceMode": "integrate_in_scene",
      "generatePlaceholder": true,
      "renderDeep": true
    }
  ],
  "finishing": {
    "overlayText": "short title card text",
    "trimInFrames": 4
  },
  "meta": {
    "author": "grokbot",
    "runner": "grokbot"
  }
}
```

Requirements:

- Exactly **2 characters** and **1 location**.
- **4 to 6 shots** total.
- Mark exactly **2 shots** with `"renderDeep": true` (these will be fully rendered to video).
- Mark exactly **2 shots** with `"generatePlaceholder": true` (storyboard still generation).
- One placeholder shot should use `"stillReferenceMode": "integrate_in_scene"` when both character and location apply.
- Do not use em dashes or en dashes in any string values.
- Do not reference copyrighted characters, real celebrities, or existing film titles.
- Character look descriptions must be concrete (garments, colors, hair, accessories).
- Shot prompts must be visual and cinematic, not meta camera jargon.

Example tone: small moments, clear geography, readable silhouettes, one simple emotional arc.
