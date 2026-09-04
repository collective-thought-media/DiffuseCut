import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { getAppDataDir, getDbPath } from "@/lib/paths/app-paths";
import { seedBuiltinWorkflowTemplates } from "@/lib/db/seed-builtin-templates";
import fs from "fs";
import path from "path";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logline TEXT NOT NULL DEFAULT '',
      plot TEXT NOT NULL DEFAULT '',
      root_path TEXT,
      default_fps INTEGER NOT NULL DEFAULT 24,
      default_duration_frames INTEGER NOT NULL DEFAULT 72,
      comfyui_endpoints_json TEXT,
      render_settings_json TEXT NOT NULL DEFAULT '{}',
      visual_style_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reference_path TEXT,
      reference_kind TEXT,
      reference_source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reference_path TEXT,
      reference_kind TEXT,
      reference_source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      render_overrides_json TEXT,
      duration_frames INTEGER NOT NULL DEFAULT 72,
      fps INTEGER,
      location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
      placeholder_path TEXT,
      placeholder_kind TEXT,
      video_path TEXT,
      trim_in_frames INTEGER NOT NULL DEFAULT 0,
      trim_out_frames INTEGER,
      render_status TEXT NOT NULL DEFAULT 'pending',
      render_job_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shot_characters (
      shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      PRIMARY KEY (shot_id, character_id)
    );
    CREATE TABLE IF NOT EXISTS audio_tracks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_frame INTEGER NOT NULL DEFAULT 0,
      duration_frames INTEGER,
      span_mode TEXT NOT NULL DEFAULT 'full_timeline',
      target_shot_id TEXT,
      prompt_text TEXT,
      volume REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      workflow_json TEXT NOT NULL,
      bindings_json TEXT NOT NULL DEFAULT '{}',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comfyui_model_cache (
      id TEXT PRIMARY KEY,
      base_url TEXT NOT NULL,
      folder TEXT NOT NULL,
      filenames_json TEXT NOT NULL DEFAULT '[]',
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
      workflow_template_id TEXT NOT NULL REFERENCES workflow_templates(id),
      comfyui_endpoint_url TEXT NOT NULL,
      comfyui_prompt_id TEXT,
      frame_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0,
      current_node_id TEXT,
      current_node_label TEXT,
      progress_step INTEGER,
      progress_max INTEGER,
      status_message TEXT,
      last_heartbeat_at INTEGER,
      preview_image_path TEXT,
      error_message TEXT,
      output_path TEXT,
      payload_json TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS text_overlays (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      shot_id TEXT REFERENCES shots(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      start_frame INTEGER NOT NULL,
      end_frame INTEGER NOT NULL,
      style_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      output_path TEXT,
      settings_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      progress REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Incremental migrations for existing databases
  const cols = db.prepare("PRAGMA table_info(workflow_templates)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "purpose")) {
    db.exec(
      `ALTER TABLE workflow_templates ADD COLUMN purpose TEXT NOT NULL DEFAULT 'shot_video'`
    );
  }

  const projectCols = db.prepare("PRAGMA table_info(projects)").all() as {
    name: string;
  }[];
  if (!projectCols.some((c) => c.name === "visual_style_json")) {
    db.exec(
      `ALTER TABLE projects ADD COLUMN visual_style_json TEXT NOT NULL DEFAULT '{}'`
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS character_states (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      look_description TEXT NOT NULL DEFAULT '',
      timeline_note TEXT NOT NULL DEFAULT '',
      reference_path TEXT,
      reference_kind TEXT,
      reference_source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const shotCharacterCols = db
    .prepare("PRAGMA table_info(shot_characters)")
    .all() as { name: string }[];
  if (!shotCharacterCols.some((c) => c.name === "character_state_id")) {
    db.exec(
      `ALTER TABLE shot_characters ADD COLUMN character_state_id TEXT REFERENCES character_states(id) ON DELETE SET NULL`
    );
  }

  backfillCharacterStates(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS location_states (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      look_description TEXT NOT NULL DEFAULT '',
      timeline_note TEXT NOT NULL DEFAULT '',
      reference_path TEXT,
      reference_kind TEXT,
      reference_source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS location_angles (
      id TEXT PRIMARY KEY,
      location_state_id TEXT NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      view_description TEXT NOT NULL DEFAULT '',
      reference_path TEXT,
      reference_kind TEXT,
      reference_source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  backfillLocationStates(db);

  const shotCols = db.prepare("PRAGMA table_info(shots)").all() as {
    name: string;
  }[];
  if (!shotCols.some((c) => c.name === "location_state_id")) {
    db.exec(
      `ALTER TABLE shots ADD COLUMN location_state_id TEXT REFERENCES location_states(id) ON DELETE SET NULL`
    );
  }
  if (!shotCols.some((c) => c.name === "location_angle_id")) {
    db.exec(
      `ALTER TABLE shots ADD COLUMN location_angle_id TEXT REFERENCES location_angles(id) ON DELETE SET NULL`
    );
  }
  if (!shotCols.some((c) => c.name === "visual_reference_focus")) {
    db.exec(
      `ALTER TABLE shots ADD COLUMN visual_reference_focus TEXT NOT NULL DEFAULT 'location'`
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_generation_batches (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      workflow_template_id TEXT NOT NULL REFERENCES workflow_templates(id),
      comfyui_endpoint_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sample_count INTEGER NOT NULL,
      raw_prompt TEXT NOT NULL,
      processed_prompt TEXT NOT NULL,
      negative_prompt TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS asset_generation_options (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES asset_generation_batches(id) ON DELETE CASCADE,
      variant_index INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      comfyui_prompt_id TEXT,
      output_path TEXT,
      progress REAL NOT NULL DEFAULT 0,
      status_message TEXT,
      last_heartbeat_at INTEGER,
      selected INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);
  const batchCols = db
    .prepare("PRAGMA table_info(asset_generation_batches)")
    .all() as { name: string }[];
  if (!batchCols.some((c) => c.name === "generation_options_json")) {
    db.exec(
      `ALTER TABLE asset_generation_batches ADD COLUMN generation_options_json TEXT`
    );
  }
  const audioCols = db.prepare("PRAGMA table_info(audio_tracks)").all() as {
    name: string;
  }[];
  if (!audioCols.some((c) => c.name === "span_mode")) {
    db.exec(
      `ALTER TABLE audio_tracks ADD COLUMN span_mode TEXT NOT NULL DEFAULT 'full_timeline'`
    );
  }
  if (!audioCols.some((c) => c.name === "target_shot_id")) {
    db.exec(`ALTER TABLE audio_tracks ADD COLUMN target_shot_id TEXT`);
  }
  if (!audioCols.some((c) => c.name === "prompt_text")) {
    db.exec(`ALTER TABLE audio_tracks ADD COLUMN prompt_text TEXT`);
  }

  const exportJobCols = db.prepare("PRAGMA table_info(export_jobs)").all() as {
    name: string;
  }[];
  if (!exportJobCols.some((c) => c.name === "progress_message")) {
    db.exec(`ALTER TABLE export_jobs ADD COLUMN progress_message TEXT`);
  }
  if (!exportJobCols.some((c) => c.name === "preview_frame_path")) {
    db.exec(`ALTER TABLE export_jobs ADD COLUMN preview_frame_path TEXT`);
  }
  if (!exportJobCols.some((c) => c.name === "current_frame")) {
    db.exec(`ALTER TABLE export_jobs ADD COLUMN current_frame INTEGER`);
  }
  if (!exportJobCols.some((c) => c.name === "total_frames")) {
    db.exec(`ALTER TABLE export_jobs ADD COLUMN total_frames INTEGER`);
  }

  seedBuiltinWorkflowTemplates(db);
}

function backfillCharacterStates(db: Database.Database) {
  const characters = db
    .prepare(
      `SELECT id, description, reference_path, reference_kind, reference_source, created_at, updated_at FROM characters`
    )
    .all() as {
    id: string;
    description: string;
    reference_path: string | null;
    reference_kind: string | null;
    reference_source: string | null;
    created_at: number;
    updated_at: number;
  }[];

  const countStmt = db.prepare(
    `SELECT COUNT(*) as count FROM character_states WHERE character_id = ?`
  );
  const insertStmt = db.prepare(
    `INSERT INTO character_states (
      id, character_id, name, look_description, timeline_note,
      reference_path, reference_kind, reference_source, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  );

  for (const character of characters) {
    const existing = countStmt.get(character.id) as { count: number };
    if (existing.count > 0) continue;

    const id = `state_${character.id.slice(0, 8)}_${Date.now().toString(36)}`;
    insertStmt.run(
      id,
      character.id,
      "Default look",
      character.description ?? "",
      "",
      character.reference_path,
      character.reference_kind,
      character.reference_source,
      character.created_at,
      character.updated_at
    );
  }
}

function backfillLocationStates(db: Database.Database) {
  const locations = db
    .prepare(
      `SELECT id, description, reference_path, reference_kind, reference_source, created_at, updated_at FROM locations`
    )
    .all() as {
    id: string;
    description: string;
    reference_path: string | null;
    reference_kind: string | null;
    reference_source: string | null;
    created_at: number;
    updated_at: number;
  }[];

  const countStmt = db.prepare(
    `SELECT COUNT(*) as count FROM location_states WHERE location_id = ?`
  );
  const insertStateStmt = db.prepare(
    `INSERT INTO location_states (
      id, location_id, name, look_description, timeline_note,
      reference_path, reference_kind, reference_source, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  );
  const insertAngleStmt = db.prepare(
    `INSERT INTO location_angles (
      id, location_state_id, name, view_description,
      reference_path, reference_kind, reference_source, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  );

  for (const location of locations) {
    const existing = countStmt.get(location.id) as { count: number };
    if (existing.count > 0) continue;

    const stateId = `lstate_${location.id.slice(0, 8)}_${Date.now().toString(36)}`;
    insertStateStmt.run(
      stateId,
      location.id,
      "Default look",
      location.description ?? "",
      "",
      location.reference_path,
      location.reference_kind,
      location.reference_source,
      location.created_at,
      location.updated_at
    );

    const angleId = `langle_${location.id.slice(0, 8)}_${Date.now().toString(36)}`;
    insertAngleStmt.run(
      angleId,
      stateId,
      "Establishing wide",
      "Wide establishing view of the full environment",
      location.reference_path,
      location.reference_kind,
      location.reference_source,
      location.created_at,
      location.updated_at
    );
  }
}

export function getDb() {
  if (_db) return _db;

  const appDataDir = getAppDataDir();
  fs.mkdirSync(appDataDir, { recursive: true });

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(sqlite);

  _db = drizzle(sqlite, { schema });
  return _db;
}

export { schema };
