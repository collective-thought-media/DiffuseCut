import fs from "fs";
import path from "path";

export const SILENT_WAV_SAMPLE_RATE = 48000;
export const SILENT_WAV_CHANNELS = 2;

/**
 * Write a PCM WAV of digital silence. Used when export needs a uniform
 * audio stream but the FFmpeg wrapper cannot open lavfi (FFmpeg 8+).
 */
export function writeSilentWav(
  filePath: string,
  durationSec: number,
  options?: { sampleRate?: number; channels?: number }
): void {
  const sampleRate = options?.sampleRate ?? SILENT_WAV_SAMPLE_RATE;
  const channels = options?.channels ?? SILENT_WAV_CHANNELS;
  const bytesPerSample = 2;
  const frames = Math.max(
    1,
    Math.ceil(Math.max(0, durationSec) * sampleRate)
  );
  const dataSize = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}
