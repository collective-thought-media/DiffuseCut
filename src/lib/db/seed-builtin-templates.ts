import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

export {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

const BUILTIN_LTX_I2V = {
  id: BUILTIN_LTX_I2V_TEMPLATE_ID,
  name: "Local LTX 2.3 (image to video)",
  description:
    "Built-in LTX 2.3 I2V workflow for local ComfyUI. Bindings cover prompt, still reference, frame length (8n+1), UNET, VAE, and checkpoint controls. Tune models in Render settings or import your own img2vid workflow.",
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

const BUILTIN_LOCATION_REFERENCE_IMG2IMG = {
  id: BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  name: "Location reference from anchor (img2img)",
  description:
    "Legacy img2img anchor workflow. Deprecated: img2img cannot produce independent camera angles from an establishing wide.",
  purpose: "location_sheet" as const,
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
  upsertBuiltinTemplate(db, BUILTIN_LTX_I2V, loadBuiltinLtxI2vFiles());
  upsertBuiltinTemplate(
    db,
    BUILTIN_MINIMAX_I2V,
    loadBuiltinMinimaxI2vFiles()
  );
}

export function resolveDefaultCharacterSheetTemplateId(
  configuredId: string | null | undefined
): string {
  return configuredId?.trim() || BUILTIN_CHARACTER_SHEET_TEMPLATE_ID;
}
