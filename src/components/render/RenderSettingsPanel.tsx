"use client";

import type { RenderSettings } from "@/types";
import { Card, Input, Label, Select, Textarea } from "@/components/ui/button";
import { ImageModelPicker } from "@/components/render/ImageModelPicker";
import { IMAGE_ENGINE_KREA2 } from "@/lib/services/image-checkpoints";
import {
  DEFAULT_IMAGE_SAMPLER,
  DEFAULT_VIDEO_SAMPLER,
} from "@/lib/services/image-sampler";
import {
  applyProjectAspectRatioToRenderSettings,
  getReferenceAspectRatioLabel,
  resolveVideoDimensionsForAspectRatio,
} from "@/lib/services/reference-aspect-ratio";

interface RenderSettingsPanelProps {
  settings: RenderSettings;
  onChange: (settings: RenderSettings) => void;
  showVideoSettings?: boolean;
  videoEngine?: "ltx" | "minimax" | "generic";
  variant?: "default" | "sidebar";
  projectId?: string;
  availableImageCheckpoints?: string[];
  krea2Available?: boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-neutral-800 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:border-t-0 first:pt-0">
      {children}
    </p>
  );
}

export function RenderSettingsPanel({
  settings,
  onChange,
  showVideoSettings = false,
  videoEngine = "generic",
  variant = "default",
  projectId,
  availableImageCheckpoints,
  krea2Available = false,
}: RenderSettingsPanelProps) {
  const imageSampler = {
    ...DEFAULT_IMAGE_SAMPLER,
    ...settings.imageSampler,
  };
  const videoSampler = {
    ...DEFAULT_VIDEO_SAMPLER,
    ...settings.sampler,
  };
  const compact = variant === "sidebar";
  const projectVideoSize = resolveVideoDimensionsForAspectRatio(
    settings.referenceAspectRatio
  );
  const videoSize = applyProjectAspectRatioToRenderSettings(settings);

  const fields = (
    <>
      <div id="image-generation" className="scroll-mt-4 space-y-4">
        <SectionLabel>Image generation</SectionLabel>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Storyboard stills, character sheets, and location references.
          </p>
        )}

        {projectId &&
        availableImageCheckpoints &&
        (availableImageCheckpoints.length > 0 || krea2Available) ? (
          <ImageModelPicker
            projectId={projectId}
            checkpoints={availableImageCheckpoints}
            imageEngine={settings.imageEngine ?? "sdxl"}
            krea2Available={krea2Available}
            value={
              settings.imageEngine === "krea2"
                ? settings.imageUnet ?? ""
                : settings.checkpoint &&
                    availableImageCheckpoints.includes(settings.checkpoint)
                  ? settings.checkpoint
                  : availableImageCheckpoints[0]
            }
            onValueChange={(checkpoint) =>
              onChange({
                ...settings,
                checkpoint:
                  checkpoint === IMAGE_ENGINE_KREA2
                    ? settings.checkpoint
                    : checkpoint,
              })
            }
            onEngineChange={(engine) =>
              onChange({ ...settings, imageEngine: engine })
            }
            onSaved={(_checkpoint, engine) =>
              onChange({ ...settings, imageEngine: engine })
            }
            autoSave
            id="checkpoint"
          />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="checkpoint" className={compact ? "text-xs" : undefined}>
              Image model (SDXL checkpoint)
            </Label>
            <Input
              id="checkpoint"
              value={settings.checkpoint ?? ""}
              onChange={(e) =>
                onChange({ ...settings, checkpoint: e.target.value || undefined })
              }
              placeholder="realismFusion_v10.safetensors"
            />
            {!compact && (
              <p className="text-xs text-muted-foreground">
                Exact filename from ComfyUI models/checkpoints. Use the picker on
                the storyboard or character sheet when ComfyUI is online.
              </p>
            )}
          </div>
        )}

        {settings.imageEngine === "krea2" && (
          <div className="grid gap-2 sm:grid-cols-1">
            <div className="space-y-1.5">
              <Label htmlFor="image-unet">Krea UNET</Label>
              <Input
                id="image-unet"
                value={settings.imageUnet ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    imageUnet: e.target.value || undefined,
                  })
                }
                placeholder="krea2_turbo_fp8_scaled.safetensors"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="image-text-encoder">Krea text encoder</Label>
              <Input
                id="image-text-encoder"
                value={settings.imageTextEncoder ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    imageTextEncoder: e.target.value || undefined,
                  })
                }
                placeholder="qwen3vl_4b_fp8_scaled.safetensors"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="image-vae">Krea VAE</Label>
              <Input
                id="image-vae"
                value={settings.imageVae ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    imageVae: e.target.value || undefined,
                  })
                }
                placeholder="qwen_image_vae.safetensors"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="image-steps">Image steps</Label>
            <Input
              id="image-steps"
              type="number"
              min={1}
              value={imageSampler.steps ?? DEFAULT_IMAGE_SAMPLER.steps}
              onChange={(e) =>
                onChange({
                  ...settings,
                  imageSampler: {
                    ...imageSampler,
                    steps: Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="image-cfg">Image CFG</Label>
            <Input
              id="image-cfg"
              type="number"
              min={0}
              step={0.5}
              value={imageSampler.cfg ?? DEFAULT_IMAGE_SAMPLER.cfg}
              onChange={(e) =>
                onChange({
                  ...settings,
                  imageSampler: {
                    ...imageSampler,
                    cfg: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="image-default-negative"
            className={compact ? "text-xs" : undefined}
          >
            Default extra negative prompt (still images)
          </Label>
          <Textarea
            id="image-default-negative"
            value={settings.imageDefaultNegative ?? ""}
            onChange={(e) =>
              onChange({
                ...settings,
                imageDefaultNegative: e.target.value || undefined,
              })
            }
            placeholder="Optional. Merged into storyboard stills, character sheets, and location references for this project."
            rows={compact ? 2 : 3}
            className="text-sm"
          />
        </div>
      </div>

      {showVideoSettings && (
        <div id="video-generation" className="scroll-mt-4 space-y-4">
          <SectionLabel>Video generation</SectionLabel>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {videoEngine === "minimax"
                ? "MiniMax H3 shot renders from the queue. Separate from SDXL image settings above."
                : videoEngine === "ltx"
                  ? "LTX shot renders from the queue. Separate from SDXL image settings above."
                  : "Shot video renders from the queue. Separate from SDXL image settings above."}
            </p>
          )}

          {videoEngine === "ltx" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="video-checkpoint"
                className={compact ? "text-xs" : undefined}
              >
                Video checkpoint (LTX)
              </Label>
              <Input
                id="video-checkpoint"
                value={settings.videoCheckpoint ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    videoCheckpoint: e.target.value || undefined,
                  })
                }
                placeholder="ltx_checkpoint.safetensors"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="video-unet" className={compact ? "text-xs" : undefined}>
              {videoEngine === "minimax" ? "Diffusion model (UNET)" : "Video UNET"}
            </Label>
            <Input
              id="video-unet"
              value={settings.videoUnet ?? ""}
              onChange={(e) =>
                onChange({
                  ...settings,
                  videoUnet: e.target.value || undefined,
                })
              }
              placeholder={
                videoEngine === "minimax"
                  ? "minimax_h3_fl2va_pruned_int8_convrot.safetensors"
                  : "your_video_unet.safetensors"
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video-vae">Video VAE</Label>
            <Input
              id="video-vae"
              value={settings.videoVae ?? ""}
              onChange={(e) =>
                onChange({
                  ...settings,
                  videoVae: e.target.value || undefined,
                })
              }
              placeholder="your_video_vae.safetensors"
            />
          </div>

          {videoEngine === "minimax" && (
            <div className="space-y-1.5">
              <Label htmlFor="video-audio-vae">Audio VAE (MiniMax H3)</Label>
              <Input
                id="video-audio-vae"
                value={settings.videoAudioVae ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    videoAudioVae: e.target.value || undefined,
                  })
                }
                placeholder="minimax_h3_audio_vae_fp32.safetensors"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="video-text-encoder">Text encoder</Label>
            <Input
              id="video-text-encoder"
              value={settings.videoTextEncoder ?? ""}
              onChange={(e) =>
                onChange({
                  ...settings,
                  videoTextEncoder: e.target.value || undefined,
                })
              }
              placeholder="text_encoder.safetensors"
            />
          </div>

          <SectionLabel>Video output</SectionLabel>
          <p className="text-xs text-muted-foreground">
            Defaults to {getReferenceAspectRatioLabel(settings.referenceAspectRatio)}.
            Set the project aspect ratio once. You do not need to enter these
            again unless you want a custom size.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="video-width">Output width</Label>
              <Input
                id="video-width"
                type="number"
                min={64}
                value={videoSize.videoWidth ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    videoWidth: e.target.value
                      ? Number(e.target.value)
                      : projectVideoSize.width,
                  })
                }
                placeholder={String(projectVideoSize.width)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="video-height">Output height</Label>
              <Input
                id="video-height"
                type="number"
                min={64}
                value={videoSize.videoHeight ?? ""}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    videoHeight: e.target.value
                      ? Number(e.target.value)
                      : projectVideoSize.height,
                  })
                }
                placeholder={String(projectVideoSize.height)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video-default-negative">Default negative prompt</Label>
            <Textarea
              id="video-default-negative"
              value={settings.videoDefaultNegative ?? ""}
              onChange={(e) =>
                onChange({
                  ...settings,
                  videoDefaultNegative: e.target.value || undefined,
                })
              }
              className="min-h-[52px] text-xs"
              placeholder="Optional negative prompt merged with shot overrides"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comfy-gpu-device">GPU device (optional)</Label>
            <Input
              id="comfy-gpu-device"
              value={settings.comfyGpuDevice ?? ""}
              onChange={(e) =>
                onChange({
                  ...settings,
                  comfyGpuDevice: e.target.value || undefined,
                })
              }
              placeholder="default or gpu:0"
            />
            {!compact && (
              <p className="text-xs text-muted-foreground">
                ComfyUI device string for video model loaders. Leave empty to use
                the workflow default on the GPU server.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="video-steps">Video steps</Label>
              <Input
                id="video-steps"
                type="number"
                min={1}
                value={videoSampler.steps ?? DEFAULT_VIDEO_SAMPLER.steps}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    sampler: {
                      ...videoSampler,
                      steps: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="video-cfg">Video CFG</Label>
              <Input
                id="video-cfg"
                type="number"
                min={0}
                step={0.5}
                value={videoSampler.cfg ?? DEFAULT_VIDEO_SAMPLER.cfg}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    sampler: {
                      ...videoSampler,
                      cfg: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      <SectionLabel>Shared</SectionLabel>

      <div className="space-y-1.5">
        <Label htmlFor="seed-mode">Seed mode</Label>
        <Select
          id="seed-mode"
          value={settings.seedMode ?? "random"}
          onChange={(e) =>
            onChange({
              ...settings,
              seedMode: e.target.value as RenderSettings["seedMode"],
            })
          }
        >
          <option value="random">Random</option>
          <option value="fixed">Fixed</option>
          <option value="increment">Increment</option>
        </Select>
      </div>

      {settings.seedMode === "fixed" && (
        <div className="space-y-1.5">
          <Label htmlFor="seed">Seed</Label>
          <Input
            id="seed"
            type="number"
            value={settings.seed ?? 0}
            onChange={(e) =>
              onChange({ ...settings, seed: Number(e.target.value) })
            }
          />
        </div>
      )}
    </>
  );

  if (compact) {
    return (
      <Card className="mb-0 space-y-4 p-4">
        <div>
          <h3 className="text-sm font-medium">Generation settings</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Image settings at top, video engine fields below when a shot video
            template is selected.
          </p>
        </div>
        <div className="space-y-4">{fields}</div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <h3 className="font-medium">Generation settings</h3>
      {fields}
    </Card>
  );
}
