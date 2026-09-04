import fs from "fs";
import os from "os";
import path from "path";

const SETTING_KEY = "app_data_dir";

export function defaultAppDataDir(): string {
  const home =
    process.env.USERPROFILE ??
    process.env.HOME ??
    os.homedir();
  if (process.platform === "win32") {
    return path.join(home, "Documents", "DiffuseCut");
  }
  return path.join(home, "Documents", "DiffuseCut");
}

let cachedAppDataDir: string | null = null;

export function getAppDataDir(): string {
  if (process.env.DIFFUSECUT_DATA_DIR) {
    return process.env.DIFFUSECUT_DATA_DIR;
  }
  if (cachedAppDataDir) return cachedAppDataDir;
  return defaultAppDataDir();
}

export function setCachedAppDataDir(dir: string) {
  cachedAppDataDir = dir;
}

export function getDbPath(): string {
  if (process.env.DIFFUSECUT_DB_PATH) {
    return process.env.DIFFUSECUT_DB_PATH;
  }
  return path.join(getAppDataDir(), "diffusecut.db");
}

export function getProjectsDir(): string {
  return path.join(getAppDataDir(), "projects");
}

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function isWritableDir(dir: string): boolean {
  try {
    ensureDir(dir);
    const testFile = path.join(dir, ".write-test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

export { SETTING_KEY };
