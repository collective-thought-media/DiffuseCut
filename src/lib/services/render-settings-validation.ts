import { resolveVideoSampler } from "@/lib/services/image-sampler";
import type { RenderSettings, WorkflowBindings, WorkflowControl } from "@/types";

function bindingsNeedVideoCheckpoint(bindings: WorkflowBindings): boolean {
  return (bindings.controls ?? []).some((control) => control.type === "unet");
}

function resolveCheckpointForBindings(
  bindings: WorkflowBindings,
  renderSettings: RenderSettings
): string | undefined {
  if (bindingsNeedVideoCheckpoint(bindings)) {
    return renderSettings.videoCheckpoint ?? renderSettings.checkpoint;
  }
  return renderSettings.checkpoint;
}

function resolveControlValue(
  controlType: string,
  renderSettings: RenderSettings,
  bindings?: WorkflowBindings
): unknown {
  switch (controlType) {
    case "checkpoint":
      return bindings
        ? resolveCheckpointForBindings(bindings, renderSettings)
        : renderSettings.checkpoint;
    case "unet":
      return renderSettings.videoUnet;
    case "vae":
      return renderSettings.videoVae;
    case "audio_vae":
      return renderSettings.videoAudioVae;
    case "text_encoder":
      return renderSettings.videoTextEncoder;
    case "video_width":
      return renderSettings.videoWidth;
    case "video_height":
      return renderSettings.videoHeight;
    case "model_device":
    case "vae_device":
      return renderSettings.comfyGpuDevice;
    default:
      return undefined;
  }
}

function isEmptyValue(value: unknown): boolean {
  return value == null || value === "";
}

function samplerControlSatisfied(
  control: WorkflowControl,
  renderSettings: RenderSettings
): boolean {
  if (!control.inputs || Object.keys(control.inputs).length === 0) {
    return true;
  }

  const videoSampler = resolveVideoSampler(renderSettings);
  return Object.values(control.inputs).every((valueKey) => {
    const value = videoSampler[valueKey as keyof typeof videoSampler];
    return !isEmptyValue(value);
  });
}

export function getMissingRenderSettingsForBindings(
  bindings: WorkflowBindings,
  renderSettings: RenderSettings
): string[] {
  const missing = new Set<string>();

  for (const control of bindings.controls ?? []) {
    if (control.optional) continue;
    if (control.type === "model_device" || control.type === "vae_device") {
      continue;
    }

    if (control.type === "sampler") {
      if (!samplerControlSatisfied(control, renderSettings)) {
        missing.add(control.label);
      }
      continue;
    }

    const value =
      control.type === "checkpoint"
        ? resolveCheckpointForBindings(bindings, renderSettings)
        : resolveControlValue(control.type, renderSettings, bindings);

    if (isEmptyValue(value)) {
      missing.add(control.label);
    }
  }

  return [...missing];
}

export function validateRenderSettingsForTemplate(
  bindingsJson: string,
  renderSettings: RenderSettings
): { ok: true } | { ok: false; missing: string[] } {
  let bindings: WorkflowBindings = {};
  try {
    bindings = JSON.parse(bindingsJson || "{}") as WorkflowBindings;
  } catch {
    return { ok: true };
  }

  const missing = getMissingRenderSettingsForBindings(bindings, renderSettings);
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}

export function formatMissingRenderSettingsMessage(missing: string[]): string {
  return `Configure render settings before queueing: ${missing.join(", ")}.`;
}
