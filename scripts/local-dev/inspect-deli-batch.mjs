import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const db = new Database(
  path.join(os.homedir(), "Documents", "DiffuseCut", "diffusecut.db")
);

const shotId = "sRiy3p8VWsrlWnOpHMMpN";
const shot = db.prepare("SELECT * FROM shots WHERE id = ?").get(shotId);
console.log("shot location:", {
  locationId: shot.location_id,
  locationStateId: shot.location_state_id,
  locationAngleId: shot.location_angle_id,
});

const project = db
  .prepare("SELECT * FROM projects WHERE id = ?")
  .get(shot.project_id);
const root = project.root_path;
console.log("project root:", root);

const batches = db
  .prepare(
    `SELECT id, workflow_template_id, status, created_at
     FROM asset_generation_batches
     WHERE entity_id = ?
     ORDER BY created_at DESC LIMIT 8`
  )
  .all(shotId);
console.log("batches:", batches);

for (const b of batches) {
  const opts = db
    .prepare(
      "SELECT id, pipeline_stage, status, output_path FROM asset_generation_options WHERE batch_id = ?"
    )
    .all(b.id);
  console.log("\nbatch", b.id, opts);
}

// location angle path
if (shot.location_angle_id) {
  const angle = db
    .prepare("SELECT * FROM location_angles WHERE id = ?")
    .get(shot.location_angle_id);
  console.log("\nangle:", angle);
}
