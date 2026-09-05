/**
 * Enqueue composited shot generation and poll until complete.
 * Usage: npx tsx scripts/local-dev/run-composited-test.ts [roundLabel]
 */
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { seedBuiltinWorkflowTemplates } from "@/lib/db/seed-builtin-templates";
import { enqueueShotPlaceholderBatch } from "@/lib/services/shot-asset-generation";
import { filterSelectableShotOptions } from "@/lib/services/shot-pipeline";
import { resolveProjectRoot } from "@/lib/paths/project-paths";

const PROJECT_ID = "XR2JauFsrvIvpBnIZ4rGN";
const SHOT_ID = "sRiy3p8VWsrlWnOpHMMpN";

const SHOT_PROMPT =
  "Lisa standing on the sidewalk outside the deli, medium shot from behind, subject large in the frame, looking into the shop window, feet on the pavement";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function openRawDb() {
  return new Database(
    path.join(os.homedir(), "Documents", "DiffuseCut", "diffusecut.db")
  );
}

function reseedTemplates() {
  const raw = openRawDb();
  seedBuiltinWorkflowTemplates(raw);
  raw.close();
  console.log("Reseeded builtin workflow templates");
}

function ensureShotPrompt() {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, SHOT_ID))
    .get();
  if (!shot) throw new Error("Shot not found");
  if (!shot.prompt?.trim()) {
    db.update(schema.shots)
      .set({ prompt: SHOT_PROMPT, updatedAt: Date.now() })
      .where(eq(schema.shots.id, SHOT_ID))
      .run();
    console.log("Set shot prompt:", SHOT_PROMPT);
  } else {
    console.log("Shot prompt:", shot.prompt.trim());
  }
}

async function waitForBatch(batchId: string, timeoutMs = 900_000) {
  const db = getDb();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const batch = db
      .select()
      .from(schema.assetGenerationBatches)
      .where(eq(schema.assetGenerationBatches.id, batchId))
      .get();
    const options = db
      .select()
      .from(schema.assetGenerationOptions)
      .where(eq(schema.assetGenerationOptions.batchId, batchId))
      .all();
    const finals = filterSelectableShotOptions(options);
    const statusLine = options
      .map(
        (o) =>
          `${o.pipelineStage ?? "main"}:${o.status}${o.statusMessage ? ` (${o.statusMessage})` : ""}`
      )
      .join(" | ");
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] batch=${batch?.status} ${statusLine}`);

    if (
      batch &&
      (batch.status === "awaiting_selection" ||
        batch.status === "failed" ||
        batch.status === "completed")
    ) {
      return { batch, options };
    }
    await sleep(5000);
  }
  throw new Error("Timed out waiting for batch");
}

async function main() {
  const label = process.argv[2] ?? "round-1";
  reseedTemplates();
  ensureShotPrompt();

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, PROJECT_ID))
    .get();
  if (!project) throw new Error("Project not found");

  console.log(`Enqueue composited batch (${label})...`);
  const batch = await enqueueShotPlaceholderBatch(PROJECT_ID, SHOT_ID, 2, {
    replace: true,
  });
  console.log("Batch id:", batch.id, "template:", batch.workflowTemplateId);

  const { batch: done, options } = await waitForBatch(batch.id);
  console.log("Final batch status:", done?.status);

  const finals = filterSelectableShotOptions(options);
  const root = resolveProjectRoot(project);

  const outDir = path.join(
    process.cwd(),
    "scratch",
    "composited-test",
    `${label}-${batch.id}`
  );
  fs.mkdirSync(outDir, { recursive: true });

  for (const option of finals) {
    if (option.outputPath) {
      const src = path.join(root, option.outputPath);
      const dest = path.join(outDir, `${option.id}.png`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log("Saved:", dest);
      } else {
        console.log("Missing output:", src);
      }
    }
    if (option.errorMessage) {
      console.log("Option error:", option.errorMessage);
    }
  }

  const manifest = {
    label,
    batchId: batch.id,
    status: done?.status,
    templateId: batch.workflowTemplateId,
    generationOptionsJson: batch.generationOptionsJson,
    options: options.map((o) => ({
      id: o.id,
      pipelineStage: o.pipelineStage,
      status: o.status,
      outputPath: o.outputPath,
      errorMessage: o.errorMessage,
    })),
    outputDir: outDir,
  };
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("Manifest:", path.join(outDir, "manifest.json"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
