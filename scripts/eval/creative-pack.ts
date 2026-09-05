import fs from "fs";
import { z } from "zod";

const stillReferenceModeSchema = z.enum([
  "auto",
  "scene_edit",
  "integrate_in_scene",
  "dual",
  "composited",
  "character",
  "location",
  "prompt_only",
]);

const angleSchema = z.object({
  name: z.string().min(1),
  viewDescription: z.string().optional(),
});

const characterStateSchema = z.object({
  name: z.string().min(1),
  lookDescription: z.string().min(1),
  angles: z.array(angleSchema).optional(),
});

const characterSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  state: characterStateSchema,
});

const locationStateSchema = z.object({
  name: z.string().min(1),
  lookDescription: z.string().min(1),
  angles: z.array(angleSchema).optional(),
});

const locationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  state: locationStateSchema,
});

const shotSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  motionPrompt: z.string().min(1),
  characterIndex: z.number().int().min(0).optional(),
  locationIndex: z.number().int().min(0).optional(),
  stillReferenceMode: stillReferenceModeSchema.optional(),
  renderDeep: z.boolean().optional(),
  generatePlaceholder: z.boolean().optional(),
});

const finishingSchema = z
  .object({
    overlayText: z.string().optional(),
    trimInFrames: z.number().int().min(0).optional(),
    trimOutFrames: z.number().int().min(1).nullable().optional(),
  })
  .optional();

export const creativePackSchema = z.object({
  title: z.string().min(1),
  logline: z.string().min(1),
  plot: z.string().min(1),
  visualStylePreset: z
    .enum([
      "photoreal_cinematic",
      "stylized_illustration",
      "animation_cartoon",
      "custom",
    ])
    .optional()
    .default("photoreal_cinematic"),
  visualStyleCustomSuffix: z.string().optional(),
  referenceAspectRatio: z
    .enum(["16_9", "9_16", "1_1", "4_3"])
    .optional()
    .default("16_9"),
  characters: z.array(characterSchema).min(1).max(4),
  locations: z.array(locationSchema).min(1).max(3),
  shots: z.array(shotSchema).min(2).max(8),
  finishing: finishingSchema,
  meta: z
    .object({
      author: z.string().optional(),
      runner: z.string().optional(),
      notes: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export type CreativePack = z.infer<typeof creativePackSchema>;
export type CreativePackShot = z.infer<typeof shotSchema>;

export function loadCreativePack(filePath: string): CreativePack {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return creativePackSchema.parse(parsed);
}

/** Extract JSON from Grokbot replies that may wrap content in markdown fences. */
export function parseCreativePackFromText(text: string): CreativePack {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const parsed = JSON.parse(candidate) as unknown;
  return creativePackSchema.parse(parsed);
}
