/**
 * Client-safe subject-region mask math for the Integrate in scene (masked
 * inpaint) shot workflow. The mask is a soft-feathered rectangle built from
 * core ComfyUI nodes (SolidMask + MaskComposite + FeatherMask); this module
 * converts user-facing fractions (subject scale, horizontal position) into
 * pixel values for those nodes.
 */

import {
  DEFAULT_INTEGRATE_SUBJECT_ANCHOR_X,
  DEFAULT_INTEGRATE_SUBJECT_GROUND_Y,
  DEFAULT_INTEGRATE_SUBJECT_HEIGHT_FRACTION,
  INTEGRATE_MASK_FEATHER_RATIO,
  INTEGRATE_SUBJECT_HEADROOM_RATIO,
  INTEGRATE_SUBJECT_WIDTH_RATIO,
} from "@/lib/compositing-defaults";

export type IntegrateSubjectMaskBox = {
  frameWidth: number;
  frameHeight: number;
  boxWidth: number;
  boxHeight: number;
  x: number;
  y: number;
  featherX: number;
  featherTop: number;
  featherBottom: number;
};

export type IntegrateSubjectMaskInput = {
  frameWidth: number;
  frameHeight: number;
  /**
   * Subject height as a fraction of frame height. Values above 1 mean the
   * framing crops the subject (medium shot, close-up): the box extends to the
   * frame edges and the crop happens at the image border instead of mid-frame.
   */
  heightFraction?: number;
  /** Horizontal center of the subject as a fraction of frame width. */
  anchorX?: number;
  /** Feet line as a fraction of frame height (above 1 = feet below frame). */
  groundY?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type IntegrateFramingIntent = {
  heightFraction: number;
  groundY: number;
};

/**
 * When the shot prompt asks for a framing where the subject is larger than a
 * small full-body figure, the mask box must grow with it. Otherwise the model
 * obeys the prompt (paints a big person) and the hard mask edges crop the
 * head and legs mid-frame. Sizes above 1.0 intentionally run the box into the
 * frame edges so any crop lands on the image border like real camera framing.
 */
export function detectIntegrateFramingIntent(
  prompt: string
): IntegrateFramingIntent | null {
  if (
    /\bclose[- ]?up\b|\bhead and shoulders\b|\bbust shot\b|\bportrait framing\b|\bface fill(?:s|ing) the frame\b/i.test(
      prompt
    )
  ) {
    return { heightFraction: 1.8, groundY: 1.75 };
  }
  if (
    /\bmedium shot\b|\bmedium close\b|\bwaist[- ]?up\b|\bknees?[- ]?up\b|\bcowboy shot\b|\bhalf[- ]body\b|\bsubject large in (?:the )?frame\b/i.test(
      prompt
    )
  ) {
    return { heightFraction: 1.15, groundY: 1.08 };
  }
  return null;
}

export function computeIntegrateSubjectMaskBox(
  input: IntegrateSubjectMaskInput
): IntegrateSubjectMaskBox {
  const frameWidth = Math.max(64, Math.round(input.frameWidth));
  const frameHeight = Math.max(64, Math.round(input.frameHeight));
  const heightFraction = clamp(
    input.heightFraction ?? DEFAULT_INTEGRATE_SUBJECT_HEIGHT_FRACTION,
    0.2,
    1.9
  );
  const anchorX = clamp(
    input.anchorX ?? DEFAULT_INTEGRATE_SUBJECT_ANCHOR_X,
    0.05,
    0.95
  );
  const groundY = clamp(
    input.groundY ?? DEFAULT_INTEGRATE_SUBJECT_GROUND_Y,
    0.5,
    1.85
  );

  // Nominal subject height sets the width; the box itself gets extra headroom
  // above the head so the hard mask edge never crops or smears the face.
  const subjectHeight = Math.round(frameHeight * heightFraction);
  const boxHeight = Math.min(
    frameHeight,
    Math.round(subjectHeight * (1 + INTEGRATE_SUBJECT_HEADROOM_RATIO))
  );
  const boxWidth = Math.min(
    frameWidth,
    Math.round(subjectHeight * INTEGRATE_SUBJECT_WIDTH_RATIO)
  );

  const feetY = Math.round(frameHeight * groundY);
  const y = clamp(feetY - boxHeight, 0, frameHeight - boxHeight);
  const x = clamp(
    Math.round(frameWidth * anchorX - boxWidth / 2),
    0,
    frameWidth - boxWidth
  );

  const featherX = Math.max(
    8,
    Math.round(boxWidth * INTEGRATE_MASK_FEATHER_RATIO)
  );
  // Softer top (hair, headroom), tighter bottom (feet stay near the ground
  // line so contact reads instead of dissolving). When the box touches a
  // frame edge (medium shot / close-up framing) the crop happens at the image
  // border, so feathering there would only ghost the subject.
  const touchesTop = y <= 2;
  const touchesBottom = y + boxHeight >= frameHeight - 2;
  const featherTop = touchesTop ? 0 : featherX;
  const featherBottom = touchesBottom
    ? 0
    : Math.max(8, Math.round(featherX * 0.6));

  return {
    frameWidth,
    frameHeight,
    boxWidth,
    boxHeight,
    x,
    y,
    featherX,
    featherTop,
    featherBottom,
  };
}
