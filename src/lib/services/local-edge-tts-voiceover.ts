import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { getSetting } from "@/lib/services/settings";

const execFileAsync = promisify(execFile);

/** Default local dialog voice (US English, male). Override with dialog_edge_tts_voice in Settings. */
export const DEFAULT_DIALOG_EDGE_TTS_VOICE = "en-US-ChristopherNeural";

export async function getDialogEdgeTtsVoice(): Promise<string> {
  const custom = (await getSetting("dialog_edge_tts_voice"))?.trim();
  return custom || DEFAULT_DIALOG_EDGE_TTS_VOICE;
}

const RUNNER = `
import asyncio
import sys
import edge_tts

async def main():
    text, voice, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    comm = edge_tts.Communicate(text, voice)
    await comm.save(out_path)

asyncio.run(main())
`.trim();

export async function isEdgeTtsVoiceoverReady(): Promise<boolean> {
  try {
    const python = await resolvePythonForEdgeTts();
    if (!python) return false;
    await execFileAsync(python, ["-c", "import edge_tts"], {
      windowsHide: true,
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

async function resolvePythonForEdgeTts(): Promise<string | null> {
  const candidates = [
    process.env.DIFFUSECUT_PYTHON,
    "python",
    "python3",
    "py",
  ].filter(Boolean) as string[];
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"], {
        windowsHide: true,
        timeout: 5000,
      });
      return cmd;
    } catch {
      // try next
    }
  }
  return null;
}

function runPythonEdgeTts(
  python: string,
  text: string,
  voice: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ["-c", RUNNER, text, voice, outputPath],
      { windowsHide: true }
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            "Local speech generation failed. Install edge-tts: pip install edge-tts"
        )
      );
    });
  });
}

export async function generateEdgeTtsVoiceoverFile(options: {
  scriptText: string;
  outputAbsolutePath: string;
  voice?: string;
}): Promise<void> {
  const text = options.scriptText.trim();
  if (!text) {
    throw new Error("Add the dialog lines to speak before generating.");
  }

  const python = await resolvePythonForEdgeTts();
  if (!python) {
    throw new Error(
      "Python was not found for local dialog speech. Install Python 3 and run: pip install edge-tts"
    );
  }

  try {
    await execFileAsync(python, ["-c", "import edge_tts"], {
      windowsHide: true,
      timeout: 8000,
    });
  } catch {
    throw new Error(
      "Install edge-tts for dialog speech: pip install edge-tts"
    );
  }

  const voice =
    options.voice?.trim() || (await getDialogEdgeTtsVoice());
  const scratch = path.join(
    os.tmpdir(),
    `diffusecut-edge-tts-${Date.now()}.mp3`
  );

  await runPythonEdgeTts(python, text, voice, scratch);
  fs.mkdirSync(path.dirname(options.outputAbsolutePath), { recursive: true });
  fs.copyFileSync(scratch, options.outputAbsolutePath);
  try {
    fs.unlinkSync(scratch);
  } catch {
    // ignore
  }
}
