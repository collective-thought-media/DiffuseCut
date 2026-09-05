import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  SILENT_WAV_CHANNELS,
  SILENT_WAV_SAMPLE_RATE,
  writeSilentWav,
} from "@/lib/services/silent-wav";

describe("writeSilentWav", () => {
  it("writes a PCM WAV whose data size matches the requested duration", () => {
    const filePath = path.join(os.tmpdir(), `silent-wav-${Date.now()}.wav`);
    try {
      writeSilentWav(filePath, 0.25);
      const buffer = fs.readFileSync(filePath);
      expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
      expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
      expect(buffer.readUInt16LE(20)).toBe(1);
      expect(buffer.readUInt16LE(22)).toBe(SILENT_WAV_CHANNELS);
      expect(buffer.readUInt32LE(24)).toBe(SILENT_WAV_SAMPLE_RATE);
      const dataSize = buffer.readUInt32LE(40);
      expect(dataSize).toBe(
        Math.ceil(0.25 * SILENT_WAV_SAMPLE_RATE) *
          SILENT_WAV_CHANNELS *
          2
      );
      expect(buffer.length).toBe(44 + dataSize);
    } finally {
      fs.rmSync(filePath, { force: true });
    }
  });
});
