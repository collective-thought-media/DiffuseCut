import { getObjectInfo } from "@/lib/services/comfyui-client";
import { missingNodeClasses } from "@/lib/services/comfyui-workflow-requirements";
import {
  COMPOSITING_NODE_CLASSES,
} from "@/lib/compositing-defaults";

export {
  COMPOSITING_NODE_CLASSES,
  COMPOSITE_MASK_BACKDROP_COLOR,
  COMPOSITE_MASK_GRAY_BACKDROP_COLOR,
  COMPOSITE_MASK_MID_GRAY_BACKDROP_COLOR,
  DEFAULT_COMPOSITE_BACKGROUND_BLUR,
  DEFAULT_COMPOSITE_BACKGROUND_SIGMA,
  DEFAULT_COMPOSITE_CHARACTER_HEIGHT,
  DEFAULT_COMPOSITE_CHARACTER_X,
  DEFAULT_COMPOSITE_CHARACTER_Y,
  DEFAULT_COMPOSITE_CHARACTER_WIDTH,
  DEFAULT_COMPOSITE_MASK_BLUR,
  DEFAULT_COMPOSITE_COLOR_MATCH_FACTOR,
  DEFAULT_COMPOSITE_INPAINT_DENOISE,
  DEFAULT_LOCATION_PLATE_DENOISE,
  type CompositePlacementOptions,
} from "@/lib/compositing-defaults";

export async function isCompositingPipelineAvailable(
  baseUrl: string
): Promise<boolean> {
  try {
    const objectInfo = await getObjectInfo(baseUrl);
    return missingNodeClasses(objectInfo, [...COMPOSITING_NODE_CLASSES]).length === 0;
  } catch {
    return false;
  }
}

/** Nodes the face detail pass needs: Impact Pack detailer, Impact Subpack
 * detector, and IP-Adapter Plus for likeness. */
export const FACE_REFINE_NODE_CLASSES = [
  "FaceDetailer",
  "UltralyticsDetectorProvider",
  "IPAdapterModelLoader",
  "CLIPVisionLoader",
  "IPAdapterAdvanced",
] as const;

export async function isFaceRefineAvailable(
  baseUrl: string
): Promise<boolean> {
  try {
    const objectInfo = await getObjectInfo(baseUrl);
    return (
      missingNodeClasses(objectInfo, [...FACE_REFINE_NODE_CLASSES]).length === 0
    );
  } catch {
    return false;
  }
}
