import Database from "better-sqlite3";
import path from "path";
import os from "os";

const dbPath = path.join(os.homedir(), "Documents", "DiffuseCut", "diffusecut.db");
const db = new Database(dbPath);
const angleId = process.argv[2] ?? "JZtfIz0k0K4LO4DOMr6_l";

const batches = db
  .prepare(
    `SELECT id, status, error_message, workflow_template_id, created_at
     FROM asset_generation_batches
     WHERE entity_id = ?
     ORDER BY created_at DESC LIMIT 5`
  )
  .all(angleId);

console.log("Batches:", JSON.stringify(batches, null, 2));

if (batches[0]) {
  const opts = db
    .prepare(
      `SELECT id, status, error_message, status_message, output_path, variant_index
       FROM asset_generation_options WHERE batch_id = ? ORDER BY variant_index`
    )
    .all(batches[0].id);
  console.log("Latest options:", JSON.stringify(opts, null, 2));
}
