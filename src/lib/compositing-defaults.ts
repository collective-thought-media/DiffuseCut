/** Client-safe compositing defaults (no Node/fs imports). */

export const COMPOSITING_NODE_CLASSES = [
  "ImageCompositeMasked",
  "ImageBlur",
  "ImageScale",
  "RemBGSession+",
  "ImageRemoveBackground+",
  "MaskBlur+",
  "GrowMask",
  "VAEEncode",
  "ImageColorMatch+",
] as const;

export const DEFAULT_LOCATION_PLATE_DENOISE = 0.42;

/**
 * Integrate in scene (masked inpaint): denoise applied inside the subject
 * mask only. Must be near 1.0: the masked region starts from empty-street
 * plate latent, and mid-range values leave a translucent half-formed subject
 * blended into the background. The plate outside the mask is pixel-locked by
 * the noise mask, so high denoise here does not drift the set.
 */
export const DEFAULT_INTEGRATE_INPAINT_DENOISE = 0.9;

/** Subject mask height as a fraction of frame height (medium preset). */
export const DEFAULT_INTEGRATE_SUBJECT_HEIGHT_FRACTION = 0.4;

/** Horizontal center of the subject mask as a fraction of frame width. */
export const DEFAULT_INTEGRATE_SUBJECT_ANCHOR_X = 0.5;

/** Where the subject's feet land, as a fraction of frame height. */
export const DEFAULT_INTEGRATE_SUBJECT_GROUND_Y = 0.95;

/** Mask box width relative to its height (room for arms, props, stride). */
export const INTEGRATE_SUBJECT_WIDTH_RATIO = 0.62;

/**
 * Extra mask height above the nominal subject height. Without headroom the
 * hard mask edge crops the head, and the model responds by crouching the
 * figure or smearing the face into the feather band.
 */
export const INTEGRATE_SUBJECT_HEADROOM_RATIO = 0.22;

/**
 * Feather size relative to the mask box width. Keep thin: feathered pixels
 * are partially denoised, so a wide band reads as a ghosted halo where the
 * subject alpha-blends into the plate.
 */
export const INTEGRATE_MASK_FEATHER_RATIO = 0.08;

/** img2img integration pass after rough paste (unifies lighting, depth, edges). */
export const DEFAULT_COMPOSITE_INPAINT_DENOISE = 0.48;
export const DEFAULT_COMPOSITE_BACKGROUND_BLUR = 16;
export const DEFAULT_COMPOSITE_BACKGROUND_SIGMA = 2.0;
export const DEFAULT_COMPOSITE_CHARACTER_WIDTH = 920;
export const DEFAULT_COMPOSITE_CHARACTER_HEIGHT = 820;
export const DEFAULT_COMPOSITE_CHARACTER_X = 212;
export const DEFAULT_COMPOSITE_CHARACTER_Y = 20;

/** Gaussian blur radius on subject mask before paste (MaskBlur+ amount). */
export const DEFAULT_COMPOSITE_MASK_BLUR = 8;

/** Match cutout color to location plate before paste (ImageColorMatch+ factor, LAB). */
export const DEFAULT_COMPOSITE_COLOR_MATCH_FACTOR = 0.78;

/** White backdrop for ImageColorToMask (0xFFFFFF). */
export const COMPOSITE_MASK_BACKDROP_COLOR = 16777215;

/** Light gray studio backdrop (0xE8E8E8). */
export const COMPOSITE_MASK_GRAY_BACKDROP_COLOR = 15263976;

/** Mid gray seamless backdrop (0xC0C0C0). */
export const COMPOSITE_MASK_MID_GRAY_BACKDROP_COLOR = 12632256;

export type CompositePlacementOptions = {
  backgroundBlurRadius?: number;
  backgroundBlurSigma?: number;
  characterWidth?: number;
  characterHeight?: number;
  characterX?: number;
  characterY?: number;
  compositeInpaintDenoise?: number;
  compositeColorMatchFactor?: number;
};
