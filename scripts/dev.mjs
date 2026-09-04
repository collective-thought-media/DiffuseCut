import { execSync, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const isProd = process.argv.includes("--production");
const shouldClean = process.argv.includes("--clean");
const port = process.env.PORT ?? "3004";

function resolveAppDataDir() {
  if (process.env.DIFFUSECUT_DATA_DIR) return process.env.DIFFUSECUT_DATA_DIR;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
  return path.join(home, "Documents", "DiffuseCut");
}

function killOrphanWorkers() {
  if (process.platform === "win32") {
    try {
      execSync(
        "powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='node.exe'\\\" | Where-Object { $_.CommandLine -like '*worker/index.ts*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\"",
        { stdio: "ignore" }
      );
    } catch {
      /* ignore */
    }
  } else {
    try {
      execSync("pkill -f 'worker/index.ts' || true", { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }

  const lockPath = path.join(resolveAppDataDir(), "worker.lock");
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

killOrphanWorkers();

if (shouldClean) {
  const nextDir = path.join(root, ".next");
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log("[dev] Cleared .next cache");
  }
}

const nextCmd = isProd ? "start" : "dev";
const nextArgs = isProd
  ? ["next", nextCmd, "-p", port]
  : ["next", nextCmd, "-p", port, "--turbo"];

const next = spawn("npx", nextArgs, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PORT: port },
});

let worker = null;
let shutdownRequested = false;
let workerRestartTimer = null;

function startWorker() {
  if (shutdownRequested) return;

  worker = spawn("npx", ["tsx", "worker/index.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  worker.on("exit", (code) => {
    if (shutdownRequested) return;

    const normalized =
      typeof code === "number" && code > 2_000_000_000
        ? code - 2 ** 32
        : code;

    if (normalized && normalized !== 0) {
      console.error("[worker] exited with code", normalized, "(restarting in 3s)");
    } else {
      console.warn("[worker] exited (restarting in 3s)");
    }

    workerRestartTimer = setTimeout(() => {
      workerRestartTimer = null;
      startWorker();
    }, 3000);
  });
}

startWorker();

function shutdown() {
  shutdownRequested = true;
  if (workerRestartTimer) clearTimeout(workerRestartTimer);
  next.kill();
  worker?.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

next.on("exit", (code) => {
  shutdownRequested = true;
  if (workerRestartTimer) clearTimeout(workerRestartTimer);
  worker?.kill();
  process.exit(code ?? 0);
});
