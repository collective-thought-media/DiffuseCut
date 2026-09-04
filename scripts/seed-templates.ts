import Database from "better-sqlite3";
import path from "path";
import os from "os";
import { seedBuiltinWorkflowTemplates } from "../src/lib/db/seed-builtin-templates";

const dbPath = path.join(os.homedir(), "Documents", "DiffuseCut", "diffusecut.db");
const db = new Database(dbPath);
seedBuiltinWorkflowTemplates(db);
db.close();
console.log("Seeded builtin workflow templates.");
