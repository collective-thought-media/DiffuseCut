import fs from "fs";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import type { AudioTrack, Project, Shot } from "@/lib/db/schema";
import { getDb, schema } from "@/lib/db";
import { applySpanModeToTrack } from "@/lib/finishing/audio-track-timing";
import { shotTimelineFrames } from "@/lib/timing/frames";
import { resolveProjectRoot } from "@/lib/paths/project-paths";
import { generateSfxAudioFile } from "@/lib/services/sfx-audio-generation";
import { resolveSfxGenerationPrompt } from "@/lib/services/resolve-sfx-generation-prompt";
import { buildSfxPromptFromShot } from "@/lib/services/shot-sfx-suggest";
import { nanoid, nowMs } from "@/lib/utils";

export interface ShotSfxInput {
  shotId: string;
  promptText: string;
  label?: string;
}

const DEFAULT_SFX_VOLUME = 0.85;

export function deleteProjectSfxTracks(projectId: string): number {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) return 0;

  const tracks = db
    .select()
    .from(schema.audioTracks)
    .where(
      and(
        eq(schema.audioTracks.projectId, projectId),
        eq(schema.audioTracks.kind, "sfx")
      )
    )
    .all();

  const root = resolveProjectRoot(project);
  for (const track of tracks) {
    if (track.filePath && !track.filePath.includes("pending")) {
      const absolute = path.join(root, track.filePath);
      if (fs.existsSync(absolute)) {
        try {
          fs.unlinkSync(absolute);
        } catch {
          /* ignore */
        }
      }
    }
    db.delete(schema.audioTracks)
      .where(eq(schema.audioTracks.id, track.id))
      .run();
  }

  return tracks.length;
}

export function createSfxTracksForShots(options: {
  project: Project;
  shots: Shot[];
  suggestions: ShotSfxInput[];
  totalFrames: number;
  replaceExisting?: boolean;
}): AudioTrack[] {
  const db = getDb();
  if (options.replaceExisting) {
    deleteProjectSfxTracks(options.project.id);
  }

  const shotById = new Map(options.shots.map((shot) => [shot.id, shot]));
  const created: AudioTrack[] = [];
  const ts = nowMs();

  for (const suggestion of options.suggestions) {
    const shot = shotById.get(suggestion.shotId);
    if (!shot) continue;

    const shotIndex = options.shots.findIndex((s) => s.id === shot.id);
    const draft = applySpanModeToTrack(
      {
        startFrame: 0,
        durationFrames: shot.durationFrames,
        spanMode: "single_shot",
        targetShotId: shot.id,
      },
      options.shots,
      options.totalFrames,
      {
        spanMode: "single_shot",
        targetShotId: shot.id,
      }
    );

    const id = nanoid();
    const label =
      suggestion.label?.trim() ||
      `SFX: ${shot.title?.trim() || `Shot ${shotIndex + 1}`}`;

    const row = {
      id,
      projectId: options.project.id,
      kind: "sfx" as const,
      label,
      filePath: "audio/tracks/pending",
      startFrame: draft.startFrame,
      durationFrames: draft.durationFrames,
      spanMode: "single_shot",
      targetShotId: shot.id,
      promptText: buildSfxPromptFromShot(shot, shotIndex),
      volume: DEFAULT_SFX_VOLUME,
      createdAt: ts,
      updatedAt: ts,
    };

    db.insert(schema.audioTracks).values(row).run();
    const track = db
      .select()
      .from(schema.audioTracks)
      .where(eq(schema.audioTracks.id, id))
      .get()!;
    created.push(track);
  }

  return created;
}

export async function generateSfxTrackAudio(options: {
  project: Project;
  track: AudioTrack;
  shots: Shot[];
  fps: number;
}): Promise<AudioTrack> {
  const resolved = resolveSfxGenerationPrompt({
    track: options.track,
    shots: options.shots,
  });

  const shot = options.shots.find((s) => s.id === options.track.targetShotId);
  const durationSeconds = shot
    ? Math.max(0.5, shotTimelineFrames(shot) / options.fps)
    : Math.max(
        0.5,
        (options.track.durationFrames ?? options.fps * 2) / options.fps
      );

  const projectRoot = resolveProjectRoot(options.project);
  const fileName = `sfx-${options.track.id}-${Date.now()}.m4a`;
  const relativePath = path
    .join("audio", "tracks", fileName)
    .replace(/\\/g, "/");
  const absolutePath = path.join(projectRoot, relativePath);

  await generateSfxAudioFile({
    prompt: resolved.brief,
    modelPrompt: resolved.modelPrompt,
    strikeModelPrompt: resolved.strikeModelPrompt,
    bedModelPrompt: resolved.bedModelPrompt,
    durationSeconds,
    outputAbsolutePath: absolutePath,
  });

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Generated SFX file missing for ${options.track.label}.`);
  }

  const db = getDb();
  const ts = nowMs();
  db.update(schema.audioTracks)
    .set({
      filePath: relativePath,
      promptText: resolved.brief,
      updatedAt: ts,
    })
    .where(eq(schema.audioTracks.id, options.track.id))
    .run();

  return db
    .select()
    .from(schema.audioTracks)
    .where(eq(schema.audioTracks.id, options.track.id))
    .get()!;
}

export function listProjectSfxTracks(projectId: string): AudioTrack[] {
  const db = getDb();
  return db
    .select()
    .from(schema.audioTracks)
    .where(
      and(
        eq(schema.audioTracks.projectId, projectId),
        eq(schema.audioTracks.kind, "sfx")
      )
    )
    .orderBy(asc(schema.audioTracks.createdAt))
    .all();
}
