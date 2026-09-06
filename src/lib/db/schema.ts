import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logline: text("logline").notNull().default(""),
  plot: text("plot").notNull().default(""),
  rootPath: text("root_path"),
  defaultFps: integer("default_fps").notNull().default(24),
  defaultDurationFrames: integer("default_duration_frames").notNull().default(72),
  comfyuiEndpointsJson: text("comfyui_endpoints_json"),
  renderSettingsJson: text("render_settings_json").notNull().default("{}"),
  visualStyleJson: text("visual_style_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  referencePath: text("reference_path"),
  referenceKind: text("reference_kind", { enum: ["image", "video"] }),
  referenceSource: text("reference_source", {
    enum: ["upload", "url", "external_api", "comfyui", "punch_in"],
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const characterStates = sqliteTable("character_states", {
  id: text("id").primaryKey(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lookDescription: text("look_description").notNull().default(""),
  timelineNote: text("timeline_note").notNull().default(""),
  referencePath: text("reference_path"),
  referenceKind: text("reference_kind", { enum: ["image", "video"] }),
  referenceSource: text("reference_source", {
    enum: ["upload", "url", "external_api", "comfyui", "punch_in"],
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const characterAngles = sqliteTable("character_angles", {
  id: text("id").primaryKey(),
  characterStateId: text("character_state_id")
    .notNull()
    .references(() => characterStates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  viewDescription: text("view_description").notNull().default(""),
  referencePath: text("reference_path"),
  referenceKind: text("reference_kind", { enum: ["image", "video"] }),
  referenceSource: text("reference_source", {
    enum: ["upload", "url", "external_api", "comfyui", "punch_in"],
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  referencePath: text("reference_path"),
  referenceKind: text("reference_kind", { enum: ["image", "video"] }),
  referenceSource: text("reference_source", {
    enum: ["upload", "url", "external_api", "comfyui", "punch_in"],
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const locationStates = sqliteTable("location_states", {
  id: text("id").primaryKey(),
  locationId: text("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lookDescription: text("look_description").notNull().default(""),
  timelineNote: text("timeline_note").notNull().default(""),
  referencePath: text("reference_path"),
  referenceKind: text("reference_kind", { enum: ["image", "video"] }),
  referenceSource: text("reference_source", {
    enum: ["upload", "url", "external_api", "comfyui", "punch_in"],
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const locationAngles = sqliteTable("location_angles", {
  id: text("id").primaryKey(),
  locationStateId: text("location_state_id")
    .notNull()
    .references(() => locationStates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  viewDescription: text("view_description").notNull().default(""),
  referencePath: text("reference_path"),
  referenceKind: text("reference_kind", { enum: ["image", "video"] }),
  referenceSource: text("reference_source", {
    enum: ["upload", "url", "external_api", "comfyui", "punch_in"],
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const shots = sqliteTable("shots", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  title: text("title").notNull().default(""),
  prompt: text("prompt").notNull().default(""),
  renderOverridesJson: text("render_overrides_json"),
  durationFrames: integer("duration_frames").notNull().default(72),
  fps: integer("fps"),
  locationId: text("location_id").references(() => locations.id, {
    onDelete: "set null",
  }),
  locationStateId: text("location_state_id").references(
    () => locationStates.id,
    { onDelete: "set null" }
  ),
  locationAngleId: text("location_angle_id").references(
    () => locationAngles.id,
    { onDelete: "set null" }
  ),
  visualReferenceFocus: text("visual_reference_focus", {
    enum: ["location", "character"],
  })
    .notNull()
    .default("location"),
  placeholderPath: text("placeholder_path"),
  placeholderKind: text("placeholder_kind", { enum: ["image", "video"] }),
  videoPath: text("video_path"),
  trimInFrames: integer("trim_in_frames").notNull().default(0),
  trimOutFrames: integer("trim_out_frames"),
  renderStatus: text("render_status", {
    enum: ["pending", "queued", "rendering", "done", "failed"],
  })
    .notNull()
    .default("pending"),
  renderJobId: text("render_job_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const shotCharacters = sqliteTable(
  "shot_characters",
  {
    shotId: text("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    characterStateId: text("character_state_id").references(
      () => characterStates.id,
      { onDelete: "set null" }
    ),
  },
  (t) => [primaryKey({ columns: [t.shotId, t.characterId] })]
);

export const audioTracks = sqliteTable("audio_tracks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["music", "voiceover", "sfx"] }).notNull(),
  label: text("label").notNull(),
  filePath: text("file_path").notNull(),
  startFrame: integer("start_frame").notNull().default(0),
  durationFrames: integer("duration_frames"),
  spanMode: text("span_mode").notNull().default("full_timeline"),
  targetShotId: text("target_shot_id"),
  promptText: text("prompt_text"),
  volume: real("volume").notNull().default(1.0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const workflowTemplates = sqliteTable("workflow_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  workflowJson: text("workflow_json").notNull(),
  bindingsJson: text("bindings_json").notNull().default("{}"),
  purpose: text("purpose", {
    enum: ["shot_video", "character_sheet", "location_sheet"],
  })
    .notNull()
    .default("shot_video"),
  isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const assetGenerationBatches = sqliteTable("asset_generation_batches", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  entityType: text("entity_type", {
    enum: [
      "character",
      "character_state",
      "character_angle",
      "location_angle",
      "shot",
    ],
  }).notNull(),
  entityId: text("entity_id").notNull(),
  workflowTemplateId: text("workflow_template_id")
    .notNull()
    .references(() => workflowTemplates.id),
  comfyuiEndpointUrl: text("comfyui_endpoint_url").notNull(),
  status: text("status", {
    enum: [
      "queued",
      "running",
      "awaiting_selection",
      "archived",
      "completed",
      "failed",
      "cancelled",
    ],
  })
    .notNull()
    .default("queued"),
  sampleCount: integer("sample_count").notNull(),
  rawPrompt: text("raw_prompt").notNull(),
  processedPrompt: text("processed_prompt").notNull(),
  negativePrompt: text("negative_prompt").notNull(),
  generationOptionsJson: text("generation_options_json"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const assetGenerationOptions = sqliteTable("asset_generation_options", {
  id: text("id").primaryKey(),
  batchId: text("batch_id")
    .notNull()
    .references(() => assetGenerationBatches.id, { onDelete: "cascade" }),
  variantIndex: integer("variant_index").notNull(),
  seed: integer("seed").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("queued"),
  comfyuiPromptId: text("comfyui_prompt_id"),
  outputPath: text("output_path"),
  progress: real("progress").notNull().default(0),
  statusMessage: text("status_message"),
  lastHeartbeatAt: integer("last_heartbeat_at"),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
  pipelineStage: text("pipeline_stage"),
  pipelineGroupId: text("pipeline_group_id"),
  dependsOnOptionId: text("depends_on_option_id"),
});

export const comfyuiModelCache = sqliteTable("comfyui_model_cache", {
  id: text("id").primaryKey(),
  baseUrl: text("base_url").notNull(),
  folder: text("folder").notNull(),
  filenamesJson: text("filenames_json").notNull().default("[]"),
  fetchedAt: integer("fetched_at").notNull(),
});

export const renderJobs = sqliteTable("render_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  shotId: text("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  workflowTemplateId: text("workflow_template_id")
    .notNull()
    .references(() => workflowTemplates.id),
  comfyuiEndpointUrl: text("comfyui_endpoint_url").notNull(),
  comfyuiPromptId: text("comfyui_prompt_id"),
  frameCount: integer("frame_count").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("queued"),
  progress: real("progress").notNull().default(0),
  currentNodeId: text("current_node_id"),
  currentNodeLabel: text("current_node_label"),
  progressStep: integer("progress_step"),
  progressMax: integer("progress_max"),
  statusMessage: text("status_message"),
  lastHeartbeatAt: integer("last_heartbeat_at"),
  previewImagePath: text("preview_image_path"),
  errorMessage: text("error_message"),
  outputPath: text("output_path"),
  payloadJson: text("payload_json"),
  /**
   * Project-relative path of a per-shot dialog audio slice for lip sync
   * renders (audio-conditioned LTX). Null for normal renders.
   */
  lipSyncAudioPath: text("lip_sync_audio_path"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const textOverlays = sqliteTable("text_overlays", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  shotId: text("shot_id").references(() => shots.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  startFrame: integer("start_frame").notNull(),
  endFrame: integer("end_frame").notNull(),
  styleJson: text("style_json").notNull().default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const exportJobs = sqliteTable("export_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("queued"),
  outputPath: text("output_path"),
  /** JSON: probed { width, height, durationSeconds, overlayCount, audioSource }. */
  outputMetaJson: text("output_meta_json"),
  settingsJson: text("settings_json").notNull().default("{}"),
  errorMessage: text("error_message"),
  progress: real("progress").notNull().default(0),
  progressMessage: text("progress_message"),
  previewFramePath: text("preview_frame_path"),
  currentFrame: integer("current_frame"),
  totalFrames: integer("total_frames"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Project = typeof projects.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type CharacterState = typeof characterStates.$inferSelect;
export type CharacterAngle = typeof characterAngles.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type LocationState = typeof locationStates.$inferSelect;
export type LocationAngle = typeof locationAngles.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type AudioTrack = typeof audioTracks.$inferSelect;
export type TextOverlay = typeof textOverlays.$inferSelect;
export type RenderJob = typeof renderJobs.$inferSelect;
export type ExportJob = typeof exportJobs.$inferSelect;
export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type AssetGenerationBatch = typeof assetGenerationBatches.$inferSelect;
export type AssetGenerationOption = typeof assetGenerationOptions.$inferSelect;
export type WorkflowTemplatePurpose =
  | "shot_video"
  | "character_sheet"
  | "location_sheet";
