import path from "path";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  type MediaKind,
} from "@/types";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export function extname(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function mediaKindFromExtension(fileName: string): MediaKind | null {
  const ext = extname(fileName);
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

export function mimeFromExtension(fileName: string): string {
  return MIME_MAP[extname(fileName)] ?? "application/octet-stream";
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

export async function fetchUrlToBuffer(
  url: string,
  maxBytes = MAX_UPLOAD_BYTES
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(`File exceeds ${maxBytes} byte limit`);
  }
  const urlPath = new URL(url).pathname;
  const fileName = sanitizeFileName(path.basename(urlPath) || "download");
  return { buffer: Buffer.from(arrayBuffer), contentType, fileName };
}
