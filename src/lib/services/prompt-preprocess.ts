import { expandPromptWithLlm } from "@/lib/services/llm-prompt-expand";
import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import {
  extractAnchoredViewDescription,
  resolveAnchorReframeIntensity,
  resolveLocationAnchorReframeIntensity,
} from "@/lib/anchor-reframe";
import type { AnchorReframeIntensity } from "@/lib/ip-adapter-profiles";
import {
  detectActionPoseShot,
  detectDetailMacroShot,
  detectEnsembleShot,
  detectRearViewShot,
  detectWideShot,
} from "@/lib/services/shot-composition";

import {
  DEFAULT_VISUAL_STYLE,
  getCharacterSheetLayoutMode,
  getVisualStyleDefinition,
  getVisualStyleNegativeExtras,
  mergeNegativePrompts,
  type VisualStyle,
} from "@/lib/services/visual-style";

/** Turnaround model sheet layout for animation and stylized presets. */
export const CHARACTER_SHEET_LAYOUT_PREFIX =
  "Professional character model turnaround reference sheet, single wide image with four views in one horizontal row: front view, back view, left profile, right profile, same character in each view, neutral A-pose or T-pose, standing straight";

export const CHARACTER_SHEET_LAYOUT_SUFFIX =
  "full body head to toes visible including feet, entire wings and large accessories fully in frame with wide margins, not cropped, not zoomed in, not a cinematic portrait, not a single hero pose, flat neutral gray background, even soft studio lighting, reference sheet layout";

/** Single casting photo for photo-real projects (one subject, one angle). */
export const CASTING_PORTRAIT_LAYOUT_PREFIX =
  "Professional live-action casting reference photograph, single image, exactly one person, front-facing three-quarter view, full body head to toe in frame, natural relaxed standing pose";

export const CASTING_PORTRAIT_LAYOUT_SUFFIX =
  "shot on Canon EOS 5D Mark III with 50mm lens at f/2.8, natural soft window light, shallow depth of field, realistic skin texture and pores, muted natural color grading, not oversaturated, neutral warm gray seamless backdrop, single subject only, not a turnaround sheet, not multiple views, not duplicate figures, not back view";

export const DEFAULT_CHARACTER_SHEET_NEGATIVE =
  "blurry, watermark, text, logo, single angle only, single view, inconsistent face, cropped, cut off, partial body, close-up, portrait, headshot, bust shot, waist up, thighs cropped, feet out of frame, wings clipped, wings cut off, zoomed in, cinematic framing, dramatic pose, action pose, low quality, deformed, duplicate, duplicate head, two heads, multiple heads, janus, extra face, merged bodies, conjoined, doll, figurine, mannequin, plastic skin, wax figure, toy, action figure, cgi character, video game character, oversaturated, artificial, uncanny valley, extra figures, six views";

export const CASTING_PORTRAIT_NEGATIVE =
  "blurry, watermark, text, logo, turnaround sheet, model sheet, character sheet, multiple views, front and back view, profile collage, two heads, duplicate head, multiple heads, janus, extra face, merged bodies, conjoined, duplicate figure, extra limbs, back view, rear view, doll, figurine, mannequin, plastic skin, wax figure, toy, action figure, cgi character, video game character, oversaturated, artificial, uncanny valley, cropped, cut off, feet out of frame, low quality, deformed, 3d render, illustration, anime";

function getCharacterSheetLayoutParts(style: VisualStyle) {
  if (getCharacterSheetLayoutMode(style) === "casting_portrait") {
    return {
      prefix: CASTING_PORTRAIT_LAYOUT_PREFIX,
      suffix: CASTING_PORTRAIT_LAYOUT_SUFFIX,
    };
  }
  return {
    prefix: CHARACTER_SHEET_LAYOUT_PREFIX,
    suffix: CHARACTER_SHEET_LAYOUT_SUFFIX,
  };
}

export function finalizeCharacterSheetPrompt(
  prompt: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE
): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const { prefix, suffix } = getCharacterSheetLayoutParts(style);

  if (getCharacterSheetLayoutMode(style) === "casting_portrait") {
    const hasLayout =
      lower.includes("casting reference") &&
      lower.includes("single subject") &&
      lower.includes("full body");
    if (hasLayout) return trimmed;
    if (lower.includes("casting reference") || lower.includes("single image")) {
      return `${trimmed}. ${suffix}`;
    }
    return `${prefix}. ${trimmed}. ${suffix}`;
  }

  const hasLayout =
    lower.includes("turnaround") &&
    lower.includes("front view") &&
    lower.includes("back view") &&
    lower.includes("full body");
  const hasAntiPortrait =
    lower.includes("not cropped") || lower.includes("not a cinematic portrait");

  if (hasLayout && hasAntiPortrait) {
    return trimmed;
  }

  if (hasLayout) {
    return `${trimmed}. ${suffix}`;
  }

  return `${prefix}. ${trimmed}. ${suffix}`;
}

export function buildCharacterSheetPromptTemplate(
  name: string,
  userDescription: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE
): string {
  const desc = userDescription.trim();
  const def = getVisualStyleDefinition(style);
  const { prefix, suffix } = getCharacterSheetLayoutParts(style);
  let appearance = def.characterSheetTheme;
  if (style.preset === "custom" && style.customSuffix?.trim()) {
    appearance = `${appearance} ${style.customSuffix.trim()}`;
  }

  const characterLine = desc
    ? `Character: ${name.trim()}. Appearance: ${desc}.`
    : `Character: ${name.trim()}.`;

  return `${prefix}. ${characterLine} ${appearance}. ${suffix}`;
}

export function buildCharacterSheetNegativePrompt(
  style: VisualStyle = DEFAULT_VISUAL_STYLE
): string {
  const baseNegative =
    getCharacterSheetLayoutMode(style) === "casting_portrait"
      ? CASTING_PORTRAIT_NEGATIVE
      : DEFAULT_CHARACTER_SHEET_NEGATIVE;
  return mergeNegativePrompts(baseNegative, getVisualStyleNegativeExtras(style));
}

export interface CharacterSheetPrompts {
  processedPrompt: string;
  negativePrompt: string;
  usedLlm: boolean;
}

export async function buildCharacterSheetPrompts(
  name: string,
  userDescription: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE
): Promise<CharacterSheetPrompts> {
  const negativePrompt = buildCharacterSheetNegativePrompt(style);
  const templatePrompt = buildCharacterSheetPromptTemplate(
    name,
    userDescription,
    style
  );

  const llmResult = await expandPromptWithLlm({
    name,
    userDescription,
    templatePrompt,
    visualStyle: style,
  });

  return {
    processedPrompt: finalizeCharacterSheetPrompt(llmResult.prompt, style),
    negativePrompt,
    usedLlm: llmResult.usedLlm,
  };
}

export const LOCATION_REFERENCE_LAYOUT_PREFIX =
  "Professional film location environment reference image, single clear camera angle, production design reference";

export const LOCATION_REFERENCE_LAYOUT_SUFFIX =
  "wide framing with full environment visible, not cropped, not a collage, not multiple panels, not a character portrait, clean readable composition, reference photo quality";

/** Seamless / cyclorama / portrait-backdrop locations: in-camera plate, not BTS studio. */
export const LOCATION_REFERENCE_BACKDROP_LAYOUT_PREFIX =
  "In-camera photograph of a seamless backdrop surface, what the lens sees on set, NOT a behind-the-scenes photo of a photography studio";

export const LOCATION_REFERENCE_BACKDROP_LAYOUT_SUFFIX =
  "smooth backdrop color fills the entire frame edge to edge, no visible floor line, no studio equipment, no light stands, no softboxes, no ceiling rig, no wide shot of the room, photographed through the camera not a documentary of the photoshoot, clean empty background plate, reference photo quality";

export const LOCATION_REFERENCE_BACKDROP_ANCHOR_PREFIX =
  "Same seamless backdrop color and tone as the establishing reference image. Same smooth surface with the camera moved as described, not a different backdrop and not a photo of studio equipment";

export const LOCATION_REFERENCE_BACKDROP_ANCHORED_SUFFIX =
  "tighter crop of the same seamless backdrop surface, same color and tone as the establishing reference, backdrop still fills the entire frame edge to edge, no studio equipment visible, not a behind-the-scenes setup shot, reference photo quality";

export const LOCATION_REFERENCE_BACKDROP_NEGATIVE =
  "behind the scenes, BTS, studio setup visible, photography studio interior, light stands, softboxes, c-stands, boom arms, ceiling track lights, fluorescent tubes, studio floor, wood floor, floor line, horizon line, equipment visible, wide angle room shot, meta photograph of a photoshoot, photographer visible, camera on tripod in frame, sandbags, power cables, reflectors, umbrella lights, grip equipment, backdrop paper roll visible, paper roll edge, backdrop edge, studio walls, corners of the cyclorama visible";

export const LOCATION_REFERENCE_BACKDROP_TIGHT_NEGATIVE =
  "visible backdrop roll, hanging paper, paper sweep, c-stand, light stand, studio corner, floor visible, wide studio interior, same composition as anchor, duplicate of medium shot";

export const LOCATION_REFERENCE_BACKDROP_APPEARANCE =
  "smooth evenly lit seamless backdrop surface, uniform color, soft subtle gradient optional, photographed in-camera";

export { detectVirtualBackdropLocation } from "@/lib/location-backdrop";

export const LOCATION_REFERENCE_ANCHOR_PREFIX =
  "Same physical location and set as the establishing reference image. Match the identical architecture, stone materials, weather, lighting, and monumental scale. This is the same environment with the camera moved closer or to a new angle, not a different place and not a smaller recreation.";

export const LOCATION_REFERENCE_ANCHORED_SUFFIX =
  "closer or tighter view of the same structures from the establishing reference, different camera position and lens as described, preserve monumental architectural scale and tread proportions from the wide shot, never a narrow garden path or residential-sized steps, single clear shot, not a collage, not multiple panels, not a character portrait, clean readable composition, reference photo quality";

export const LOCATION_REFERENCE_SCALE_ANCHOR =
  "Monumental ancient stonework at temple or cathedral scale, wide heavy stone treads roughly 15 to 20 feet across, same massive staircase as the establishing wide reference";

export const DEFAULT_LOCATION_REFERENCE_NEGATIVE =
  "blurry, watermark, text, logo, people, characters, faces, cropped, cut off, collage, split screen, multiple panels, low quality, deformed, duplicate";

export const LOCATION_REFERENCE_ANCHOR_NEGATIVE_EXTRA =
  "different architecture, different location, inconsistent layout, mirrored layout, wrong stair direction, unrelated environment, identical framing to reference, zoomed crop of reference, same camera position as reference, same field of view as establishing wide, duplicate composition, narrow garden path, backyard steps, single-person trail width, residential staircase, small decorative pebbles, tiny mossy garden stones, miniature stairs, path-sized treads, hiking trail steps";

export const LOCATION_REFERENCE_CLOSEUP_NEGATIVE_EXTRA =
  "wide establishing shot, full staircase in frame, entire environment visible, master shot, panoramic view, distant wide view, environmental wide, full set visible, long shot, aerial overview, duplicate of establishing wide";

export type { AnchorReframeIntensity } from "@/lib/ip-adapter-profiles";
export {
  extractAnchoredViewDescription,
  resolveAnchorReframeIntensity,
  resolveLocationAnchorReframeIntensity,
} from "@/lib/anchor-reframe";

export function buildLocationReferencePromptTemplate(
  name: string,
  userDescription: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: { anchorMode?: boolean; viewDescription?: string }
): string {
  const desc = userDescription.trim();
  const viewDesc = options?.viewDescription?.trim() ?? "";
  const backdropMode = detectVirtualBackdropLocation(name, desc, viewDesc);
  const def = getVisualStyleDefinition(style);
  let appearance = backdropMode
    ? LOCATION_REFERENCE_BACKDROP_APPEARANCE
    : def.locationReferenceTheme;
  if (!backdropMode && style.preset === "custom" && style.customSuffix?.trim()) {
    appearance = `${appearance} ${style.customSuffix.trim()}`;
  }

  const locationLine = desc
    ? options?.anchorMode && viewDesc
      ? backdropMode
        ? `Backdrop: ${name.trim()}. Primary camera and framing: ${viewDesc}. Surface and tone: ${desc}.`
        : `Location: ${name.trim()}. Primary camera and framing: ${viewDesc}. Scene context: ${desc}.`
      : backdropMode
        ? `Backdrop: ${name.trim()}. Surface and tone: ${desc}.`
        : `Location: ${name.trim()}. Scene: ${desc}.`
    : backdropMode
      ? `Backdrop: ${name.trim()}.`
      : `Location: ${name.trim()}.`;

  let layoutPrefix: string;
  let layoutSuffix: string;
  if (backdropMode) {
    layoutPrefix = options?.anchorMode
      ? `${LOCATION_REFERENCE_BACKDROP_LAYOUT_PREFIX}. ${LOCATION_REFERENCE_BACKDROP_ANCHOR_PREFIX}`
      : LOCATION_REFERENCE_BACKDROP_LAYOUT_PREFIX;
    layoutSuffix = options?.anchorMode
      ? LOCATION_REFERENCE_BACKDROP_ANCHORED_SUFFIX
      : LOCATION_REFERENCE_BACKDROP_LAYOUT_SUFFIX;
  } else {
    layoutPrefix = options?.anchorMode
      ? `${LOCATION_REFERENCE_LAYOUT_PREFIX}. ${LOCATION_REFERENCE_ANCHOR_PREFIX}. ${LOCATION_REFERENCE_SCALE_ANCHOR}`
      : LOCATION_REFERENCE_LAYOUT_PREFIX;
    layoutSuffix = options?.anchorMode
      ? LOCATION_REFERENCE_ANCHORED_SUFFIX
      : LOCATION_REFERENCE_LAYOUT_SUFFIX;
  }

  const cameraDirective =
    options?.anchorMode && backdropMode
      ? buildBackdropCameraDirective(viewDesc || desc || name)
      : options?.anchorMode
        ? buildAnchorCameraDirective(viewDesc || desc || name)
        : backdropMode
          ? "Camera sees only the seamless backdrop surface filling the frame, no studio room visible"
          : "";

  const cameraBlock = cameraDirective ? ` ${cameraDirective}.` : "";

  return `${layoutPrefix}. ${locationLine}${cameraBlock} ${appearance}. ${layoutSuffix}`;
}

function buildBackdropCameraDirective(description: string): string {
  const lower = description.toLowerCase();
  const intensity = resolveAnchorReframeIntensity(description);
  const portraitZone =
    /head and shoulders|head-and-shoulders|chest-up|chest up|bust framing|portrait zone|upper body zone|shoulders up/.test(
      lower
    );

  if (portraitZone || intensity === "extreme") {
    return "Head-and-shoulders empty framing zone on the same neutral gray seamless, tighter crop than the medium anchor, match gray tone and softness only not studio layout, abstract gray field fills the entire frame edge to edge, no floor line, no backdrop paper edge, no equipment, no studio room visible";
  }
  if (intensity === "moderate") {
    return "Tighter crop of the same seamless backdrop surface, same neutral gray tone as anchor, camera closer or more zoomed, backdrop still fills the entire frame edge to edge, no equipment visible, no floor line";
  }
  return "Same seamless backdrop color filling the frame edge to edge, camera at the described distance, no studio room visible";
}

export function buildLocationReferenceNegativePrompt(
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: {
    anchorMode?: boolean;
    viewDescription?: string;
    userDescription?: string;
    name?: string;
  }
): string {
  const viewDesc = options?.viewDescription?.trim() ?? "";
  const backdropMode = detectVirtualBackdropLocation(
    options?.name,
    options?.userDescription,
    viewDesc
  );
  const closeupMode =
    options?.anchorMode &&
    !backdropMode &&
    resolveAnchorReframeIntensity(viewDesc) !== "subtle";
  const backdropTightMode =
    options?.anchorMode &&
    backdropMode &&
    resolveAnchorReframeIntensity(viewDesc) !== "subtle";

  return mergeNegativePrompts(
    DEFAULT_LOCATION_REFERENCE_NEGATIVE,
    backdropMode ? LOCATION_REFERENCE_BACKDROP_NEGATIVE : undefined,
    backdropTightMode ? LOCATION_REFERENCE_BACKDROP_TIGHT_NEGATIVE : undefined,
    options?.anchorMode && !backdropMode
      ? LOCATION_REFERENCE_ANCHOR_NEGATIVE_EXTRA
      : undefined,
    closeupMode ? LOCATION_REFERENCE_CLOSEUP_NEGATIVE_EXTRA : undefined,
    getVisualStyleNegativeExtras(style)
  );
}

function buildAnchorCameraDirective(description: string): string {
  const lower = description.toLowerCase();
  const intensity = resolveAnchorReframeIntensity(description);
  const hints: string[] = [];

  if (intensity === "extreme" || intensity === "moderate") {
    hints.push(
      "Close-up or tighter shot on the same monumental stonework from the establishing wide reference, same materials and scale, not a wide master shot"
    );
  } else {
    hints.push(
      "Closer view of the same structures shown in the establishing wide reference, same stone type and monumental scale"
    );
  }

  if (
    /extreme macro|macro close|macro shot|tight macro|surface detail|texture fill|macro|close-up|close up|detail shot/.test(
      lower
    )
  ) {
    hints.push(
      "Macro photography, one or two massive stone treads fill most of the frame, camera inches from the wet stone surface, shallow depth of field, each tread still temple-scale width from the establishing reference"
    );
    hints.push(
      "Do not show the full staircase length, do not show the entire environment, subject fills the frame"
    );
  }
  if (
    /85mm|telephoto|tight|portrait lens|long lens/.test(lower)
  ) {
    hints.push(
      "Telephoto lens on the same staircase, compressed perspective, still monumental tread width from the establishing reference, tighter framing than the wide master"
    );
  }
  if (
    /looking down|look down|top down|top-down|overhead|bird.?s eye|straight down/.test(
      lower
    )
  ) {
    hints.push(
      "Camera overhead on the same wide stone staircase from the establishing reference, looking down at the same treads"
    );
  }
  if (
    /low angle|low camera|worm.?s eye|from below|looking up|ground level|straight at/.test(
      lower
    )
  ) {
    hints.push(
      "Camera at ground level on the same monumental staircase, low angle near the tread surface, same scale as the establishing wide, not a distant wide view"
    );
  }
  if (/push.?in|dolly in|medium shot|mid shot/.test(lower)) {
    hints.push(
      "Medium or closer framing on the same set, not a wide master shot, still the same massive architecture"
    );
  }
  if (/water running|rain on|wet stone|drops on/.test(lower)) {
    hints.push(
      "Visible water droplets and runoff on the same wet stone surfaces from the establishing shot"
    );
  }

  hints.push(
    "Different camera position and lens from the establishing wide, not a pixel crop, not a smaller duplicate staircase, not a duplicate wide composition"
  );

  return hints.join(". ");
}

export async function buildLocationReferencePrompts(
  name: string,
  userDescription: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: { anchorMode?: boolean; viewDescription?: string }
): Promise<CharacterSheetPrompts> {
  const viewDesc = options?.viewDescription?.trim() ?? "";
  const backdropMode = detectVirtualBackdropLocation(name, userDescription, viewDesc);
  const negativePrompt = buildLocationReferenceNegativePrompt(style, {
    ...options,
    name,
    userDescription,
  });
  const templatePrompt = buildLocationReferencePromptTemplate(
    name,
    userDescription,
    style,
    options
  );

  const llmResult = await expandPromptWithLlm({
    name,
    userDescription,
    templatePrompt,
    visualStyle: style,
    mode: "location_reference",
    backdropMode,
  });

  const layoutSuffix = backdropMode
    ? options?.anchorMode
      ? LOCATION_REFERENCE_BACKDROP_ANCHORED_SUFFIX
      : LOCATION_REFERENCE_BACKDROP_LAYOUT_SUFFIX
    : options?.anchorMode
      ? LOCATION_REFERENCE_ANCHORED_SUFFIX
      : LOCATION_REFERENCE_LAYOUT_SUFFIX;

  return {
    processedPrompt: `${llmResult.prompt.trim()}. ${layoutSuffix}`,
    negativePrompt,
    usedLlm: llmResult.usedLlm,
  };
}

export const SHOT_STILL_LAYOUT_PREFIX =
  "Single cinematic movie frame, one camera angle, on-location storyboard still, NOT a character turnaround sheet, NOT a figurine product photo, NOT multiple views in one image";

export const SHOT_STILL_LAYOUT_SUFFIX =
  "single hero frame, cinematic framing, clean readable composition, storyboard reference quality, not a character turnaround sheet, not a model sheet layout";

export const SHOT_CHARACTER_SHEET_BACKGROUND_NEGATIVE =
  "plain gray background, neutral gray backdrop, studio backdrop, white seamless background, isolated on gray, character sheet background, blank background";

export const DEFAULT_SHOT_STILL_NEGATIVE =
  "blurry, watermark, text, logo, collage, split screen, multiple panels, turnaround sheet, model sheet, four views, reference sheet layout, low quality, deformed, duplicate, figurine, action figure, collectible statuette, product photography, toy packaging, front and back views in one image, multiple angles in one image, character design sheet, head cropped, head cut off, forehead out of frame, missing top of head, chin cropped, neck only framing";


export const SHOT_DUAL_IPADAPTER_LAYOUT_SUFFIX =
  "one person clearly visible in the environment, character present in frame, not an empty room, not a vacant set";

export const SHOT_MACRO_LAYOUT_SUFFIX =
  "macro detail within a cinematic widescreen storyboard frame, on-location environment visible, subject fills much of the frame, shallow depth of field, not a character reference sheet";

export const SHOT_MACRO_DETAIL_NEGATIVE =
  "wide shot, full body, distant view, medium shot, long shot, environmental establishing shot, tiny figure, head to toe, full length, small subject in frame, full character visible";

export const SHOT_REAR_VIEW_NEGATIVE =
  "front view, facing camera, face visible, portrait, headshot, looking at viewer, frontal pose, chest plate front, eyes visible, facial features, front-facing, side view, profile view, three quarter view, 3/4 view, facing left, facing right, looking over shoulder";

export const SHOT_ACTION_POSE_NEGATIVE =
  "standing upright, neutral standing pose, A-pose, T-pose, idle stance, arms at sides, character sheet pose, reference sheet pose, mannequin pose, rigid frontal stance, parade rest, attention pose, symmetrical standing portrait";

export const SHOT_WARDROBE_NEGATIVE =
  "different outfit, changed clothes, alternate dress, wrong costume, redesigned wardrobe, new dress style, button placket dress, keyhole neckline, bow tie neckline, puffed sleeves, different dress color, fashion redesign";

/** How aggressively IP-Adapter should defer to the shot prompt over the reference image. */
export function resolveShotReframeIntensity(
  rawPrompt: string,
  options?: { referenceFocus?: "character" | "location" }
): AnchorReframeIntensity {
  const focus = extractAnchoredViewDescription(rawPrompt) || rawPrompt;

  if (
    options?.referenceFocus === "character" &&
    !detectActionPoseShot(focus) &&
    !detectEnsembleShot(focus) &&
    !detectRearViewShot(focus)
  ) {
    const anchorIntensity = resolveAnchorReframeIntensity(focus);
    // Lock to the full-body reference only when the shot also asks for wide / full-body framing.
    if (detectWideShot(focus) || anchorIntensity === "subtle") {
      return "character_lock";
    }
    return anchorIntensity;
  }

  let intensity = resolveAnchorReframeIntensity(focus);

  if (detectActionPoseShot(focus) || detectEnsembleShot(focus)) {
    intensity = "scene";
  } else if (detectWideShot(focus) && intensity === "subtle") {
    intensity = "moderate";
  }

  if (detectRearViewShot(focus)) {
    if (intensity === "subtle") intensity = "moderate";
    if (/close|macro|tight/.test(focus.toLowerCase())) {
      intensity = "extreme";
    }
  }

  return intensity;
}

function buildActionPoseDirective(description: string): string {
  const lower = description.toLowerCase();
  const hints: string[] = [];

  if (/\bkneel/.test(lower)) {
    hints.push("Subject kneeling on the floor, not standing upright");
  }
  if (/\bhead bowed|bowed head|head lowered/.test(lower)) {
    hints.push("Head bowed downward toward the floor, not facing the camera");
  }
  if (/\bwings spread|spread entirely open|wings open/.test(lower)) {
    hints.push(
      "Wings spread wide open in an active display, not folded at rest against the back"
    );
  }
  if (/\bsubmission|surrender/.test(lower)) {
    hints.push("Posture of submission and surrender, not heroic standing pose");
  }
  if (detectEnsembleShot(lower)) {
    hints.push(
      "Multiple characters visible in the same frame with foreground framing elements"
    );
  }

  return hints.join(". ");
}

export function buildShotCameraDirective(userDescription: string): string {
  const desc = userDescription.trim();
  if (!desc) return "";

  const hints: string[] = [];
  const wide = detectWideShot(desc);
  const macroRear =
    detectRearViewShot(desc) && detectDetailMacroShot(desc);
  const actionPose = buildActionPoseDirective(desc);

  if (actionPose) {
    hints.push(actionPose);
  }

  if (wide) {
    if (detectRearViewShot(desc)) {
      hints.push(
        "Wide cinematic master shot from behind the subject, full environment visible, all characters and architecture in frame"
      );
    } else {
      hints.push(
        "Wide cinematic master shot, full environment visible, all characters and architecture in frame"
      );
    }
  } else if (macroRear) {
    hints.push(
      "Macro close-up on the upper back and wings only, pristine glowing white avian feathers erupting through torn dark leathery wing tissue, feather and membrane texture fills most of the frame"
    );
    hints.push(
      "Camera behind the subject, back to camera, face not visible, do not show full body, not a wide shot, not a medium shot, camera inches from the wing surface"
    );
  } else if (detectRearViewShot(desc)) {
    hints.push(
      "Camera behind the subject, back to camera, rear view, face not visible, focus on back and wings"
    );
  }

  const intensity = resolveAnchorReframeIntensity(desc);
  if (
    (intensity === "extreme" || intensity === "moderate") &&
    !detectRearViewShot(desc) &&
    !wide
  ) {
    hints.push(
      "Tight cinematic framing on the subject, not a wide master shot"
    );
    hints.push(
      "Full head and face visible in frame with comfortable headroom, not cropped at the forehead or chin"
    );
  }

  return hints.join(". ");
}

export function buildShotPlaceholderPromptTemplate(
  title: string,
  shotPrompt: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: { context?: string; wardrobeLock?: string | null }
): string {
  const desc = shotPrompt.trim();
  const def = getVisualStyleDefinition(style);
  let appearance = def.shotSuffix?.trim();
  if (!appearance && style.preset === "custom" && style.customSuffix?.trim()) {
    appearance = style.customSuffix.trim();
  }
  if (!appearance) {
    appearance =
      "cinematic photorealistic film still, on-location environment visible, dramatic lighting";
  }

  const cameraDirective = buildShotCameraDirective(desc);
  const cameraLead = cameraDirective ? `${cameraDirective}. ` : "";
  const contextBlock = options?.context?.trim();
  const contextSuffix = contextBlock ? ` Context: ${contextBlock}.` : "";
  const wardrobeSuffix = options?.wardrobeLock?.trim()
    ? ` ${options.wardrobeLock.trim()}.`
    : "";
  const layoutSuffix = detectDetailMacroShot(desc)
    ? SHOT_MACRO_LAYOUT_SUFFIX
    : SHOT_STILL_LAYOUT_SUFFIX;

  const featherBoost =
    detectRearViewShot(desc) &&
    /crack|peel|torn|emerg|fractur|bat wing|leather|dark scale|underneath the torn/i.test(
      desc
    )
      ? " Pristine glowing white avian feathers erupt through torn dark leathery wing tissue."
      : "";

  const shotLine = desc
    ? `Shot: ${title.trim()}. Primary action and framing: ${desc}.${featherBoost}`
    : `Shot: ${title.trim()}.`;

  return `${cameraLead}${SHOT_STILL_LAYOUT_PREFIX}. ${shotLine}${contextSuffix}${wardrobeSuffix} ${appearance}. ${layoutSuffix}`;
}

export function buildShotPlaceholderNegativePrompt(
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  shotPrompt?: string,
  options?: { lockWardrobe?: boolean; hasLocationReference?: boolean }
): string {
  const rearExtra =
    shotPrompt && detectRearViewShot(shotPrompt)
      ? SHOT_REAR_VIEW_NEGATIVE
      : undefined;
  const macroExtra =
    shotPrompt && detectDetailMacroShot(shotPrompt)
      ? SHOT_MACRO_DETAIL_NEGATIVE
      : undefined;
  const actionPoseExtra =
    shotPrompt && detectActionPoseShot(shotPrompt)
      ? SHOT_ACTION_POSE_NEGATIVE
      : undefined;

  return mergeNegativePrompts(
    DEFAULT_SHOT_STILL_NEGATIVE,
    !options?.hasLocationReference
      ? SHOT_CHARACTER_SHEET_BACKGROUND_NEGATIVE
      : undefined,
    options?.lockWardrobe ? SHOT_WARDROBE_NEGATIVE : undefined,
    rearExtra,
    macroExtra,
    actionPoseExtra,
    getVisualStyleNegativeExtras(style)
  );
}

export async function buildShotPlaceholderPrompts(
  title: string,
  shotPrompt: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: {
    context?: string;
    wardrobeLock?: string | null;
    hasLocationReference?: boolean;
  }
): Promise<CharacterSheetPrompts> {
  const lockWardrobe = Boolean(options?.wardrobeLock);
  const negativePrompt = buildShotPlaceholderNegativePrompt(style, shotPrompt, {
    lockWardrobe,
    hasLocationReference: options?.hasLocationReference,
  });
  const templatePrompt = buildShotPlaceholderPromptTemplate(
    title,
    shotPrompt,
    style,
    options
  );

  const llmResult = await expandPromptWithLlm({
    name: title,
    userDescription: shotPrompt,
    templatePrompt,
    visualStyle: style,
    mode: "shot",
  });

  const processed = llmResult.prompt.trim();
  const layoutSuffix = detectDetailMacroShot(shotPrompt)
    ? SHOT_MACRO_LAYOUT_SUFFIX
    : SHOT_STILL_LAYOUT_SUFFIX;

  if (processed.includes(layoutSuffix)) {
    return {
      processedPrompt: processed,
      negativePrompt,
      usedLlm: llmResult.usedLlm,
    };
  }

  return {
    processedPrompt: `${processed}. ${layoutSuffix}`,
    negativePrompt,
    usedLlm: llmResult.usedLlm,
  };
}
