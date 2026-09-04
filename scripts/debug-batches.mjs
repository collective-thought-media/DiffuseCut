import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

const dataDir =
  process.env.DIFFUSECUT_DATA_DIR ||
  path.join(os.homedir(), "Documents", "DiffuseCut");
const dbPath = path.join(dataDir, "diffusecut.db");

if (!fs.existsSync(dbPath)) {
  console.log("No DB at", dbPath);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

const batches = db
  .prepare(
    `SELECT id, entity_type, entity_id, status, error_message, comfyui_endpoint_url, created_at
     FROM asset_generation_batches ORDER BY created_at DESC LIMIT 8`
  )
  .all();

const options = db
  .prepare(
    `SELECT id, batch_id, variant_index, status, status_message, error_message, comfyui_prompt_id
     FROM asset_generation_options ORDER BY created_at DESC LIMIT 15`
  )
  .all();

const renderJobs = db
  .prepare(
    `SELECT id, status, shot_id FROM render_jobs WHERE status IN ('queued','running') LIMIT 5`
  )
  .all();

console.log("DATA_DIR:", dataDir);
console.log("\nRECENT BATCHES:");
console.table(batches);
console.log("\nRECENT OPTIONS:");
console.table(options);
const runningOptions = db
  .prepare(
    `SELECT id, batch_id, status FROM asset_generation_options WHERE status = 'running'`
  )
  .all();

const queuedCount = db
  .prepare(`SELECT count(*) as c FROM asset_generation_options WHERE status = 'queued'`)
  .get();

console.log("\nRUNNING OPTIONS:");
console.table(runningOptions);
console.log("QUEUED COUNT:", queuedCount?.c);
