import { expandPromptWithLlm } from "@/lib/services/llm-prompt-expand";
import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import {
  detectCharacterRearView,
  extractAnchoredViewDescription,
  resolveAnchorReframeIntensity,
  resolveCharacterAnchorReframeIntensity,
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
import {
  splitPositiveNegationPhrases,
  mergeUniqueNegativeTerms,
} from "@/lib/services/prompt-negation-sanitize";

/** Turnaround model sheet layout for animation and stylized presets. */
export const CHARACTER_SHEET_LAYOUT_PREFIX =
  "Professional character model turnaround reference sheet, single wide image with four views in one horizontal row: front view, back view, left profile, right profile, same character in each view, neutral A-pose or T-pose, standing straight";

export const CHARACTER_SHEET_LAYOUT_SUFFIX =
  "full body head to toes visible including feet, entire wings and large accessories fully in frame with wide margins, not cropped, not zoomed in, not a cinematic portrait, not a single hero pose, flat neutral gray background, even soft studio lighting, reference sheet layout";

/** SDXL CLIP encoders truncate around 77 tokens. Anti-panel terms must come first. */
export const CASTING_PORTRAIT_ANTI_PANEL_NEGATIVE =
  "triptych, diptych, polyptych, split screen, two panels, three panels, four panels, four-up, contact sheet, photo grid, casting card, photo booth strip, mosaic, panel layout, side by side, comparison sheet, multiple subjects, multiple portraits, multiple views, turnaround sheet, model sheet, character sheet, profile collage, front and back view, two people, three people, four people, group photo, two-up, three-up, duplicate figure, two heads, multiple heads, extra face, collage";

export const CASTING_PORTRAIT_QUALITY_NEGATIVE =
  "blurry, watermark, text, logo, generic model face, stock photo model, beauty campaign, soft glam makeup, symmetrical doll face, influencer portrait, different person, inconsistent identity, doll, figurine, mannequin, plastic skin, wax figure, cgi character, anime, illustration, oversaturated, cropped, feet out of frame, low quality, deformed, back view, rear view";

/** Casting quality negatives without rear-view penalties (for back/rear anchored angles). */
export const CASTING_PORTRAIT_QUALITY_NEGATIVE_REAR_VIEW =
  "blurry, watermark, text, logo, generic model face, stock photo model, beauty campaign, soft glam makeup, symmetrical doll face, influencer portrait, different person, inconsistent identity, doll, figurine, mannequin, plastic skin, wax figure, cgi character, anime, illustration, oversaturated, cropped, feet out of frame, low quality, deformed";

export const CHARACTER_ANGLE_ANCHOR_PREFIX =
  "Same character identity, face, wardrobe, and body type as the anchor reference image. Match build, hair, and costume from the anchor, not the anchor camera angle or pose";

export const CHARACTER_ANGLE_REAR_SOLO_PREFIX =
  "One photograph, one person, one pose, one frame only, NOT diptych, NOT triptych, NOT split screen, NOT two panels, full body head to toe, 16:9 widescreen, single subject centered, back toward camera, face hidden, neutral gray backdrop";

export const CHARACTER_ANGLE_REAR_SOLO_SUFFIX =
  "one figure only, not side by side, not comparison layout, 50mm lens, soft studio light";

export const CHARACTER_ANGLE_REAR_ANTI_PANEL_NEGATIVE =
  "diptych, triptych, split screen, two panels, side by side, double portrait, same person twice, two poses, front and back together, character reference sheet, turnaround layout, reference card, multiple figures, composite layout, twin, mirrored duplicate, photo booth strip, casting sheet with multiple views";

export const CHARACTER_ANGLE_REAR_VIEW_PREFIX =
  "Single photograph, one person, one pose, one camera angle only, NOT a diptych, NOT a triptych, NOT split screen, NOT two panels, full body head to toe, 16:9 widescreen, subject turned away from camera, back of head and shoulders toward lens, face not visible to camera, no eye contact, neutral gray backdrop";

export const CHARACTER_ANGLE_ANCHOR_LAYOUT_PREFIX =
  "Single photograph, one person, one pose, one camera angle only, NOT a diptych, NOT a triptych, NOT split screen, full body head to toe, 16:9 widescreen, new camera angle as described, subject centered, neutral gray backdrop";

export const CHARACTER_ANGLE_REAR_ANCHOR_IDENTITY =
  "Same wardrobe, hair color, and body type as the anchor reference. Match costume and build from the anchor, not the anchor front pose or camera angle";

export const CHARACTER_ANGLE_ANCHORED_SUFFIX =
  "exactly one figure in the entire frame, not front-and-back comparison, not multiple views in one image, photorealistic casting reference, same person as anchor, different camera position as described, not a duplicate of the anchor framing, 50mm lens, soft studio light";

export const CHARACTER_ANGLE_ANTI_PANEL_NEGATIVE =
  "diptych, triptych, two panels, split screen, double portrait, two copies of same person, front and back in one image, front view beside back view, comparison layout, side by side portraits, two figures, duplicate figure side by side, mirrored duplicate, contact sheet, casting card with multiple poses";

export const CHARACTER_ANGLE_ANCHOR_NEGATIVE_EXTRA =
  "identical framing to anchor, same pose as anchor, duplicate of front reference, front three-quarter view, facing camera, copy of anchor composition, same camera position as anchor";

export const CHARACTER_ANGLE_REAR_NEGATIVE_EXTRA =
  "face visible, eyes visible, eye contact, looking at camera, looking at viewer, looking back over shoulder, over shoulder portrait, frontal portrait, front view, facing camera, head turned toward camera, portrait facing lens, breasts visible from front, nipples visible, cleavage toward camera, front three-quarter view, second figure, duplicate portrait, two faces in frame";

export const CASTING_PORTRAIT_NEGATIVE = mergeNegativePrompts(
  CASTING_PORTRAIT_ANTI_PANEL_NEGATIVE,
  CASTING_PORTRAIT_QUALITY_NEGATIVE
);

/** Single casting photo for photo-real projects (one subject, one angle). */
export const CASTING_PORTRAIT_LAYOUT_PREFIX =
  "Single photograph, one person, one pose, one camera angle, full body head to toe, 16:9 widescreen, front three-quarter view, subject centered, neutral gray backdrop";

export const CASTING_PORTRAIT_LAYOUT_SUFFIX =
  "photorealistic, natural skin, 50mm lens, soft studio light";

/** Intentional front+back diptych for paired angle assignment. */
export const CHARACTER_FRONT_BACK_DIPTYCH_PREFIX =
  "Single wide reference image, exactly two panels side by side in one horizontal row, same character in both panels, left panel full body front three-quarter view facing camera, right panel full body back view with face hidden, matching wardrobe hair color and body type in both panels, neutral gray studio backdrop, even soft lighting";

export const CHARACTER_FRONT_BACK_DIPTYCH_SUFFIX =
  "two panels only, not three panels, not triptych, full body head to toe in each panel, same outfit in both views, casting reference quality";

export const CHARACTER_FRONT_BACK_DIPTYCH_NEGATIVE =
  "triptych, three panels, four panels, profile view, extra figures, different outfits between panels, inconsistent hair, inconsistent wardrobe, more than two panels, vertical stack, top and bottom layout, four-up, contact sheet";

export const DEFAULT_CHARACTER_SHEET_NEGATIVE =
  "blurry, watermark, text, logo, single angle only, single view, inconsistent face, cropped, cut off, partial body, close-up, portrait, headshot, bust shot, waist up, thighs cropped, feet out of frame, wings clipped, wings cut off, zoomed in, cinematic framing, dramatic pose, action pose, low quality, deformed, duplicate, duplicate head, two heads, multiple heads, janus, extra face, merged bodies, conjoined, doll, figurine, mannequin, plastic skin, wax figure, toy, action figure, cgi character, video game character, oversaturated, artificial, uncanny valley, extra figures, six views";

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

const TURNAROUND_LAYOUT_PHRASES =
  /\b(turnaround|model sheet|character sheet|reference sheet|front view|back view|left profile|right profile|four views|multiple views|front and back|profile collage)\b/gi;

/** Strip layout language users may paste into identity/look fields by mistake. */
export function sanitizeCastingPortraitUserDescription(text: string): string {
  return text.replace(TURNAROUND_LAYOUT_PHRASES, " ").replace(/\s+/g, " ").trim();
}

function castingPortraitHasAntiPanelGuards(lower: string): boolean {
  if (
    lower.includes("not diptych") &&
    lower.includes("not triptych") &&
    (lower.includes("back toward camera") ||
      lower.includes("turned away from camera") ||
      lower.includes("new camera angle as described"))
  ) {
    return true;
  }
  return (
    (lower.includes("single photograph") || lower.includes("one photograph")) &&
    lower.includes("one person") &&
    lower.includes("one pose")
  );
}

export function finalizeCharacterSheetPrompt(
  prompt: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE
): string {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const { prefix, suffix } = getCharacterSheetLayoutParts(style);

  if (getCharacterSheetLayoutMode(style) === "casting_portrait") {
    if (castingPortraitHasAntiPanelGuards(lower)) {
      return trimmed;
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

function buildAnchoredCharacterAppearanceDesc(
  userDescription: string,
  viewDescription: string
): string {
  let remainder = userDescription.trim();
  if (viewDescription.trim()) {
    const escaped = viewDescription.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    remainder = remainder.replace(new RegExp(`^${escaped}\\.?\\s*`, "i"), "");
  }
  return sanitizeCastingPortraitUserDescription(remainder);
}

/** Drop forward-facing facial casting lines that fight rear-view generation. */
export function sanitizeRearViewAppearanceDesc(text: string): string {
  const facePhrase =
    /\b(wide|narrow|green-hazel|hazel|brown|blue|gray|grey|green)\ eyes\b[^.]*\.?|\b(neutral expression|no smile|looking at camera|face forward|full lips|closed mouth|straight nose|narrow nose|small straight|thin arched|long brow line|facial features|eye contact|lips,|eyebrows?)[^.]*\.?|\bmid-20s woman\b[^.]*\.?|\bfair clear skin\b[^.]*\.?|\bnatural matte finish\b[^.]*\.?|\bmandala tattoo on right upper arm\b[^.]*\.?|\bdistinctive black geometric\b[^.]*\.?/gi;
  return text
    .replace(facePhrase, " ")
    .replace(TURNAROUND_LAYOUT_PHRASES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRearViewAppearanceDesc(
  userDescription: string,
  viewDescription: string
): string {
  const base = buildAnchoredCharacterAppearanceDesc(
    userDescription,
    viewDescription
  );
  return sanitizeRearViewAppearanceDesc(base);
}

export function buildCharacterSheetPromptTemplate(
  name: string,
  userDescription: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: {
    anchorMode?: boolean;
    viewDescription?: string;
    frontBackDiptych?: boolean;
  }
): string {
  const rawDesc = userDescription.trim();
  const viewDesc =
    options?.viewDescription?.trim() ||
    (options?.anchorMode ? extractAnchoredViewDescription(rawDesc) : "");

  if (options?.frontBackDiptych) {
    const characterLine = rawDesc
      ? `Character: ${name.trim()}. ${rawDesc}.`
      : `Character: ${name.trim()}.`;
    return `${CHARACTER_FRONT_BACK_DIPTYCH_PREFIX}. ${characterLine} ${CHARACTER_FRONT_BACK_DIPTYCH_SUFFIX}`;
  }

  const rearView = Boolean(viewDesc) && detectCharacterRearView(viewDesc);
  const appearanceDesc = rearView
    ? buildRearViewAppearanceDesc(rawDesc, viewDesc)
    : options?.anchorMode
      ? buildAnchoredCharacterAppearanceDesc(rawDesc, viewDesc)
      : getCharacterSheetLayoutMode(style) === "casting_portrait"
        ? sanitizeCastingPortraitUserDescription(rawDesc)
        : rawDesc;
  const desc = appearanceDesc;
  const def = getVisualStyleDefinition(style);
  let appearance = def.characterSheetTheme;
  if (getCharacterSheetLayoutMode(style) === "casting_portrait") {
    appearance = "photorealistic casting photo, natural skin";
  } else if (style.preset === "custom" && style.customSuffix?.trim()) {
    appearance = `${appearance} ${style.customSuffix.trim()}`;
  }

  if (rearView) {
    if (!options?.anchorMode) {
      return `${CHARACTER_ANGLE_REAR_SOLO_PREFIX}. ${viewDesc}. ${CHARACTER_ANGLE_REAR_SOLO_SUFFIX}`;
    }

    const anchorBlock = `${CHARACTER_ANGLE_REAR_VIEW_PREFIX}. ${CHARACTER_ANGLE_REAR_ANCHOR_IDENTITY}`;
    const cameraDirective = buildCharacterAnchorCameraDirective(viewDesc || rawDesc);
    const cameraBlock = cameraDirective ? ` ${cameraDirective}.` : "";
    const characterLine = viewDesc
      ? `Character: ${name.trim()}. Primary pose and camera: ${viewDesc}.${desc ? ` Wardrobe and build: ${desc}.` : ""}`
      : desc
        ? `Character: ${name.trim()}. Wardrobe and build: ${desc}.`
        : `Character: ${name.trim()}.`;
    const rearAppearance = "photorealistic casting photo from behind, natural skin";
    return `${anchorBlock}. ${characterLine}${cameraBlock} ${rearAppearance}. ${CHARACTER_ANGLE_ANCHORED_SUFFIX}`;
  }

  if (options?.anchorMode) {
    const layoutPrefix = `${CHARACTER_ANGLE_ANCHOR_LAYOUT_PREFIX}. ${CHARACTER_ANGLE_ANCHOR_PREFIX}`;
    const cameraDirective = buildCharacterAnchorCameraDirective(viewDesc || rawDesc);
    const cameraBlock = cameraDirective ? ` ${cameraDirective}.` : "";
    const characterLine = viewDesc
      ? `Character: ${name.trim()}. Primary pose and camera: ${viewDesc}.${desc ? ` Appearance: ${desc}.` : ""}`
      : desc
        ? `Character: ${name.trim()}. Appearance: ${desc}.`
        : `Character: ${name.trim()}.`;
    return `${layoutPrefix}. ${characterLine}${cameraBlock} ${appearance}. ${CHARACTER_ANGLE_ANCHORED_SUFFIX}`;
  }

  const { prefix, suffix } = getCharacterSheetLayoutParts(style);

  const characterLine = desc
    ? `Character: ${name.trim()}. Appearance: ${desc}.`
    : `Character: ${name.trim()}.`;

  return `${prefix}. ${characterLine} ${appearance}. ${suffix}`;
}

function buildCharacterAnchorCameraDirective(description: string): string {
  const lower = description.toLowerCase();
  if (detectCharacterRearView(description)) {
    return "Camera behind the subject, back of head and shoulders toward lens, subject facing away, face hidden from camera, exactly one figure in frame, not a front-and-back comparison layout, same wardrobe and body type as anchor reference, not the front-facing anchor pose";
  }
  if (
    /profile|side view|90 degree|from the side|left profile|right profile/.test(
      lower
    )
  ) {
    return "Camera to the side of the same subject, profile or side angle as described, same identity and wardrobe as anchor reference, not a duplicate of the front anchor framing";
  }
  if (resolveAnchorReframeIntensity(description) !== "subtle") {
    return "New camera position on the same subject as the anchor reference, tighter or different framing as described, same identity and wardrobe, not a duplicate of the anchor composition";
  }
  return "Same subject as anchor reference with camera moved as described, match identity and wardrobe not anchor pose";
}

export function buildCharacterSheetNegativePrompt(
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: {
    anchorMode?: boolean;
    viewDescription?: string;
    frontBackDiptych?: boolean;
  }
): string {
  if (options?.frontBackDiptych) {
    return mergeNegativePrompts(
      CHARACTER_FRONT_BACK_DIPTYCH_NEGATIVE,
      CASTING_PORTRAIT_QUALITY_NEGATIVE,
      getVisualStyleNegativeExtras(style)
    );
  }

  const viewDesc = options?.viewDescription?.trim() ?? "";
  const rearView = detectCharacterRearView(viewDesc);

  if (getCharacterSheetLayoutMode(style) === "casting_portrait") {
    return mergeNegativePrompts(
      rearView ? CHARACTER_ANGLE_REAR_ANTI_PANEL_NEGATIVE : undefined,
      CASTING_PORTRAIT_ANTI_PANEL_NEGATIVE,
      rearView || options?.anchorMode ? CHARACTER_ANGLE_ANTI_PANEL_NEGATIVE : undefined,
      rearView
        ? CASTING_PORTRAIT_QUALITY_NEGATIVE_REAR_VIEW
        : CASTING_PORTRAIT_QUALITY_NEGATIVE,
      options?.anchorMode ? CHARACTER_ANGLE_ANCHOR_NEGATIVE_EXTRA : undefined,
      rearView ? CHARACTER_ANGLE_REAR_NEGATIVE_EXTRA : undefined,
      getVisualStyleNegativeExtras(style)
    );
  }
  const baseNegative = DEFAULT_CHARACTER_SHEET_NEGATIVE;
  return mergeNegativePrompts(
    baseNegative,
    options?.anchorMode ? CHARACTER_ANGLE_ANTI_PANEL_NEGATIVE : undefined,
    options?.anchorMode ? CHARACTER_ANGLE_ANCHOR_NEGATIVE_EXTRA : undefined,
    rearView ? CHARACTER_ANGLE_REAR_NEGATIVE_EXTRA : undefined,
    getVisualStyleNegativeExtras(style)
  );
}

export interface CharacterSheetPrompts {
  processedPrompt: string;
  negativePrompt: string;
  usedLlm: boolean;
}

export async function buildCharacterSheetPrompts(
  name: string,
  userDescription: string,
  style: VisualStyle = DEFAULT_VISUAL_STYLE,
  options?: {
    anchorMode?: boolean;
    viewDescription?: string;
    frontBackDiptych?: boolean;
  }
): Promise<CharacterSheetPrompts> {
  const negativePrompt = buildCharacterSheetNegativePrompt(style, options);
  const templatePrompt = buildCharacterSheetPromptTemplate(
    name,
    userDescription,
    style,
    options
  );

  // Photo-real casting and anchored angles use fixed templates. LLM paraphrase
  // often drops anti-triptych or rear-view language and triggers wrong layouts.
  if (
    options?.frontBackDiptych ||
    options?.anchorMode ||
    getCharacterSheetLayoutMode(style) === "casting_portrait"
  ) {
    return {
      processedPrompt: finalizeCharacterSheetPrompt(templatePrompt, style),
      negativePrompt,
      usedLlm: false,
    };
  }

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
  "Same physical location and set as the establishing reference image. Match the identical architecture, materials, weather, lighting, prop layout, and physical scale. This is the same environment with the camera moved closer or to a new angle, not a different place and not a redesigned set.";

export const LOCATION_REFERENCE_ANCHORED_SUFFIX =
  "closer or tighter view of the same structures from the establishing reference, different camera position and lens as described, preserve the same walls, furniture placement, doorways, and prop layout from the wide shot, single clear shot, not a collage, not multiple panels, not a character portrait, clean readable composition, reference photo quality";

/** Only appended when the establishing description already mentions stairs or temple-scale stonework. */
export const LOCATION_REFERENCE_SCALE_ANCHOR =
  "Preserve the same monumental architectural scale and tread proportions from the establishing wide reference, never a narrow garden path or residential-sized steps";

export function locationDescriptionNeedsScaleAnchor(
  description: string
): boolean {
  const lower = description.toLowerCase();
  return /stair|steps|\bstep\b|tread|temple|cathedral|monumental|colonnade|grand hall/.test(
    lower
  );
}

export const DEFAULT_LOCATION_REFERENCE_NEGATIVE =
  "blurry, watermark, text, logo, people, characters, faces, cropped, cut off, collage, split screen, multiple panels, low quality, deformed, duplicate";

export const LOCATION_REFERENCE_ANCHOR_NEGATIVE_EXTRA =
  "different architecture, different location, inconsistent layout, mirrored layout, wrong stair direction, unrelated environment, identical framing to reference, zoomed crop of reference, same camera position as reference, same field of view as establishing wide, duplicate composition, narrow garden path, backyard steps, single-person trail width, residential staircase, small decorative pebbles, tiny mossy garden stones, miniature stairs, path-sized treads, hiking trail steps";

export const LOCATION_REFERENCE_CLOSEUP_NEGATIVE_EXTRA =
  "wide establishing shot, full room master shot, entire environment visible, panoramic view, distant wide view, environmental wide, full set visible, long shot, aerial overview, duplicate of establishing wide";

export type { AnchorReframeIntensity } from "@/lib/ip-adapter-profiles";
export {
  detectCharacterRearView,
  extractAnchoredViewDescription,
  resolveAnchorReframeIntensity,
  resolveCharacterAnchorReframeIntensity,
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
    const scaleAnchor =
      options?.anchorMode &&
      locationDescriptionNeedsScaleAnchor(`${desc} ${viewDesc}`)
        ? `. ${LOCATION_REFERENCE_SCALE_ANCHOR}`
        : "";
    layoutPrefix = options?.anchorMode
      ? `${LOCATION_REFERENCE_LAYOUT_PREFIX}. ${LOCATION_REFERENCE_ANCHOR_PREFIX}${scaleAnchor}`
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
  const hasStairs = /stair|steps|\bstep\b|tread|staircase/.test(lower);
  const hints: string[] = [];

  if (intensity === "extreme" || intensity === "moderate") {
    hints.push(
      "Closer or tighter shot of the same physical set from the establishing wide reference, same architecture, materials, prop layout, and scale, not a wide master shot and not a redesigned room"
    );
  } else {
    hints.push(
      "Closer view of the same structures shown in the establishing wide reference, same materials and physical scale"
    );
  }

  const trueMacro =
    /extreme macro|macro close|macro shot|tight macro|surface detail|texture fill|\bmacro\b|detail shot/.test(
      lower
    );
  if (trueMacro && hasStairs) {
    hints.push(
      "Macro photography, one or two massive stone treads fill most of the frame, camera inches from the wet stone surface, shallow depth of field, each tread still temple-scale width from the establishing reference"
    );
    hints.push(
      "Do not show the full staircase length, do not show the entire environment, subject fills the frame"
    );
  } else if (trueMacro) {
    hints.push(
      "Macro photography on the same set surfaces from the establishing reference, shallow depth of field, subject fills the frame, do not invent a different room"
    );
  } else if (intensity === "moderate" || intensity === "extreme") {
    hints.push(
      "Tighter camera framing on the same set, keep recognizable landmarks from the establishing plate in shot when the framing allows"
    );
  }
  if (hasStairs && /85mm|telephoto|tight|portrait lens|long lens/.test(lower)) {
    hints.push(
      "Telephoto lens on the same staircase, compressed perspective, still monumental tread width from the establishing reference, tighter framing than the wide master"
    );
  } else if (/85mm|telephoto|portrait lens|long lens/.test(lower)) {
    hints.push(
      "Telephoto lens on the same set, compressed perspective, tighter framing than the wide master"
    );
  }
  if (
    hasStairs &&
    /looking down|look down|top down|top-down|overhead|bird.?s eye|straight down/.test(
      lower
    )
  ) {
    hints.push(
      "Camera overhead on the same wide stone staircase from the establishing reference, looking down at the same treads"
    );
  } else if (
    /looking down|look down|top down|top-down|overhead|bird.?s eye|straight down/.test(
      lower
    )
  ) {
    hints.push(
      "Camera overhead looking down at the same set from the establishing reference"
    );
  }
  if (
    hasStairs &&
    /low angle|low camera|worm.?s eye|from below|looking up|ground level|straight at/.test(
      lower
    )
  ) {
    hints.push(
      "Camera at ground level on the same monumental staircase, low angle near the tread surface, same scale as the establishing wide, not a distant wide view"
    );
  } else if (
    /low angle|low camera|worm.?s eye|from below|looking up|ground level/.test(
      lower
    )
  ) {
    hints.push(
      "Low camera on the same set from the establishing reference, not a distant wide view"
    );
  }
  if (/push.?in|dolly in|medium shot|mid shot/.test(lower)) {
    hints.push(
      "Medium or closer framing on the same set, not a wide master shot, still the same architecture and prop layout"
    );
  }
  if (/water running|rain on|wet stone|drops on/.test(lower)) {
    hints.push(
      "Visible water droplets and runoff on the same wet surfaces from the establishing shot"
    );
  }

  hints.push(
    "Different camera position and lens from the establishing wide, not a pixel crop, not a redesigned set, not a duplicate wide composition"
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
  "blurry, watermark, text, logo, collage, split screen, multiple panels, turnaround sheet, model sheet, four views, reference sheet layout, low quality, deformed, duplicate, figurine, action figure, collectible statuette, product photography, toy packaging, front and back views in one image, multiple angles in one image, character design sheet, head cropped, head cut off, forehead out of frame, missing top of head, chin cropped, neck only framing, character sheet pose, neutral standing casting pose, studio portrait, casting reference framing";


export const SHOT_DUAL_IPADAPTER_LAYOUT_SUFFIX =
  "the character clearly visible in the environment, subject present in frame, not an empty room, not a vacant set";

export const SHOT_COMPOSITED_CAMERA_SUFFIX =
  "35mm lens at f/1.8, shallow depth of field, subject sharp in foreground, background soft bokeh blur, medium shot, subject large in frame and centered, feet on pavement, on-location cinematic storyboard still, not a distant wide establishing shot, not a tiny figure in the scene";

export const SHOT_COMPOSITED_COLOR_SUFFIX =
  "unified color grading with the location plate, matching ambient color temperature and shadow tone, subject and background share the same white balance";

export const SHOT_COMPOSITED_NEGATIVE =
  "tiny figure, distant subject, small person in frame, environmental wide master, full scene establishing shot, sharp background, deep focus, everything in focus, pasted cutout, floating subject, bad composite, halo around subject, warm subject on cool background, cool subject on warm background, mismatched white balance, split color grading";

export const SHOT_INTEGRATE_IN_SCENE_SUFFIX =
  "the character clearly visible in the frame, subject present in the scene, subject generated in the same environment as the location reference, matching scene lighting and depth, photographed with the same lens, focal length, and camera height as the background plate, single consistent perspective, subject at a natural scale for their distance from the camera, correctly proportioned to the doorways, windows, and set pieces around them, grounded on the visible floor plane, on-location cinematic storyboard still, not a cutout composite";

export const SHOT_INTEGRATE_IN_SCENE_NEGATIVE =
  "empty scene, deserted street with no subject present, missing subject, character absent from frame, pasted cutout, floating subject, green screen composite, sticker on background, hard cutout edges, mismatched lighting direction, flat superimposed figure, halo around subject, bad composite, oversized subject, giant subject, subject too large for the scene, wrong scale, out of proportion with the environment";

/**
 * When a character reference image is attached, force the sampler to keep that
 * sheet's species and body plan. Without this, integrate suffixes plus a
 * human-sounding name (for example Jasmine) invent a person even when the
 * reference is a dragon or other non-human.
 */
export const SHOT_CHARACTER_REFERENCE_BODY_LOCK =
  "exact same species, anatomy, and body plan as the character reference image, match the reference silhouette and features, do not replace the subject with a different species";

export const SHOT_CHARACTER_REFERENCE_BODY_LOCK_NEGATIVE =
  "wrong species, replaced with a human, human woman, human man, redhead woman, human face on animal body, anthropomorphic redesign that ignores the reference, different creature than the character reference";

/**
 * Inside a masked inpaint the plate already fixes the framing, and
 * establishing-view language actively invites the sampler to paint empty
 * scenery instead of the character in the subject region. Remove the default
 * location-angle framing sentence for integrate mode.
 */
const INTEGRATE_PROMPT_PHRASES_TO_STRIP = [
  "Wide establishing view of the full environment.",
  "Wide establishing view of the full environment",
];

/** Added only when the shot prompt does not ask for a supported or low pose. */
export const SHOT_INTEGRATE_IN_SCENE_GROUNDED_POSE_SUFFIX =
  "standing at full height on the ground plane, weight balanced, supported by their own body, not leaning on anything";

export const SHOT_INTEGRATE_IN_SCENE_NO_LEAN_NEGATIVE =
  "crouching, squatting, kneeling, hunched over, leaning on empty air, leaning against nothing, propped on an invisible object, resting an arm on nothing, phantom support, leaning against an object that is not there";

/**
 * Casting-sheet pose negatives protect full-frame generations, but inside a
 * masked inpaint they only punish plain standing (the plate cannot become a
 * casting sheet), and the model dodges them by crouching. Strip them for
 * integrate mode.
 */
const INTEGRATE_NEGATIVE_TERMS_TO_STRIP = [
  "character sheet pose",
  "neutral standing casting pose",
];

function stripNegativeTerms(negative: string, terms: string[]): string {
  return negative
    .split(/,\s*/)
    .filter((part) => !terms.includes(part.trim()))
    .join(", ");
}

/**
 * Shot prompt asks for the subject to face the camera. Scene priors are
 * strong inside a masked inpaint (a figure at a shop window defaults to
 * back-to-camera), so facing intent gets explicit reinforcement.
 */
export function detectFacingCameraIntent(prompt: string): boolean {
  return /\bfacing (?:the )?camera\b|\bfaces? (?:the )?camera\b|\blooking (?:at|into|toward) (?:the )?camera\b|\btoward (?:the )?camera\b|\bfront view\b|\beye contact\b/i.test(
    prompt
  );
}

export const SHOT_INTEGRATE_FACING_CAMERA_SUFFIX =
  "facing the camera, head toward the camera, front of the subject toward the viewer";

export const SHOT_INTEGRATE_FACING_CAMERA_NEGATIVE =
  "rear view, back view, seen from behind, back of head, turned away from camera, facing away";

/**
 * Shot prompt asks for a supported or deliberately low pose (lean, sit,
 * crouch, kneel), so do not force full standing height.
 */
export function detectSupportedPoseIntent(prompt: string): boolean {
  return /\blean(?:s|ing|ed)?\b|\bpropped\b|\breclin(?:e|es|ing|ed)\b|\bperch(?:es|ed|ing)?\b|\bsit(?:s|ting)?\b|\bseated\b|\bslouch(?:es|ed|ing)?\b|\bcrouch(?:es|ed|ing)?\b|\bsquat(?:s|ted|ting)?\b|\bkneel(?:s|ed|ing)?\b|\bknelt\b|\bhunch(?:es|ed|ing)?\b|\bduck(?:s|ed|ing)?\b|\bcrawl(?:s|ed|ing)?\b|\brest(?:s|ing)? (?:a |an |his |her |their )?(?:arm|hand|elbow|foot|back)\b/i.test(
    prompt
  );
}

/**
 * Scene edit (Qwen Image Edit): the workflow feeds image1 = location plate and
 * image2 = character reference into an instruction-following editing model.
 * The prompt is a plain-language edit instruction, not an SDXL tag list, so
 * the shot description is wrapped instead of suffixed with parity keywords.
 */
export const SHOT_SCENE_EDIT_INSTRUCTION_PREFIX =
  "Add the subject from image 2 into the scene from image 1.";

export const SHOT_SCENE_EDIT_INSTRUCTION_SUFFIX =
  "The subject keeps the exact same species, anatomy, face or head, and appearance as in image 2, and interacts naturally with the scene, matching its lighting, shadows, and perspective. All architecture, doors, windows, signs, and objects in the scene keep their exact original size, position, and proportions from image 1; do not enlarge or move them. Scale the subject realistically to the existing architecture: a doorway is taller than the subject, and the subject's head stays below the top of the door frame. Photorealistic cinematic still.";

/**
 * Suffix for instruction edits of a finished still (Qwen Image Edit): apply
 * only the requested change and leave the rest of the frame untouched.
 */
export const SHOT_IMAGE_EDIT_INSTRUCTION_SUFFIX =
  "Apply only this change. Keep everything else in the image exactly the same: same people, same faces, same composition, same lighting, same colors, same architecture. Photorealistic cinematic still.";

export function applyShotReferenceModePromptExtras(
  processedPrompt: string,
  negativePrompt: string,
  plan: {
    effectiveMode: string;
    useDualIpAdapter: boolean;
    useCompositingPipeline: boolean;
    characterPath?: string | null;
  }
): { processedPrompt: string; negativePrompt: string } {
  let nextPrompt = processedPrompt;
  let nextNegative = negativePrompt;
  const hasCharacterReference = Boolean(plan.characterPath);

  if (plan.effectiveMode === "scene_edit") {
    for (const phrase of INTEGRATE_PROMPT_PHRASES_TO_STRIP) {
      nextPrompt = nextPrompt.replace(phrase, "").replace(/\s{2,}/g, " ");
    }
    nextPrompt = `${SHOT_SCENE_EDIT_INSTRUCTION_PREFIX} ${nextPrompt.trim()}`;
    if (!nextPrompt.endsWith(".")) nextPrompt = `${nextPrompt}.`;
    nextPrompt = `${nextPrompt} ${SHOT_SCENE_EDIT_INSTRUCTION_SUFFIX}`;
    // Sampler runs at CFG 1.0 (Lightning LoRA), so the negative prompt has no
    // effect; leave it untouched.
    return { processedPrompt: nextPrompt, negativePrompt: nextNegative };
  }

  const suffixParts: string[] = [];
  if (plan.useDualIpAdapter) {
    suffixParts.push(SHOT_DUAL_IPADAPTER_LAYOUT_SUFFIX);
  }
  if (plan.effectiveMode === "composited") {
    suffixParts.push(SHOT_COMPOSITED_CAMERA_SUFFIX);
  }
  if (plan.useCompositingPipeline) {
    suffixParts.push(SHOT_COMPOSITED_COLOR_SUFFIX);
  }
  const integrateWantsSupportedPose =
    plan.effectiveMode === "integrate_in_scene" &&
    detectSupportedPoseIntent(processedPrompt);
  if (plan.effectiveMode === "integrate_in_scene") {
    for (const phrase of INTEGRATE_PROMPT_PHRASES_TO_STRIP) {
      nextPrompt = nextPrompt.replace(phrase, "").replace(/\s{2,}/g, " ");
    }
    suffixParts.push(SHOT_INTEGRATE_IN_SCENE_SUFFIX);
    if (!integrateWantsSupportedPose) {
      suffixParts.push(SHOT_INTEGRATE_IN_SCENE_GROUNDED_POSE_SUFFIX);
    }
    if (detectFacingCameraIntent(processedPrompt)) {
      suffixParts.push(SHOT_INTEGRATE_FACING_CAMERA_SUFFIX);
    }
  }
  if (
    hasCharacterReference &&
    (plan.effectiveMode === "integrate_in_scene" ||
      plan.effectiveMode === "character" ||
      plan.effectiveMode === "composited" ||
      plan.useDualIpAdapter)
  ) {
    suffixParts.push(SHOT_CHARACTER_REFERENCE_BODY_LOCK);
  }

  for (const part of suffixParts) {
    if (!nextPrompt.includes(part)) {
      nextPrompt = `${nextPrompt}. ${part}`;
    }
  }

  if (
    plan.effectiveMode === "composited" &&
    !nextNegative.includes("tiny figure")
  ) {
    nextNegative = nextNegative
      ? `${nextNegative}, ${SHOT_COMPOSITED_NEGATIVE}`
      : SHOT_COMPOSITED_NEGATIVE;
  }

  if (plan.effectiveMode === "integrate_in_scene") {
    nextNegative = stripNegativeTerms(
      nextNegative,
      INTEGRATE_NEGATIVE_TERMS_TO_STRIP
    );
  }

  if (
    plan.effectiveMode === "integrate_in_scene" &&
    !nextNegative.includes("pasted cutout")
  ) {
    nextNegative = nextNegative
      ? `${nextNegative}, ${SHOT_INTEGRATE_IN_SCENE_NEGATIVE}`
      : SHOT_INTEGRATE_IN_SCENE_NEGATIVE;
  }

  if (
    plan.effectiveMode === "integrate_in_scene" &&
    detectFacingCameraIntent(processedPrompt) &&
    !nextNegative.includes("turned away from camera")
  ) {
    nextNegative = `${nextNegative}, ${SHOT_INTEGRATE_FACING_CAMERA_NEGATIVE}`;
  }

  if (
    plan.effectiveMode === "integrate_in_scene" &&
    !integrateWantsSupportedPose &&
    !nextNegative.includes("leaning on empty air")
  ) {
    nextNegative = nextNegative
      ? `${nextNegative}, ${SHOT_INTEGRATE_IN_SCENE_NO_LEAN_NEGATIVE}`
      : SHOT_INTEGRATE_IN_SCENE_NO_LEAN_NEGATIVE;
  }

  if (
    hasCharacterReference &&
    (plan.effectiveMode === "integrate_in_scene" ||
      plan.effectiveMode === "character" ||
      plan.effectiveMode === "composited" ||
      plan.useDualIpAdapter) &&
    !nextNegative.includes("wrong species")
  ) {
    nextNegative = nextNegative
      ? `${nextNegative}, ${SHOT_CHARACTER_REFERENCE_BODY_LOCK_NEGATIVE}`
      : SHOT_CHARACTER_REFERENCE_BODY_LOCK_NEGATIVE;
  }

  return { processedPrompt: nextPrompt, negativePrompt: nextNegative };
}

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
    const wingShot = /wing|feather/i.test(desc);
    hints.push(
      wingShot
        ? "Macro close-up on the upper back and wings only, pristine glowing white avian feathers erupting through torn dark leathery wing tissue, feather and membrane texture fills most of the frame"
        : "Macro close-up on the upper back only, fabric, hair, and skin texture fills most of the frame"
    );
    hints.push(
      "Camera behind the subject, back to camera, face not visible, do not show full body, not a wide shot, not a medium shot, camera inches from the surface"
    );
  } else if (detectRearViewShot(desc)) {
    const wingShot = /wing|feather/i.test(desc);
    hints.push(
      wingShot
        ? "Camera behind the subject, back to camera, rear view, face not visible, focus on back and wings"
        : "Camera behind the subject, back to camera, rear view, face not visible, focus on the subject's back"
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
  const shotSanitized = splitPositiveNegationPhrases(shotPrompt);
  const contextSanitized = splitPositiveNegationPhrases(
    options?.context?.trim() ?? ""
  );
  const desc = shotSanitized.cleaned.trim();
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
  const contextBlock = contextSanitized.cleaned.trim();
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
    // Always suppress casting-sheet backdrops in shot stills. Even with a
    // location reference attached, the character reference can otherwise
    // drag the studio backdrop into the staged frame.
    SHOT_CHARACTER_SHEET_BACKGROUND_NEGATIVE,
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
  const shotSanitized = splitPositiveNegationPhrases(shotPrompt);
  const contextSanitized = splitPositiveNegationPhrases(
    options?.context?.trim() ?? ""
  );
  const cleanShotPrompt = shotSanitized.cleaned;
  const cleanContext = contextSanitized.cleaned || undefined;
  const lockWardrobe = Boolean(options?.wardrobeLock);
  let negativePrompt = buildShotPlaceholderNegativePrompt(
    style,
    cleanShotPrompt,
    {
      lockWardrobe,
      hasLocationReference: options?.hasLocationReference,
    }
  );
  negativePrompt = mergeUniqueNegativeTerms(negativePrompt, [
    ...shotSanitized.negativeTerms,
    ...contextSanitized.negativeTerms,
  ]);
  const templatePrompt = buildShotPlaceholderPromptTemplate(
    title,
    cleanShotPrompt,
    style,
    { ...options, context: cleanContext }
  );

  const llmResult = await expandPromptWithLlm({
    name: title,
    userDescription: cleanShotPrompt,
    templatePrompt,
    visualStyle: style,
    mode: "shot",
  });

  const processed = llmResult.prompt.trim();
  const layoutSuffix = detectDetailMacroShot(cleanShotPrompt)
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
