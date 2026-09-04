import { getSetting } from "@/lib/services/settings";
import { isNativeAceStepInstalled } from "@/lib/services/ace-step-install";

export type AceStepComputeMode = "local" | "remote";

export interface AceStepComputeStatus {
  mode: AceStepComputeMode;
  ready: boolean;
  message: string;
  localInstallDir?: string;
  remoteUrl?: string;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export async function getAceStepComputeModeSetting(): Promise<AceStepComputeMode> {
  const raw = (await getSetting("ace_step_compute_mode")) ?? "local";
  return raw === "remote" ? "remote" : "local";
}

export async function getAceStepRemoteUrlSetting(): Promise<string | null> {
  const value = (await getSetting("ace_step_remote_url"))?.trim();
  return value || null;
}

export async function isRemoteAceStepReachable(
  remoteUrl: string,
  timeoutMs = 5000
): Promise<boolean> {
  const { resolveRemoteAceStepBackend } = await import(
    "@/lib/services/remote-ace-step-generation"
  );
  const resolved = await resolveRemoteAceStepBackend(remoteUrl);
  return Boolean(resolved);
}

export async function getAceStepComputeStatus(): Promise<AceStepComputeStatus> {
  const mode = await getAceStepComputeModeSetting();

  if (mode === "remote") {
    const remoteUrl = await getAceStepRemoteUrlSetting();
    if (!remoteUrl) {
      return {
        mode,
        ready: false,
        message:
          "Remote ACE-Step URL is not set. Add your LAN GPU server URL in Settings.",
      };
    }

    const reachable = await isRemoteAceStepReachable(remoteUrl);
    return {
      mode,
      ready: reachable,
      remoteUrl,
      message: reachable
        ? `Remote ACE-Step ready (${normalizeBaseUrl(remoteUrl)})`
        : `Remote ACE-Step unreachable at ${normalizeBaseUrl(remoteUrl)}. Start the API on that machine and re-check System Status.`,
    };
  }

  const install = await isNativeAceStepInstalled();
  return {
    mode,
    ready: install.ready,
    localInstallDir: install.installDir,
    message: install.ready
      ? `Local ACE-Step ready (${install.installDir})`
      : install.reason ??
        "ACE-Step is not installed locally. Run scripts/local-dev/install-ace-step-local.ps1",
  };
}

export async function isAceStepComputeReady(): Promise<boolean> {
  const status = await getAceStepComputeStatus();
  return status.ready;
}
