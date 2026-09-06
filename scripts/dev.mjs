import { execSync, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  isTurbopackManifestRace,
  shouldEnableTurbopack,
} from "./dev-runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const isProd = process.argv.includes("--production");
const shouldClean = process.argv.includes("--clean");
const port = process.env.PORT ?? "3004";

function refreshWindowsPath() {
  if (process.platform !== "win32") return;
  try {
    const extra = execSync(
      "powershell -NoProfile -Command \"[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')\"",
      { encoding: "utf8" }
    ).trim();
    if (!extra) return;
    const parts = [...(process.env.PATH ?? "").split(";"), ...extra.split(";")]
      .map((part) => part.trim())
      .filter(Boolean);
    const seen = new Set();
    const merged = [];
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

refreshWindowsPath();

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

function stopExistingAppOnPort() {
  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; $pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($procId in $pids) { $p = Get-CimInstance Win32_Process -Filter \\"ProcessId=$procId\\"; if ($p.CommandLine -match 'start-server.js' -or $p.CommandLine -match 'next/dist/bin/next') { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" }
      );
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN || true`, {
      encoding: "utf8",
    });
    for (const pid of out.split(/\s+/).map((value) => value.trim()).filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function clearNextCache(reason) {
  const nextDir = path.join(root, ".next");
  if (!fs.existsSync(nextDir)) return;
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("[app] Cleared .next cache" + (reason ? ` (${reason})` : ""));
}

stopExistingAppOnPort();
killOrphanWorkers();

if (shouldClean) {
  clearNextCache("dev:clean");
}

function hasProductionBuild() {
  return (
    fs.existsSync(path.join(root, ".next", "BUILD_ID")) &&
    fs.existsSync(path.join(root, ".next", "required-server-files.json"))
  );
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

function nextIsInstalled() {
  return fs.existsSync(nextBin);
}

if (!nextIsInstalled()) {
  console.log(
    "[app] Installing project dependencies, including Next.js. This can take a few minutes."
  );
  execSync("npm install", { cwd: root, stdio: "inherit", shell: true });
}

if (!nextIsInstalled()) {
  console.error(
    "[app] Next.js is still missing after npm install. It ships with this repo as an npm dependency, not a separate Windows app. Stay in the DiffuseCut folder, run npm install, and paste any errors."
  );
  process.exit(1);
}

const useTurbo = shouldEnableTurbopack({
  isProd,
  argv: process.argv,
  env: process.env,
});

if (isProd) {
  process.env.NODE_ENV = "production";
  if (!hasProductionBuild()) {
    console.log("[app] Building the production app. This can take a few minutes the first time.");
    execSync(`"${process.execPath}" "${nextBin}" build`, {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
  }
  console.log("[app] Starting DiffuseCut in production mode on port", port);
} else if (useTurbo) {
  console.log(
    "[app] Starting DiffuseCut in developer mode on port",
    port,
    "(Turbopack)"
  );
} else {
  console.log("[app] Starting DiffuseCut in developer mode on port", port);
}

const nextEnv = {
  ...process.env,
  PORT: port,
  NODE_ENV: isProd ? "production" : process.env.NODE_ENV,
};

function buildNextArgs() {
  if (isProd) return [nextBin, "start", "-p", port];
  return useTurbo
    ? [nextBin, "dev", "-p", port, "--turbo"]
    : [nextBin, "dev", "-p", port];
}

let next = null;
let worker = null;
let shutdownRequested = false;
let workerRestartTimer = null;
let recoveringNext = false;
let nextRecoveries = 0;
let manifestRaceHits = 0;
const MAX_NEXT_RECOVERIES = 1;

function considerManifestRace(chunk) {
  if (isProd || recoveringNext || nextRecoveries >= MAX_NEXT_RECOVERIES) return;
  if (!isTurbopackManifestRace(String(chunk))) return;
  manifestRaceHits += 1;
  if (manifestRaceHits < 3) return;
  recoveringNext = true;
  nextRecoveries += 1;
  console.error(
    "[app] The web server lost its client manifest. Clearing .next and restarting once."
  );
  next?.kill();
}

function startNext() {
  next = spawn(process.execPath, buildNextArgs(), {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
    env: nextEnv,
  });
  next.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    considerManifestRace(chunk);
  });
  next.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    considerManifestRace(chunk);
  });
  next.on("exit", (code) => {
    if (shutdownRequested) {
      if (workerRestartTimer) clearTimeout(workerRestartTimer);
      worker?.kill();
      process.exit(code ?? 0);
      return;
    }
    if (recoveringNext) {
      recoveringNext = false;
      manifestRaceHits = 0;
      clearNextCache("manifest race");
      startNext();
      return;
    }
    shutdownRequested = true;
    if (workerRestartTimer) clearTimeout(workerRestartTimer);
    worker?.kill();
    process.exit(code ?? 0);
  });
}

function startWorker() {
  if (shutdownRequested) return;

  worker = spawn("npx", ["tsx", "worker/index.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: isProd
      ? { ...process.env, NODE_ENV: "production" }
      : process.env,
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

startNext();
startWorker();

function shutdown() {
  shutdownRequested = true;
  if (workerRestartTimer) clearTimeout(workerRestartTimer);
  next?.kill();
  worker?.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
