import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  isNativeAceStepInstalled,
  resolveAceStepInstallPaths,
} from "@/lib/services/ace-step-install";
import { aceStepPromptForKind, resolveAceStepSourceDuration } from "@/lib/services/ace-step-prompt";

const GENERATION_TIMEOUT_MS = 20 * 60_000;

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`ACE-Step timed out after ${options.timeoutMs / 1000}s`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function isNativeAceStepGenerationReady(): Promise<boolean> {
  const status = await isNativeAceStepInstalled();
  return status.ready;
}

export async function generateNativeAceStepAudioFile(options: {
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  kind: "music" | "voiceover" | "sfx";
}): Promise<{
  provider: string;
  sourceSeconds: number;
  installDir: string;
  aceStepPrompt?: {
    tags: string;
    lyrics: string;
    bpm: number;
    keyscale: string;
  };
}> {
  const installStatus = await isNativeAceStepInstalled();
  if (!installStatus.ready) {
    throw new Error(
      installStatus.reason ??
        "Native ACE-Step is not installed. Run scripts/local-dev/install-ace-step-local.ps1"
    );
  }

  const paths = await resolveAceStepInstallPaths();
  if (!fs.existsSync(paths.generateScript)) {
    throw new Error(
      `Missing runner at ${paths.generateScript}. Re-clone or reinstall DiffuseCut.`
    );
  }

  const sourceSeconds = resolveAceStepSourceDuration(
    options.kind,
    options.durationSeconds
  );
  const acePrompt = aceStepPromptForKind(
    options.kind,
    options.prompt,
    sourceSeconds
  );
  const bpm = acePrompt.bpm ?? (options.kind === "sfx" ? 60 : 90);
  const keyscale = acePrompt.keyscale ?? (options.kind === "sfx" ? "C major" : "A minor");

  const scratchFlac = options.outputAbsolutePath.endsWith(".flac")
    ? options.outputAbsolutePath
    : path.join(
        path.dirname(options.outputAbsolutePath),
        `.gen-native-${Date.now()}.flac`
      );

  const requestPath = path.join(os.tmpdir(), `diffusecut-ace-${Date.now()}.json`);
  fs.writeFileSync(
    requestPath,
    JSON.stringify(
      {
        installRoot: paths.installDir,
        outputPath: scratchFlac,
        prompt: acePrompt.tags,
        lyrics: acePrompt.lyrics ?? "",
        kind: options.kind,
        durationSeconds: sourceSeconds,
        bpm,
        keyscale,
      },
      null,
      2
    )
  );

  const args = ["run", "python", paths.generateScript, requestPath];
  const result = await runCommand(paths.uvExecutable, args, {
    cwd: paths.installDir,
    timeoutMs: Math.max(GENERATION_TIMEOUT_MS, sourceSeconds * 8000),
  });

  fs.rmSync(requestPath, { force: true });

  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).slice(-1200);
    throw new Error(
      `Native ACE-Step failed (exit ${result.code}). ${detail}`
    );
  }

  const jsonLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .pop();

  if (!jsonLine) {
    throw new Error(
      `Native ACE-Step finished without a result payload. ${result.stderr.slice(-600)}`
    );
  }

  const payload = JSON.parse(jsonLine) as { outputPath?: string };
  const produced = payload.outputPath ?? scratchFlac;
  if (!fs.existsSync(produced)) {
    throw new Error("Native ACE-Step reported success but the audio file is missing.");
  }

  if (produced !== options.outputAbsolutePath) {
    fs.mkdirSync(path.dirname(options.outputAbsolutePath), { recursive: true });
    fs.copyFileSync(produced, options.outputAbsolutePath);
    if (produced !== scratchFlac) {
      fs.rmSync(produced, { force: true });
    }
  }

  return {
    provider: "ace_step_native",
    sourceSeconds,
    installDir: paths.installDir,
    aceStepPrompt:
      options.kind === "music"
        ? { tags: acePrompt.tags, lyrics: acePrompt.lyrics, bpm, keyscale }
        : undefined,
  };
}
