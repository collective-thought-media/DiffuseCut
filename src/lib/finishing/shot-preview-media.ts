import type { Shot } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";

export type ShotPreviewLayer = {
  id: string;
  title: string;
  src: string | null;
  kind: "rendered-video" | "placeholder-video" | "placeholder-image" | "none";
  usesRenderedVideo: boolean;
};

export function resolveShotPreviewLayer(
  projectId: string,
  shot: Shot
): ShotPreviewLayer {
  if (shot.videoPath) {
    return {
      id: shot.id,
      title: shot.title,
      src: mediaUrl(projectId, shot.videoPath, { version: shot.updatedAt }),
      kind: "rendered-video",
      usesRenderedVideo: true,
    };
  }

  if (shot.placeholderPath) {
    const isVideo = shot.placeholderKind === "video";
    return {
      id: shot.id,
      title: shot.title,
      src: mediaUrl(projectId, shot.placeholderPath, {
        version: shot.updatedAt,
      }),
      kind: isVideo ? "placeholder-video" : "placeholder-image",
      usesRenderedVideo: false,
    };
  }

  return {
    id: shot.id,
    title: shot.title,
    src: null,
    kind: "none",
    usesRenderedVideo: false,
  };
}

export function shotUsesRenderedVideo(shot: Shot): boolean {
  return Boolean(shot.videoPath);
}

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv|avi)$/i;

function pathLooksLikeVideo(relativePath: string): boolean {
  return VIDEO_EXT.test(relativePath.split("?")[0] ?? "");
}

/** Still or poster for library / strip UI (not timeline playback URL). */
export function resolveShotLibraryThumb(
  projectId: string,
  shot: Shot
): { src: string; kind: "image" | "video" } | null {
  if (shot.placeholderPath) {
    const isVideo =
      shot.placeholderKind === "video" ||
      (shot.placeholderKind == null && pathLooksLikeVideo(shot.placeholderPath));
    return {
      src: mediaUrl(projectId, shot.placeholderPath, {
        version: shot.updatedAt,
      }),
      kind: isVideo ? "video" : "image",
    };
  }

  if (shot.videoPath) {
    return {
      src: mediaUrl(projectId, shot.videoPath, { version: shot.updatedAt }),
      kind: "video",
    };
  }

  return null;
}
