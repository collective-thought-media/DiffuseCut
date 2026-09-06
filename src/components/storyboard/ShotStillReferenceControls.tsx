"use client";

import type { ShotStillReferenceMode } from "@/lib/services/shot-still-reference-mode";
import type {
  ShotFaceDetail,
  ShotIdentityStrength,
  ShotSubjectPosition,
  ShotSubjectScale,
} from "@/lib/shot-render-overrides";
import { Label, Select } from "@/components/ui/button";

const IDENTITY_STRENGTH_LABELS: Record<ShotIdentityStrength, string> = {
  low: "Low (prompt leads, looser likeness)",
  balanced: "Balanced (default)",
  high: "High (strict likeness, less staging freedom)",
};

const SUBJECT_SCALE_LABELS: Record<ShotSubjectScale, string> = {
  small: "Small (deeper in the scene)",
  medium: "Medium (default)",
  large: "Large (foreground)",
};

const SUBJECT_POSITION_LABELS: Record<ShotSubjectPosition, string> = {
  left: "Left third",
  center: "Center",
  right: "Right third",
};

const FACE_DETAIL_LABELS: Record<ShotFaceDetail, string> = {
  off: "Off (default)",
  refine: "Refine faces (extra pass per image)",
};

const MODE_LABELS: Record<ShotStillReferenceMode, string> = {
  auto: "Auto (integrate in scene when both references exist)",
  scene_edit: "Scene edit: character interacts with the set (Qwen Image Edit)",
  integrate_in_scene:
    "Integrate in scene: paint character into the plate (inpaint + IP-Adapter)",
  composited:
    "Composited: plate first, character painted over (inpaint + IP-Adapter)",
  dual: "Dual reference: both images steer the whole frame (dual IP-Adapter)",
  character: "Character reference only (IP-Adapter)",
  location: "Location reference only (IP-Adapter)",
  prompt_only: "Prompt only (no reference image)",
};

/**
 * Dropdown structure: modes grouped by how they use the references, so the
 * list reads as a decision tree instead of a flat pile. Groups with no
 * available modes are hidden. A null label renders ungrouped options.
 */
const MODE_GROUPS: { label: string | null; modes: ShotStillReferenceMode[] }[] =
  [
    { label: null, modes: ["auto"] },
    {
      label: "Character + location (both references)",
      modes: ["scene_edit", "integrate_in_scene", "composited", "dual"],
    },
    {
      label: "Single reference (IP-Adapter)",
      modes: ["character", "location"],
    },
    { label: "No reference image", modes: ["prompt_only"] },
  ];

interface ShotStillReferenceControlsProps {
  mode: ShotStillReferenceMode;
  availableModes: ShotStillReferenceMode[];
  characterName?: string | null;
  locationLabel?: string | null;
  onChange: (mode: ShotStillReferenceMode) => void;
  identityStrength?: ShotIdentityStrength;
  showIdentityStrength?: boolean;
  onIdentityStrengthChange?: (strength: ShotIdentityStrength) => void;
  subjectScale?: ShotSubjectScale;
  subjectPosition?: ShotSubjectPosition;
  showSubjectControls?: boolean;
  onSubjectScaleChange?: (scale: ShotSubjectScale) => void;
  onSubjectPositionChange?: (position: ShotSubjectPosition) => void;
  faceDetail?: ShotFaceDetail;
  showFaceDetail?: boolean;
  onFaceDetailChange?: (faceDetail: ShotFaceDetail) => void;
  disabled?: boolean;
}

export function ShotStillReferenceControls({
  mode,
  availableModes,
  characterName,
  locationLabel,
  onChange,
  identityStrength = "balanced",
  showIdentityStrength = false,
  onIdentityStrengthChange,
  subjectScale = "medium",
  subjectPosition = "center",
  showSubjectControls = false,
  onSubjectScaleChange,
  onSubjectPositionChange,
  faceDetail = "off",
  showFaceDetail = false,
  onFaceDetailChange,
  disabled = false,
}: ShotStillReferenceControlsProps) {
  if (availableModes.length <= 1) return null;

  const available = new Set(availableModes);
  const groups = MODE_GROUPS.map((group) => ({
    ...group,
    modes: group.modes.filter((item) => available.has(item)),
  })).filter((group) => group.modes.length > 0);

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Visual reference</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose which saved reference art to send to ComfyUI for this shot.
          How the location is used depends on the mode. Character references
          lock face and wardrobe. Your shot prompt still drives framing and
          action.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="shot-still-reference-mode">Reference mode</Label>
        <Select
          id="shot-still-reference-mode"
          value={mode}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value as ShotStillReferenceMode)
          }
        >
          {groups.map((group, index) =>
            group.label === null ? (
              group.modes.map((item) => (
                <option key={item} value={item}>
                  {MODE_LABELS[item]}
                </option>
              ))
            ) : (
              <optgroup key={group.label ?? index} label={group.label}>
                {group.modes.map((item) => (
                  <option key={item} value={item}>
                    {MODE_LABELS[item]}
                  </option>
                ))}
              </optgroup>
            )
          )}
        </Select>
      </div>

      {showIdentityStrength && onIdentityStrengthChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="shot-identity-strength">Character likeness</Label>
          <Select
            id="shot-identity-strength"
            value={identityStrength}
            disabled={disabled}
            onChange={(e) =>
              onIdentityStrengthChange(
                e.target.value as ShotIdentityStrength
              )
            }
          >
            {(Object.keys(IDENTITY_STRENGTH_LABELS) as ShotIdentityStrength[]).map(
              (item) => (
                <option key={item} value={item}>
                  {IDENTITY_STRENGTH_LABELS[item]}
                </option>
              )
            )}
          </Select>
          <p className="text-xs text-muted-foreground">
            How strongly the character sheet locks identity. High is meant to
            be used: in Character reference mode it locks hard; in Integrate in
            scene it still bumps likeness without crushing pose and anatomy.
            Lower it when the prompt should lead pose and framing.
          </p>
        </div>
      ) : null}

      {showSubjectControls && onSubjectScaleChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="shot-subject-scale">Subject size</Label>
          <Select
            id="shot-subject-scale"
            value={subjectScale}
            disabled={disabled}
            onChange={(e) =>
              onSubjectScaleChange(e.target.value as ShotSubjectScale)
            }
          >
            {(Object.keys(SUBJECT_SCALE_LABELS) as ShotSubjectScale[]).map(
              (item) => (
                <option key={item} value={item}>
                  {SUBJECT_SCALE_LABELS[item]}
                </option>
              )
            )}
          </Select>
          <p className="text-xs text-muted-foreground">
            Sets the region of the plate the character is painted into, which
            directly controls how large they render in frame.
          </p>
        </div>
      ) : null}

      {showSubjectControls && onSubjectPositionChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="shot-subject-position">Subject position</Label>
          <Select
            id="shot-subject-position"
            value={subjectPosition}
            disabled={disabled}
            onChange={(e) =>
              onSubjectPositionChange(e.target.value as ShotSubjectPosition)
            }
          >
            {(Object.keys(SUBJECT_POSITION_LABELS) as ShotSubjectPosition[]).map(
              (item) => (
                <option key={item} value={item}>
                  {SUBJECT_POSITION_LABELS[item]}
                </option>
              )
            )}
          </Select>
        </div>
      ) : null}

      {showFaceDetail && onFaceDetailChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="shot-face-detail">Face detail</Label>
          <Select
            id="shot-face-detail"
            value={faceDetail}
            disabled={disabled}
            onChange={(e) =>
              onFaceDetailChange(e.target.value as ShotFaceDetail)
            }
          >
            {(Object.keys(FACE_DETAIL_LABELS) as ShotFaceDetail[]).map(
              (item) => (
                <option key={item} value={item}>
                  {FACE_DETAIL_LABELS[item]}
                </option>
              )
            )}
          </Select>
          <p className="text-xs text-muted-foreground">
            After each still, detect the character&apos;s face, re-render it at
            higher resolution with the character reference for likeness, and
            paste it back. Fixes soft or mushy faces in wide shots. Needs the
            ComfyUI Impact Pack installed.
          </p>
        </div>
      ) : null}

      {mode === "character" && characterName ? (
        <p className="text-xs text-muted-foreground">
          Uses {characterName}&apos;s character sheet only.
        </p>
      ) : null}
      {mode === "location" && locationLabel ? (
        <p className="text-xs text-muted-foreground">
          Uses location reference only ({locationLabel}).
        </p>
      ) : null}
      {mode === "scene_edit" ? (
        <p className="text-xs text-muted-foreground">
          Sends the location plate and character reference to an image editing
          model (Qwen Image Edit) with your shot prompt as the instruction. The
          character can interact with the scene: open doors, touch objects, be
          partly hidden behind set pieces. Needs the Qwen Image Edit 2511
          models installed on ComfyUI.
        </p>
      ) : null}
      {mode === "integrate_in_scene" ? (
        <p className="text-xs text-muted-foreground">
          Paints the character into a masked region of your saved location
          plate. The rest of the plate stays pixel-locked, and Subject size
          controls how large the character renders. No cutout paste. Stronger
          set lock than Dual, more natural depth than Composited.
        </p>
      ) : null}
      {mode === "dual" ? (
        <p className="text-xs text-muted-foreground">
          Sends both pictures into one diffusion pass. A studio character sheet
          has a blank ground, so that empty background can still win over the
          location. Use Auto or Integrate in scene when you want the saved
          location plate to stay the set.
        </p>
      ) : null}
      {mode === "composited" ? (
        <p className="text-xs text-muted-foreground">
          Location plate locks set layout. Character reference locks identity and
          wardrobe. Your shot prompt drives pose and framing. When compositing
          nodes are installed on ComfyUI, a character isolate pass runs before
          composite and inpaint.
        </p>
      ) : null}
      {mode === "prompt_only" ? (
        <p className="text-xs text-muted-foreground">
          No reference image is sent. Cast look descriptions and your shot prompt
          carry the visual direction.
        </p>
      ) : null}
    </div>
  );
}
