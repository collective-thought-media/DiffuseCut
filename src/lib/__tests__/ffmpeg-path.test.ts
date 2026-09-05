import path from "path";
import { describe, expect, it } from "vitest";
import {
  ffprobeBeside,
  windowsFfmpegCandidatePaths,
} from "@/lib/services/ffmpeg-path";

describe("ffmpeg-path", () => {
  it("maps ffmpeg.exe to ffprobe.exe", () => {
    expect(ffprobeBeside("C:\\ffmpeg\\bin\\ffmpeg.exe")).toBe(
      "C:\\ffmpeg\\bin\\ffprobe.exe"
    );
  });

  it("includes WinGet Links and Gyan-style folders", () => {
    const localApp = path.join("C:", "Users", "tester", "AppData", "Local");
    const programFiles = path.join("C:", "Program Files");
    const paths = windowsFfmpegCandidatePaths({
      USERPROFILE: path.join("C:", "Users", "tester"),
      LOCALAPPDATA: localApp,
      ProgramFiles: programFiles,
    });
    expect(paths).toContain(
      path.join(localApp, "Microsoft", "WinGet", "Links", "ffmpeg.exe")
    );
    expect(paths).toContain(path.join(programFiles, "ffmpeg", "bin", "ffmpeg.exe"));
  });
});
