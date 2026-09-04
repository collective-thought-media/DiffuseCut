import fs from "fs";
import os from "os";
import path from "path";
import { getSetting } from "@/lib/services/settings";

export const DEFAULT_ACE_STEP_INSTALL_DIR = path.join(
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
  "DiffuseCut",
  "ace-step",
  "ACE-Step-1.5"
);

export interface AceStepInstallPaths {
  installDir: string;
  uvExecutable: string;
  generateScript: string;
}

function fileExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

export async function resolveAceStepInstallDir(): Promise<string> {
  const configured = (await getSetting("ace_step_install_dir"))?.trim();
  if (configured && fileExists(configured)) {
    return path.resolve(configured);
  }

  const envDir = process.env.ACE_STEP_INSTALL_DIR?.trim();
  if (envDir && fileExists(envDir)) {
    return path.resolve(envDir);
  }

  if (fileExists(DEFAULT_ACE_STEP_INSTALL_DIR)) {
    return DEFAULT_ACE_STEP_INSTALL_DIR;
  }

  return DEFAULT_ACE_STEP_INSTALL_DIR;
}

export function resolveUvExecutable(): string {
  const candidates = [
    process.env.UV_EXECUTABLE?.trim(),
    path.join(os.homedir(), ".local", "bin", "uv.exe"),
    path.join(os.homedir(), ".cargo", "bin", "uv.exe"),
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "DiffuseCut",
      "tools",
      "uv.exe"
    ),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return "uv";
}

export function resolveDiffuseCutGenerateScript(): string {
  return path.join(process.cwd(), "scripts", "ace-step", "generate_native.py");
}

export async function resolveAceStepInstallPaths(): Promise<AceStepInstallPaths> {
  return {
    installDir: await resolveAceStepInstallDir(),
    uvExecutable: resolveUvExecutable(),
    generateScript: resolveDiffuseCutGenerateScript(),
  };
}

export async function isNativeAceStepInstalled(): Promise<{
  ready: boolean;
  installDir: string;
  reason?: string;
}> {
  const installDir = await resolveAceStepInstallDir();
  const pyproject = path.join(installDir, "pyproject.toml");
  const acestepPkg = path.join(installDir, "acestep");

  if (!fileExists(pyproject) || !fileExists(acestepPkg)) {
    return {
      ready: false,
      installDir,
      reason:
        "ACE-Step is not installed locally. Run scripts/local-dev/install-ace-step-local.ps1",
    };
  }

  const script = resolveDiffuseCutGenerateScript();
  if (!fileExists(script)) {
    return {
      ready: false,
      installDir,
      reason: "DiffuseCut ACE-Step runner script is missing from this install.",
    };
  }

  return { ready: true, installDir };
}
