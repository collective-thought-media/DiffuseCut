import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { AudioTrack, RenderJob, Shot } from "@/lib/db/schema";
import { resolveProjectRoot, resolveMediaPath } from "@/lib/paths/project-paths";
import { getFfmpegPathSetting } from "@/lib/services/settings";
import { resolveTrackTiming } from "@/lib/finishing/audio-track-timing";
import {
  shotTimelineFrames,
  totalTimelineFrames,
  trimmedShotStartFrame,
} from "@/lib/timing/frames";
import { enqueueRenderJobs } from "@/lib/services/render-queue";
import { BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID } from "@/lib/db/builtin-template-ids";

/**
 * One overlapping window between a shot and a dialog (voiceover) track,
 * expressed in the coordinates needed to rebuild it inside the rendered clip.
 */
export interface LipSyncSlice {
  track: AudioTrack;
  /** Seconds into the track's audio file where the overlap starts. */
  sourceOffsetSec: number;
  /** Length of the overlap in seconds. */
  durationSec: number;
  /**
   * Seconds into the FULL (untrimmed) rendered clip where the overlap must
   * land. Includes the shot's trim-in so lip sync survives later trimming.
   */
  clipOffsetSec: number;
}

export interface LipSyncShotPlan {
  shot: Shot;
  slices: LipSyncSlice[];
}

/**
 * Build the prompt for a lip sync render. LTX 2.3 IA2V only produces mouth
 * movement when the prompt LEADS with the speech act; a static scene
 * description first (with a speech clause appended) renders a closed mouth.
 * This mirrors the structured speaking prompt proven in production IA2V runs:
 * speech contract first, the spoken words when known, then the shot's scene
 * description as context.
 */
export function buildLipSyncShotPrompt(
  scenePrompt: string,
  dialogText?: string | null
): string {
  const parts = [
    "The person in frame is speaking directly to the camera with clear " +
      "natural lip sync matching the provided dialog audio exactly, mouth " +
      "shapes follow the words, natural facial expression and subtle head " +
      "movement while talking, locked face and wardrobe continuity. " +
      "Continuous motion, no freeze, no still hold.",
  ];
  const dialog = dialogText?.trim();
  if (dialog) {
    parts.push(`dialog being spoken: "${dialog}"`);
  }
  parts.push(
    "action: Speaking with accurate lip sync to the provided audio for the " +
      "full duration"
  );
  // Scene last: the payload builder appends the visual style suffix to the
  // end of the prompt, and it must join the scene description, not the
  // speech contract.
  const scene = scenePrompt.trim();
  if (scene) {
    parts.push(`scene: ${scene}`);
  }
  return parts.join("\n\n");
}

/**
 * Dialog text spoken over a shot, for embedding in the lip sync prompt.
 * Joins the promptText of every overlapping voiceover track (present for
 * generated voiceovers; null for uploaded files, where the render falls back
 * to the generic speech contract).
 */
export function getLipSyncDialogText(
  projectId: string,
  shotId: string
): string | null {
  const { plans } = planLipSyncShots(projectId);
  const plan = plans.find((p) => p.shot.id === shotId);
  if (!plan) return null;
  const texts = [
    ...new Set(
      plan.slices
        .map((slice) => slice.track.promptText?.trim())
        .filter((t): t is string => Boolean(t))
    ),
  ];
  return texts.length > 0 ? texts.join(" ") : null;
}

async function configureFfmpeg(): Promise<void> {
  const custom = await getFfmpegPathSetting();
  if (custom) {
    ffmpeg.setFfmpegPath(custom);
  }
}

function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on("end", () => resolve()).on("error", (err) => reject(err)).run();
  });
}

/**
 * For every shot in the project, compute which portions of the dialog
 * (voiceover) tracks overlap it on the trimmed timeline. Shots with no
 * overlap are omitted.
 */
export function planLipSyncShots(projectId: string): {
  fps: number;
  plans: LipSyncShotPlan[];
} {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const fps = project.defaultFps ?? 24;

  const shots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, projectId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const dialogTracks = db
    .select()
    .from(schema.audioTracks)
    .where(
      and(
        eq(schema.audioTracks.projectId, projectId),
        eq(schema.audioTracks.kind, "voiceover")
      )
    )
    .all()
    .filter((track) => Boolean(track.filePath));

  const totalFrames = totalTimelineFrames(shots);
  const plans: LipSyncShotPlan[] = [];

  for (const [index, shot] of shots.entries()) {
    const shotStart = trimmedShotStartFrame(shots, index);
    const span = shotTimelineFrames(shot);
    const trimIn = shot.trimInFrames ?? 0;
    const slices: LipSyncSlice[] = [];

    for (const track of dialogTracks) {
      const timing = resolveTrackTiming(track, shots, totalFrames);
      const overlapStart = Math.max(shotStart, timing.startFrame);
      const overlapEnd = Math.min(shotStart + span, timing.endFrame);
      if (overlapEnd - overlapStart < 1) continue;

      slices.push({
        track,
        sourceOffsetSec: (overlapStart - timing.startFrame) / fps,
        durationSec: (overlapEnd - overlapStart) / fps,
        clipOffsetSec: (trimIn + (overlapStart - shotStart)) / fps,
      });
    }

    if (slices.length > 0) {
      plans.push({ shot, slices });
    }
  }

  return { fps, plans };
}

/**
 * Build a clip-length WAV for one shot: the overlapping dialog slices placed
 * at their in-clip positions, silence everywhere else. The file always spans
 * the shot's FULL durationFrames so the audio latent matches the video latent.
 */
export async function buildLipSyncAudioForShot(
  projectRoot: string,
  plan: LipSyncShotPlan,
  fps: number,
  outputAbsPath: string
): Promise<void> {
  await configureFfmpeg();
  fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true });

  const clipDurationSec = plan.shot.durationFrames / fps;
  const command = ffmpeg();
  const branchLabels: string[] = [];
  const filters: string[] = [];

  plan.slices.forEach((slice, i) => {
    const trackAbs = resolveMediaPath(projectRoot, slice.track.filePath);
    if (!fs.existsSync(trackAbs)) {
      throw new Error(
        `Dialog track file missing: ${slice.track.filePath} (${slice.track.label})`
      );
    }
    command.input(trackAbs);

    const delayMs = Math.max(0, Math.round(slice.clipOffsetSec * 1000));
    const volume = slice.track.volume ?? 1;
    const label = `b${i}`;
    // Mono 44.1k matches the proven LTX IA2V conditioning format.
    filters.push(
      `[${i}:a]atrim=start=${slice.sourceOffsetSec.toFixed(3)}:duration=${slice.durationSec.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=mono,` +
        `volume=${volume},adelay=${delayMs}:all=1[${label}]`
    );
    branchLabels.push(`[${label}]`);
  });

  const mixLabel = plan.slices.length > 1 ? "mix" : "b0";
  if (plan.slices.length > 1) {
    filters.push(
      `${branchLabels.join("")}amix=inputs=${plan.slices.length}:normalize=0[${mixLabel}]`
    );
  }
  filters.push(
    `[${mixLabel}]apad=whole_dur=${clipDurationSec.toFixed(3)},` +
      `atrim=end=${clipDurationSec.toFixed(3)}[aout]`
  );

  await runFfmpeg(
    command
      .complexFilter(filters)
      .outputOptions([
        "-map",
        "[aout]",
        "-ar",
        "44100",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
      ])
      .output(outputAbsPath)
  );
}

/**
 * Queue lip sync renders for every shot that overlaps a dialog track:
 * slice + pad the audio per shot, then enqueue render jobs on the
 * audio-conditioned LTX template with the slice attached.
 */
export async function enqueueLipSyncRenderJobs(
  projectId: string,
  options?: {
    /** Restrict to specific shots (must still overlap a dialog track). */
    shotIds?: string[];
  }
): Promise<{
  jobs: RenderJob[];
  shotsPlanned: number;
}> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error(`Project not found: ${projectId}`);

  let { fps, plans } = planLipSyncShots(projectId);
  if (options?.shotIds && options.shotIds.length > 0) {
    const wanted = new Set(options.shotIds);
    plans = plans.filter((plan) => wanted.has(plan.shot.id));
  }
  if (plans.length === 0) {
    throw new Error(
      "No shots overlap a dialog track. Add a voiceover file on the Dialog tab (and position it over the shots) first."
    );
  }

  const projectRoot = resolveProjectRoot(project);
  const lipSyncAudioByShotId: Record<string, string> = {};

  for (const plan of plans) {
    const relative = path.join(
      "audio",
      "lipsync",
      `${plan.shot.id}-${Date.now()}.wav`
    );
    const absolute = resolveMediaPath(projectRoot, relative);
    await buildLipSyncAudioForShot(projectRoot, plan, fps, absolute);
    lipSyncAudioByShotId[plan.shot.id] = relative;
  }

  const jobs = await enqueueRenderJobs(
    projectId,
    plans.map((plan) => plan.shot.id),
    BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID,
    { lipSyncAudioByShotId }
  );

  return { jobs, shotsPlanned: plans.length };
}
