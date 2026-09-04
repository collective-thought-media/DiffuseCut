import fs from "fs";
import path from "path";
import { getAppDataDir } from "@/lib/paths/app-paths";

const LOCK_FILENAME = "worker.lock";

function getLockPath(): string {
  return path.join(getAppDataDir(), LOCK_FILENAME);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireWorkerLock(): boolean {
  const lockPath = getLockPath();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  if (fs.existsSync(lockPath)) {
    const existingPid = Number.parseInt(
      fs.readFileSync(lockPath, "utf8").trim(),
      10
    );
    if (
      isPidAlive(existingPid) &&
      existingPid !== process.pid
    ) {
      return false;
    }
  }

  fs.writeFileSync(lockPath, String(process.pid), "utf8");
  return true;
}

export function releaseWorkerLock(): void {
  const lockPath = getLockPath();
  if (!fs.existsSync(lockPath)) return;

  const ownerPid = Number.parseInt(fs.readFileSync(lockPath, "utf8").trim(), 10);
  if (ownerPid === process.pid) {
    fs.unlinkSync(lockPath);
  }
}
