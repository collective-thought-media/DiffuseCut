import Database from "better-sqlite3";
import path from "path";
import os from "os";

const dbPath = path.join(os.homedir(), "Documents", "DiffuseCut", "diffusecut.db");
const db = new Database(dbPath);

console.log("projects:", db.prepare("SELECT id, name FROM projects").all());
const shots = db
  .prepare(
    `SELECT s.id, s.title, s.project_id, s.render_overrides_json
     FROM shots s
     ORDER BY s.updated_at DESC
     LIMIT 20`
  )
  .all();
console.log("recent shots:", shots);
