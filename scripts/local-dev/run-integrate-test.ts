/**
 * Enqueue an Integrate in scene (masked inpaint) shot batch and poll until
 * complete. Saves final stills to scratch/integrate-test/<label>-<batchId>.
 * Usage: npx tsx scripts/local-dev/run-integrate-test.ts [label] [projectId] [shotId]
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

const PROJECT_ID = process.argv[3] ?? "zn2beBqNBbkyWb-G0ZeUv";
const SHOT_ID = process.argv[4] ?? "VK3eDsb037bTj_4CG5KpE";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function reseedTemplates() {
  const raw = new Database(
    path.join(os.homedir(), "Documents", "DiffuseCut", "diffusecut.db")
  );
  seedBuiltinWorkflowTemplates(raw);
  raw.close();
  console.log("Reseeded builtin workflow templates");
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
    const statusLine = options
      .map(
        (o) =>
          `${o.pipelineStage ?? "main"}:${o.status}${o.statusMessage ? ` (${o.statusMessage})` : ""}`
      )
      .join(" | ");
    console.log(
      `[${Math.round((Date.now() - started) / 1000)}s] batch=${batch?.status} ${statusLine}`
    );

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

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, PROJECT_ID))
    .get();
  if (!project) throw new Error("Project not found");
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, SHOT_ID))
    .get();
  if (!shot) throw new Error("Shot not found");
  console.log("Shot:", shot.title, "|", shot.prompt?.slice(0, 100));

  console.log(`Enqueue integrate batch (${label})...`);
  const batch = await enqueueShotPlaceholderBatch(PROJECT_ID, SHOT_ID, 2, {
    replace: true,
  });
  console.log("Batch id:", batch.id, "template:", batch.workflowTemplateId);
  console.log("Options JSON:", batch.generationOptionsJson);

  const { batch: done, options } = await waitForBatch(batch.id);
  console.log("Final batch status:", done?.status);

  const finals = filterSelectableShotOptions(options);
  const root = resolveProjectRoot(project);

  const outDir = path.join(
    process.cwd(),
    "scratch",
    "integrate-test",
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

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(
      {
        label,
        batchId: batch.id,
        status: done?.status,
        templateId: batch.workflowTemplateId,
        generationOptionsJson: batch.generationOptionsJson,
        options: options.map((o) => ({
          id: o.id,
          status: o.status,
          outputPath: o.outputPath,
          errorMessage: o.errorMessage,
        })),
      },
      null,
      2
    )
  );
  console.log("Done:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
