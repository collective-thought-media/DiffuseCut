export function imageStackCheckpointPool(stack: {
  availableImageCheckpoints?: string[];
  availableCheckpoints?: string[];
}): string[] {
  const image = stack.availableImageCheckpoints ?? [];
  if (image.length > 0) return image;
  return stack.availableCheckpoints ?? [];
}

export function resolvedImageStackCheckpoint(stack: {
  configuredCheckpoint?: string | null;
  effectiveCheckpoint?: string | null;
  availableImageCheckpoints?: string[];
  availableCheckpoints?: string[];
}): string | null {
  const pool = imageStackCheckpointPool(stack);
  if (
    stack.configuredCheckpoint &&
    pool.includes(stack.configuredCheckpoint)
  ) {
    return stack.configuredCheckpoint;
  }
  if (
    stack.effectiveCheckpoint &&
    pool.includes(stack.effectiveCheckpoint)
  ) {
    return stack.effectiveCheckpoint;
  }
  return null;
}

export function isImageStackReady(stack: {
  comfyuiReachable: boolean;
  imageEngine?: string | null;
  krea2Available?: boolean;
  effectiveImageUnet?: string | null;
  configuredCheckpoint?: string | null;
  effectiveCheckpoint?: string | null;
  availableImageCheckpoints?: string[];
  availableCheckpoints?: string[];
}): boolean {
  if (!stack.comfyuiReachable) return false;
  if (stack.imageEngine === "krea2") {
    return Boolean(stack.krea2Available && stack.effectiveImageUnet);
  }
  return Boolean(resolvedImageStackCheckpoint(stack));
}
