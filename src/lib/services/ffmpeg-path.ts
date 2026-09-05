import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export function ffprobeBeside(ffmpegPath: string): string {
  return ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
}

export function windowsFfmpegCandidatePaths(
  env: Record<string, string | undefined>
): string[] {
  const home = env.USERPROFILE || env.HOME || "";
  const localApp =
    env.LOCALAPPDATA || (home ? path.join(home, "AppData", "Local") : "");
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = [
    path.join("C:", "ffmpeg", "bin", "ffmpeg.exe"),
    path.join(programFiles, "ffmpeg", "bin", "ffmpeg.exe"),
    path.join(programFilesX86, "ffmpeg", "bin", "ffmpeg.exe"),
    path.join(programFiles, "Gyan", "FFmpeg", "bin", "ffmpeg.exe"),
    localApp
      ? path.join(localApp, "Microsoft", "WinGet", "Links", "ffmpeg.exe")
      : "",
    home ? path.join(home, "scoop", "shims", "ffmpeg.exe") : "",
    path.join(
      env.ProgramData || "C:\\ProgramData",
      "chocolatey",
      "bin",
      "ffmpeg.exe"
    ),
  ];
  return candidates.filter(Boolean);
}

function wingetPackageFfmpegBins(): string[] {
  const localApp = process.env.LOCALAPPDATA;
  if (!localApp) return [];
  const packages = path.join(localApp, "Microsoft", "WinGet", "Packages");
  if (!fs.existsSync(packages)) return [];

  const found: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(packages, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.toLowerCase().includes("ffmpeg")) continue;
    const root = path.join(packages, entry.name);
    found.push(...findFfmpegExeUnder(root, 3));
  }
  return found;
}

function findFfmpegExeUnder(dir: string, depth: number): string[] {
  if (depth < 0) return [];
  const direct = path.join(dir, "ffmpeg.exe");
  const inBin = path.join(dir, "bin", "ffmpeg.exe");
  const hits: string[] = [];
  if (fs.existsSync(direct)) hits.push(direct);
  if (fs.existsSync(inBin)) hits.push(inBin);
  if (depth === 0) return hits;

  let children: fs.Dirent[] = [];
  try {
    children = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return hits;
  }
  for (const child of children) {
    if (!child.isDirectory()) continue;
    hits.push(...findFfmpegExeUnder(path.join(dir, child.name), depth - 1));
  }
  return hits;
}

export async function refreshWindowsPath(): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    const { stdout: machine } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "[Environment]::GetEnvironmentVariable('Path','Machine')",
      ],
      { timeout: 8000 }
    );
    const { stdout: user } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "[Environment]::GetEnvironmentVariable('Path','User')",
      ],
      { timeout: 8000 }
    );
    const parts = [
      ...(process.env.PATH ?? "").split(";"),
      ...machine.split(";"),
      ...user.split(";"),
    ]
      .map((part) => part.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(part);
    }
    process.env.PATH = merged.join(";");
  } catch {
    /* keep the process PATH */
  }
}

async function canRunFfmpeg(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Settings override, then PATH (after a Windows env refresh), then common
 * install locations such as WinGet Links.
 */
export async function resolveFfmpegBinary(
  override?: string | null
): Promise<string | null> {
  const custom = override?.trim();
  if (custom) {
    return fs.existsSync(custom) ? custom : null;
  }

  await refreshWindowsPath();
  if (await canRunFfmpeg("ffmpeg")) return "ffmpeg";

  const candidates = [
    ...windowsFfmpegCandidatePaths(process.env),
    ...wingetPackageFfmpegBins(),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key) || !fs.existsSync(candidate)) continue;
    seen.add(key);
    if (await canRunFfmpeg(candidate)) return candidate;
  }
  return null;
}
