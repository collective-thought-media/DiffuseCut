import { describe, expect, it } from "vitest";
import type { RenderJob, Shot } from "@/lib/db/schema";
import {
  deriveShotRenderDisplay,
  displayIsLipSync,
  previewMediaVersion,
  shotDisplayStatusLabel,
} from "@/lib/render-shot-display";

function shot(partial: Partial<Shot> & Pick<Shot, "id">): Shot {
  return {
    id: partial.id,
    projectId: "p1",
    title: partial.title ?? partial.id,
    prompt: "",
    sortOrder: partial.sortOrder ?? 0,
    durationFrames: 72,
    placeholderPath: null,
    placeholderKind: null,
    videoPath: partial.videoPath ?? null,
    locationId: null,
    renderStatus: partial.renderStatus ?? "pending",
    renderJobId: null,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as Shot;
}

function job(partial: Partial<RenderJob> & Pick<RenderJob, "id" | "shotId">): RenderJob {
  return {
    id: partial.id,
    projectId: "p1",
    shotId: partial.shotId,
    workflowTemplateId: "tpl",
    comfyuiEndpointUrl: "http://127.0.0.1:8188",
    comfyuiPromptId: null,
    frameCount: 72,
    status: partial.status ?? "queued",
    progress: partial.progress ?? 0,
    currentNodeId: null,
    currentNodeLabel: null,
    progressStep: null,
    progressMax: null,
    statusMessage: partial.statusMessage ?? null,
    lastHeartbeatAt: null,
    previewImagePath: null,
    errorMessage: null,
    outputPath: partial.outputPath ?? null,
    payloadJson: null,
    createdAt: partial.createdAt ?? 1,
    completedAt: partial.completedAt ?? null,
    ...partial,
  } as RenderJob;
}

describe("render-shot-display", () => {
  it("shows rendered when a prior video exists and a new job is queued", () => {
    const display = deriveShotRenderDisplay(
      shot({
        id: "s1",
        videoPath: "renders/old.mp4",
        renderStatus: "queued",
      }),
      [
        job({
          id: "j-old",
          shotId: "s1",
          status: "completed",
          outputPath: "renders/old.mp4",
          createdAt: 1,
        }),
        job({
          id: "j-new",
          shotId: "s1",
          status: "queued",
          createdAt: 2,
        }),
      ]
    );

    expect(display.displayStatus).toBe("rendered");
    expect(display.playablePath).toBe("renders/old.mp4");
    expect(display.showingPriorRender).toBe(true);
    expect(display.statusMessage).toBe("Re-render queued");
  });

  it("keeps playable video when the newest job failed but an older job completed", () => {
    const display = deriveShotRenderDisplay(
      shot({
        id: "s3",
        videoPath: "renders/good.mp4",
      }),
      [
        job({
          id: "j-fail",
          shotId: "s3",
          status: "failed",
          errorMessage: "VAE is invalid",
          createdAt: 3,
        }),
        job({
          id: "j-good",
          shotId: "s3",
          status: "completed",
          outputPath: "renders/good.mp4",
          createdAt: 2,
        }),
      ]
    );

    expect(display.displayStatus).toBe("rendered");
    expect(display.playablePath).toBe("renders/good.mp4");
  });

  it("uses the running job for progress", () => {
    const display = deriveShotRenderDisplay(
      shot({ id: "s2" }),
      [
        job({
          id: "j-run",
          shotId: "s2",
          status: "running",
          progress: 0.5,
          statusMessage: "Progress 4/8",
          createdAt: 2,
        }),
      ]
    );

    expect(display.displayStatus).toBe("rendering");
    expect(display.progress).toBe(0.5);
    expect(display.statusMessage).toBe("Progress 4/8");
  });

  it("keeps a stable preview media version while re-rendering over a completed job", () => {
    const completedAt = 1000;
    const display = deriveShotRenderDisplay(
      shot({
        id: "s4",
        videoPath: "renders/old.mp4",
      }),
      [
        job({
          id: "j-new",
          shotId: "s4",
          status: "running",
          progress: 0.15,
          lastHeartbeatAt: 5000,
          createdAt: 3,
        }),
        job({
          id: "j-old",
          shotId: "s4",
          status: "completed",
          outputPath: "renders/old.mp4",
          completedAt,
          createdAt: 2,
        }),
      ]
    );

    expect(display.showingPriorRender).toBe(true);
    expect(previewMediaVersion(display)).toBe(completedAt);
    expect(previewMediaVersion(display)).not.toBe(5000);
  });

  it("labels a completed lip sync job separately from a regular render", () => {
    const display = deriveShotRenderDisplay(
      shot({
        id: "s5",
        videoPath: "renders/lipsync.mp4",
        renderStatus: "done",
      }),
      [
        job({
          id: "j-lip",
          shotId: "s5",
          status: "completed",
          outputPath: "renders/lipsync.mp4",
          lipSyncAudioPath: "audio/lipsync/s5.wav",
          createdAt: 4,
        }),
      ]
    );

    expect(displayIsLipSync(display)).toBe(true);
    expect(
      shotDisplayStatusLabel(display.displayStatus, { lipSync: true })
    ).toBe("lip synced");
  });
});
