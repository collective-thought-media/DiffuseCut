/** Checkpoints that are not SDXL still-image models (video, music, etc.). */
const NON_STILL_IMAGE_CHECKPOINT = /ltx|ace[-_]?step/i;

/** Picker value for the built-in Krea 2 turbo workflow (not a checkpoints file). */
export const IMAGE_ENGINE_KREA2 = "__builtin_krea2__";

const KREA2_UNET_PATTERN = /krea2.*turbo/i;

/** Recommended SDXL still checkpoint filename (epiCRealism XL VXVII CrystalClear). */
export const EPICREALISM_XL_CHECKPOINT_FILENAME =
  "epicrealismXL_vxviiCrystalclear.safetensors";

const STILL_IMAGE_CHECKPOINT_PREFERENCES: RegExp[] = [
  /epicrealism/i,
  /realismfusion/i,
  /realvisxl/i,
  /juggernaut/i,
  /dreamshaper/i,
];

/** Illustrious/Pony-family checkpoints often produce garbage with SDXL IP-Adapter. */
const IP_ADAPTER_UNFRIENDLY_CHECKPOINT = /realismfusion|illustrious|pony|noob|animagine|wai/i;

const IP_ADAPTER_CHECKPOINT_PREFERENCES: RegExp[] = [
  /epicrealism/i,
  /realvisxl/i,
  /juggernaut/i,
  /dreamshaper/i,
  /realismfusion/i,
];

export function sortImageCheckpointsForPicker(checkpoints: string[]): string[] {
  const pool = filterImageGenerationCheckpoints(checkpoints);
  const ranked = [...pool].sort((a, b) => {
    const score = (name: string) => {
      for (let i = 0; i < IP_ADAPTER_CHECKPOINT_PREFERENCES.length; i++) {
        if (IP_ADAPTER_CHECKPOINT_PREFERENCES[i].test(name)) return i;
      }
      return IP_ADAPTER_CHECKPOINT_PREFERENCES.length;
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
  const rest = checkpoints.filter((name) => !pool.includes(name));
  return [...ranked, ...rest];
}

export function isIpAdapterFriendlyCheckpoint(name: string): boolean {
  return !IP_ADAPTER_UNFRIENDLY_CHECKPOINT.test(name);
}

export function pickIpAdapterImageCheckpoint(checkpoints: string[]): string {
  const pool = filterImageGenerationCheckpoints(checkpoints).filter(
    isIpAdapterFriendlyCheckpoint
  );
  const searchPool = pool.length > 0 ? pool : filterImageGenerationCheckpoints(checkpoints);
  for (const pattern of IP_ADAPTER_CHECKPOINT_PREFERENCES) {
    const match = searchPool.find((name) => pattern.test(name));
    if (match) return match;
  }
  return searchPool[0] ?? checkpoints[0] ?? "";
}

export function resolveCheckpointForIpAdapter(
  preferred: string | undefined,
  checkpoints: string[]
): { checkpoint: string; swapped: boolean; from?: string } {
  const pool = filterImageGenerationCheckpoints(checkpoints);
  const trimmed = preferred?.trim();

  if (trimmed && pool.includes(trimmed) && isIpAdapterFriendlyCheckpoint(trimmed)) {
    return { checkpoint: trimmed, swapped: false };
  }

  const fallback = pickIpAdapterImageCheckpoint(pool.length > 0 ? pool : checkpoints);
  if (trimmed && pool.includes(trimmed) && !isIpAdapterFriendlyCheckpoint(trimmed)) {
    return { checkpoint: fallback, swapped: true, from: trimmed };
  }

  if (trimmed && pool.includes(trimmed)) {
    return { checkpoint: trimmed, swapped: false };
  }

  return { checkpoint: fallback, swapped: !trimmed, from: trimmed || undefined };
}

export function filterImageGenerationCheckpoints(
  checkpoints: string[]
): string[] {
  const filtered = checkpoints.filter(
    (name) => !NON_STILL_IMAGE_CHECKPOINT.test(name)
  );
  return filtered.length > 0 ? filtered : checkpoints;
}

export function pickDefaultImageCheckpoint(checkpoints: string[]): string {
  const pool = filterImageGenerationCheckpoints(checkpoints);
  for (const pattern of STILL_IMAGE_CHECKPOINT_PREFERENCES) {
    const match = pool.find((name) => pattern.test(name));
    if (match) return match;
  }
  return pool[0] ?? checkpoints[0] ?? "";
}

export function shortCheckpointLabel(name: string): string {
  if (name === IMAGE_ENGINE_KREA2) return "Krea 2 turbo";
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.(safetensors|ckpt|pt)$/i, "");
}

export function isKrea2ImageEngine(
  imageEngine: string | undefined | null
): boolean {
  return imageEngine === "krea2";
}

export function detectKrea2Unet(
  diffusionModels: string[]
): string | undefined {
  return diffusionModels.find((name) => KREA2_UNET_PATTERN.test(name));
}

export function isKrea2UnetAvailable(diffusionModels: string[]): boolean {
  return Boolean(detectKrea2Unet(diffusionModels));
}
