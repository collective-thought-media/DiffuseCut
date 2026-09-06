import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
  BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
  BUILTIN_KREA2_STILL_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

export {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
  BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
  BUILTIN_KREA2_STILL_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

const BUILTIN_LTX_I2V = {
  id: BUILTIN_LTX_I2V_TEMPLATE_ID,
  name: "Local LTX 2.3 (image to video)",
  description:
    "Built-in LTX 2.3 I2V workflow for local ComfyUI. Bindings cover prompt, still reference, frame length (8n+1), UNET, VAE, and checkpoint controls. Tune models in Render settings or import your own img2vid workflow.",
  purpose: "shot_video" as const,
};

const BUILTIN_LTX_I2V_AUDIO = {
  id: BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID,
  name: "Local LTX 2.3 lip sync (image + audio to video)",
  description:
    "Built-in LTX 2.3 audio-conditioned I2V workflow for local ComfyUI. Renders the shot still into video whose performance is lip-synced to a supplied dialog audio file instead of model-invented sound. Used by the Render lip sync action on the finishing Dialog tab.",
  purpose: "shot_video" as const,
};

const BUILTIN_MINIMAX_I2V = {
  id: BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
  name: "Local MiniMax H3 (image to video)",
  description:
    "Built-in MiniMax H3 FL2VA workflow for local ComfyUI (ComfyUI 0.30+). Uses first-frame still reference, native stereo audio, and 17k+5 frame grid. Tune diffusion model, VAEs, and text encoder in Render settings.",
  purpose: "shot_video" as const,
};

const BUILTIN_CHARACTER_SHEET = {
  id: BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  name: "Default character sheet (txt2img)",
  description:
    "Built-in text-to-image workflow for character turnaround sheets. Uses your ComfyUI checkpoint; swap the checkpoint in Render settings or project settings if needed.",
  purpose: "character_sheet" as const,
};

const BUILTIN_LOCATION_REFERENCE_IPADAPTER = {
  id: BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  name: "Location reference from anchor (IP-Adapter)",
  description:
    "Built-in txt2img workflow with IP-Adapter for location angles after an establishing reference exists. Matches set design and materials from the anchor while generating a new camera composition from the angle description.",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_DUAL_IPADAPTER = {
  id: BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  name: "Storyboard shot (dual IP-Adapter)",
  description:
    "Built-in storyboard still workflow with two IP-Adapter inputs: character casting reference for identity and wardrobe, plus location reference for background and set lighting. Used when a shot has both references available.",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_LOCATION_PLATE = {
  id: BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  name: "Storyboard shot (location plate + character)",
  description:
    "Composited still workflow: encodes the saved location angle into the latent at partial denoise, then applies character IP-Adapter. Opt-in alternative to dual IP-Adapter when set layout fidelity matters.",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_CHARACTER_ISOLATE = {
  id: BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  name: "Storyboard shot (character isolate)",
  description:
    "Pipeline stage: generate the cast member on a neutral backdrop with character IP-Adapter for use as a foreground layer.",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_COMPOSITE_INPAINT = {
  id: BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  name: "Storyboard shot (composite inpaint)",
  description:
    "Pipeline stage: paste the isolated character onto the saved location plate, then run a partial img2img integration pass so lighting, depth, and edges match the set.",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT = {
  id: BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
  name: "Storyboard shot (integrate in scene, masked inpaint)",
  description:
    "Integrate in scene: masked paint on the location plate with character IP-Adapter, re-composite that painted subject region onto the plate with the same geometric mask (not RemBG), then a diffusion harmonization pass so lighting and edges match the set. Paste alone is never the final still.",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_SCENE_EDIT_QWEN = {
  id: BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  name: "Storyboard shot (scene edit, Qwen Image Edit)",
  description:
    "Scene edit workflow: feeds the saved location plate and the character reference into Qwen Image Edit 2511 with an instruction prompt, so the model places the character into the scene with real interaction, occlusion, and matched lighting. Requires qwen_image_edit_2511_fp8mixed.safetensors (diffusion_models), qwen_2.5_vl_7b_fp8_scaled.safetensors (text_encoders), qwen_image_vae.safetensors (vae), and the Qwen-Image-Edit-2511-Lightning-4steps LoRA (loras).",
  purpose: "location_sheet" as const,
};

const BUILTIN_SHOT_FACE_REFINE = {
  id: BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
  name: "Storyboard shot (face detail pass)",
  purpose: "location_sheet" as const,
  description:
    "Pipeline stage: detect the character's face in a finished still, crop and upscale it, re-diffuse at low denoise with a face IP-Adapter tied to the character reference, and paste the sharpened result back. Requires ComfyUI-Impact-Pack, ComfyUI-Impact-Subpack, an ultralytics face model (models/ultralytics/bbox/face_yolov8m.pt), and an SDXL face IP-Adapter (ip-adapter-plus-face_sdxl_vit-h.safetensors).",
};

const BUILTIN_SHOT_IMAGE_EDIT_QWEN = {
  id: BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID,
  name: "Storyboard shot (edit with instruction, Qwen Image Edit)",
  purpose: "location_sheet" as const,
  description:
    "Image edit workflow: feeds a finished still into Qwen Image Edit 2511 with a plain-language instruction (fix sign text, remove an object, change time of day) and returns the edited frame. Requires the same Qwen Image Edit models as the scene edit workflow.",
};

const BUILTIN_LOCATION_REFERENCE_IMG2IMG = {
  id: BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  name: "Location reference from anchor (img2img)",
  description:
    "Legacy img2img anchor workflow. Deprecated: img2img cannot produce independent camera angles from an establishing wide.",
  purpose: "location_sheet" as const,
};

const BUILTIN_KREA2_STILL = {
  id: BUILTIN_KREA2_STILL_TEMPLATE_ID,
  name: "Krea 2 turbo (txt2img)",
  description:
    "Built-in Krea 2 turbo still workflow for local ComfyUI. Uses UNET, Qwen3-VL text encoder, and qwen_image VAE. 8 steps at CFG 1.0.",
  purpose: "character_sheet" as const,
};

function readTemplateFile(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function loadBuiltinCharacterSheetFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/character-sheet/workflow.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/character-sheet/bindings.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinLocationReferenceIpAdapterFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/location-reference/workflow-ipadapter.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/location-reference/bindings-ipadapter.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotDualIpAdapterFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-placeholder/workflow-dual-ipadapter.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-placeholder/bindings-dual-ipadapter.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotLocationPlateFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-location-plate.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-location-plate.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotCharacterIsolateFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-character-isolate.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-character-isolate.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotCompositeInpaintFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-composite-inpaint.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-composite-inpaint.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotSceneIntegrateInpaintFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-scene-integrate-inpaint.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-scene-integrate-inpaint.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinLocationReferenceImg2imgFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/location-reference/workflow-img2img.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/location-reference/bindings.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinLtxI2vFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile("templates/ltx-i2v/workflow.api.json");
  const bindingsJson = readTemplateFile("templates/ltx-i2v/bindings.json");

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinLtxI2vAudioFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/ltx-i2v-audio/workflow.api.json"
  );
  const bindingsJson = readTemplateFile("templates/ltx-i2v-audio/bindings.json");

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinMinimaxI2vFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/minimax-i2v/workflow.api.json"
  );
  const bindingsJson = readTemplateFile("templates/minimax-i2v/bindings.json");

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinKrea2StillFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/krea2-still/workflow.api.json"
  );
  const bindingsJson = readTemplateFile("templates/krea2-still/bindings.json");

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotSceneEditQwenFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-scene-edit-qwen.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-scene-edit-qwen.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotFaceRefineFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-face-refine.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-face-refine.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function loadBuiltinShotImageEditQwenFiles(): {
  workflowJson: string;
  bindingsJson: string;
} {
  const workflowJson = readTemplateFile(
    "templates/shot-composite/workflow-image-edit-qwen.api.json"
  );
  const bindingsJson = readTemplateFile(
    "templates/shot-composite/bindings-image-edit-qwen.json"
  );

  JSON.parse(workflowJson);
  JSON.parse(bindingsJson);

  return { workflowJson, bindingsJson };
}

function upsertBuiltinTemplate(
  db: Database.Database,
  template: {
    id: string;
    name: string;
    description: string;
    purpose: string;
  },
  files: { workflowJson: string; bindingsJson: string }
): void {
  const existing = db
    .prepare("SELECT id FROM workflow_templates WHERE id = ?")
    .get(template.id);

  if (existing) {
    db.prepare(
      `UPDATE workflow_templates
       SET name = ?, description = ?, workflow_json = ?, bindings_json = ?, purpose = ?
       WHERE id = ? AND is_builtin = 1`
    ).run(
      template.name,
      template.description,
      files.workflowJson,
      files.bindingsJson,
      template.purpose,
      template.id
    );
    return;
  }

  db.prepare(
    `INSERT INTO workflow_templates (
      id, name, description, workflow_json, bindings_json, purpose, is_builtin, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    template.id,
    template.name,
    template.description,
    files.workflowJson,
    files.bindingsJson,
    template.purpose,
    Date.now()
  );
}

export function seedBuiltinWorkflowTemplates(db: Database.Database): void {
  upsertBuiltinTemplate(
    db,
    BUILTIN_CHARACTER_SHEET,
    loadBuiltinCharacterSheetFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_LOCATION_REFERENCE_IMG2IMG,
    loadBuiltinLocationReferenceImg2imgFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_LOCATION_REFERENCE_IPADAPTER,
    loadBuiltinLocationReferenceIpAdapterFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_DUAL_IPADAPTER,
    loadBuiltinShotDualIpAdapterFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_LOCATION_PLATE,
    loadBuiltinShotLocationPlateFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_CHARACTER_ISOLATE,
    loadBuiltinShotCharacterIsolateFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_COMPOSITE_INPAINT,
    loadBuiltinShotCompositeInpaintFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT,
    loadBuiltinShotSceneIntegrateInpaintFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_SCENE_EDIT_QWEN,
    loadBuiltinShotSceneEditQwenFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_FACE_REFINE,
    loadBuiltinShotFaceRefineFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_SHOT_IMAGE_EDIT_QWEN,
    loadBuiltinShotImageEditQwenFiles()
  );
  upsertBuiltinTemplate(db, BUILTIN_LTX_I2V, loadBuiltinLtxI2vFiles());
  upsertBuiltinTemplate(
    db,
    BUILTIN_LTX_I2V_AUDIO,
    loadBuiltinLtxI2vAudioFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_MINIMAX_I2V,
    loadBuiltinMinimaxI2vFiles()
  );
  upsertBuiltinTemplate(
    db,
    BUILTIN_KREA2_STILL,
    loadBuiltinKrea2StillFiles()
  );
}

export function resolveDefaultCharacterSheetTemplateId(
  configuredId: string | null | undefined
): string {
  return configuredId?.trim() || BUILTIN_CHARACTER_SHEET_TEMPLATE_ID;
}
