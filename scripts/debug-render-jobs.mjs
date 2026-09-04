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

const jobs = db
  .prepare(
    `SELECT id, project_id, shot_id, status, progress, error_message, comfyui_prompt_id, created_at, updated_at, started_at, completed_at
     FROM render_jobs ORDER BY created_at DESC LIMIT 20`
  )
  .all();

console.log("RENDER JOBS:");
console.table(jobs);

const byStatus = db
  .prepare(`SELECT status, COUNT(*) as c FROM render_jobs GROUP BY status`)
  .all();
console.log("\nBY STATUS:");
console.table(byStatus);
