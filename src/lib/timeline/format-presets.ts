import type { TimelineFormat } from "@/lib/timeline/types";

export type TimelineFormatPreset = TimelineFormat & {
  id: string;
  label: string;
};

export const TIMELINE_FORMAT_PRESETS: TimelineFormatPreset[] = [
  {
    id: "16:9_1920x1080",
    label: "16:9",
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
  },
  {
    id: "9:16_1080x1920",
    label: "9:16",
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
  },
  {
    id: "1:1_1080x1080",
    label: "1:1",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
  },
  {
    id: "4:3_1440x1080",
    label: "4:3",
    aspectRatio: "4:3",
    width: 1440,
    height: 1080,
  },
  {
    id: "2.39:1_1920x804",
    label: "2.39:1",
    aspectRatio: "2.39:1",
    width: 1920,
    height: 804,
  },
];

export function presetIdForFormat(format: TimelineFormat): string {
  const match = TIMELINE_FORMAT_PRESETS.find(
    (p) =>
      p.width === format.width &&
      p.height === format.height &&
      p.aspectRatio === format.aspectRatio
  );
  return match?.id ?? TIMELINE_FORMAT_PRESETS[0]!.id;
}

export function formatPresetById(id: string): TimelineFormatPreset {
  return (
    TIMELINE_FORMAT_PRESETS.find((p) => p.id === id) ??
    TIMELINE_FORMAT_PRESETS[0]!
  );
}

export type ExportQualityPreset = "source" | "720p" | "1080p" | "4k";

export const EXPORT_QUALITY_PRESETS: { id: ExportQualityPreset; label: string }[] =
  [
    { id: "source", label: "Source" },
    { id: "720p", label: "720p" },
    { id: "1080p", label: "1080p" },
    { id: "4k", label: "4K" },
  ];

export function exportPresetStorageKey(projectId: string): string {
  return `diffusecut-export-preset-${projectId}`;
}
