"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Location,
  LocationAngle,
  LocationState,
  Shot,
  Character,
  CharacterState,
} from "@/lib/db/schema";
import { buildAngleReferenceDescription } from "@/lib/location-preview";
import type { ShotCharacterCastEntry } from "@/lib/services/shot-cast";
import { buildShotPlaceholderDescriptionFromData } from "@/lib/services/shot-placeholder-description";
import {
  resolveShotReferencePathsFromData,
  resolveShotCastReferenceSplit,
} from "@/lib/services/shot-reference-core";
import {
  listAvailableShotStillReferenceModes,
  resolveShotStillReferencePlan,
  type ShotStillReferenceMode,
} from "@/lib/services/shot-still-reference-mode";
import { parseShotRenderOverrides, mergeShotRenderOverrides, serializeShotRenderOverrides, type ShotFaceDetail, type ShotIdentityStrength, type ShotSubjectPosition, type ShotSubjectScale } from "@/lib/shot-render-overrides";
import { ShotStillReferenceControls } from "@/components/storyboard/ShotStillReferenceControls";
import {
  frameAtTimelinePosition,
  totalProjectFrames,
} from "@/lib/timing/frames";
import { Timeline } from "@/components/storyboard/Timeline";
import { ShotCastEditor } from "@/components/storyboard/ShotCastEditor";
import { ShotLocationRefEditor } from "@/components/storyboard/ShotLocationRefEditor";
import {
  ShotPlaceholderBatchProvider,
  ShotPlaceholderControls,
  ShotPlaceholderOptionsPanel,
  ShotReferenceInfoPanel,
} from "@/components/storyboard/ShotPlaceholderGenerator";
import { MediaPanel } from "@/components/sheets/MediaPanel";
import { useDebouncedSave, type DebouncedSaveContext } from "@/lib/hooks/useDebouncedSave";
import { useSyncedEditableFields } from "@/lib/hooks/useSyncedEditableFields";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Textarea,
  Badge,
} from "@/components/ui/button";

type PageProps = { params: Promise<{ projectId: string }> };

type StoryboardShot = Shot & {
  characterCast: ShotCharacterCastEntry[];
  characterIds: string[];
};

type CharacterWithStates = Character & { states: CharacterState[] };
type LocationWithStates = Location & {
  states: Array<LocationState & { angles: LocationAngle[] }>;
};

function defaultLocationRef(location: LocationWithStates) {
  const state = location.states[0];
  if (!state) {
    return { locationStateId: null as string | null, locationAngleId: null as string | null };
  }
  const angle =
    state.angles.find(
      (item) =>
        item.referencePath &&
        item.name.trim().toLowerCase().includes("establishing")
    ) ??
    state.angles.find((item) => item.referencePath) ??
    state.angles[0] ??
    null;
  return {
    locationStateId: state.id,
    locationAngleId: angle?.id ?? null,
  };
}

export default function StoryboardPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [locations, setLocations] = useState<LocationWithStates[]>([]);
  const [characters, setCharacters] = useState<CharacterWithStates[]>([]);
  const [fps, setFps] = useState(24);
  const [visualStyleJson, setVisualStyleJson] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedShot = shots.find((s) => s.id === selectedShotId) ?? null;

  const selectedLocation = selectedShot?.locationId
    ? locations.find((l) => l.id === selectedShot.locationId) ?? null
    : null;

  const shotPlaceholderDescription = useMemo(() => {
    if (!selectedShot) return "";
    const castEntries = (selectedShot.characterCast ?? [])
      .map((entry) => {
        const character = characters.find((c) => c.id === entry.characterId);
        if (!character) return null;
        const state =
          character.states.find((s) => s.id === entry.characterStateId) ??
          character.states[0];
        if (!state) return null;
        return { character, state };
      })
      .filter(Boolean) as Array<{ character: Character; state: CharacterState }>;

    let locationDetail: string | null = null;
    if (selectedLocation?.states.length) {
      const state =
        selectedLocation.states.find(
          (item) => item.id === selectedShot.locationStateId
        ) ?? selectedLocation.states[0];
      const angle =
        state.angles.find((item) => item.id === selectedShot.locationAngleId) ??
        state.angles[0];
      if (angle) {
        locationDetail = buildAngleReferenceDescription(
          selectedLocation.description ?? "",
          state,
          angle
        );
      }
    }

    return buildShotPlaceholderDescriptionFromData({
      prompt: selectedShot.prompt,
      location: selectedLocation,
      locationDetail,
      cast: castEntries,
    });
  }, [selectedShot, selectedLocation, characters]);

  const shotReferenceMeta = useMemo(() => {
    if (!selectedShot) {
      return {
        usesReferenceMedia: false,
        usesDualIpAdapter: false,
        usesCharacterReference: false,
        referenceMediaLabel: null as string | null,
        referenceDetail: null as string | null,
        stillReferenceMode: "auto" as ShotStillReferenceMode,
        identityStrength: "balanced" as ShotIdentityStrength,
        showIdentityStrength: false,
        subjectScale: "medium" as ShotSubjectScale,
        subjectPosition: "center" as ShotSubjectPosition,
        showSubjectControls: false,
        faceDetail: "off" as ShotFaceDetail,
        showFaceDetail: false,
        availableReferenceModes: [] as ShotStillReferenceMode[],
        characterName: null as string | null,
        locationLabel: null as string | null,
      };
    }

    const castEntries = (selectedShot.characterCast ?? [])
      .map((entry) => {
        const character = characters.find((c) => c.id === entry.characterId);
        if (!character) return null;
        const state =
          character.states.find((s) => s.id === entry.characterStateId) ??
          character.states[0];
        if (!state) return null;
        return { character, state };
      })
      .filter(Boolean) as Array<{ character: Character; state: CharacterState }>;

    const refs = resolveShotReferencePathsFromData({
      shot: selectedShot,
      locationStates: selectedLocation?.states,
      legacyLocationPath: selectedLocation?.referencePath,
      legacyLocationKind: selectedLocation?.referenceKind,
      cast: castEntries,
    });

    const castSplit = resolveShotCastReferenceSplit(castEntries);
    const shotOverrides = parseShotRenderOverrides(
      selectedShot.renderOverridesJson
    );
    const stillReferenceMode = shotOverrides.stillReferenceMode ?? "auto";
    const identityStrength = shotOverrides.identityStrength ?? "balanced";
    const subjectScale = shotOverrides.subjectScale ?? "medium";
    const subjectPosition = shotOverrides.subjectPosition ?? "center";
    const faceDetail = shotOverrides.faceDetail ?? "off";
    const plan = resolveShotStillReferencePlan(refs, stillReferenceMode);
    const showIdentityStrength =
      plan.effectiveMode === "integrate_in_scene" ||
      plan.effectiveMode === "character";
    const showSubjectControls = plan.effectiveMode === "integrate_in_scene";
    const showFaceDetail =
      Boolean(refs.characterPath) && plan.effectiveMode !== "prompt_only";
    const locationLabel = [refs.locationStateName, refs.locationAngleName]
      .filter(Boolean)
      .join(", ");

    if (!refs.characterPath && !refs.locationPath) {
      return {
        usesReferenceMedia: false,
        usesDualIpAdapter: false,
        usesCharacterReference: false,
        referenceMediaLabel: null,
        referenceDetail: null,
        stillReferenceMode,
        identityStrength,
        showIdentityStrength,
        subjectScale,
        subjectPosition,
        showSubjectControls,
        faceDetail,
        showFaceDetail,
        availableReferenceModes: listAvailableShotStillReferenceModes(refs),
        characterName: refs.characterName,
        locationLabel: locationLabel || null,
      };
    }

    const detailParts: string[] = [];

    if (plan.useDualIpAdapter) {
      detailParts.push(
        `Dual IP-Adapter: ${refs.characterName ?? "Character"} for identity and wardrobe, ${locationLabel || "location"} for background and set lighting.`
      );
    } else if (plan.effectiveMode === "character") {
      detailParts.push(
        `Single IP-Adapter: ${refs.characterName ?? "Character"} sheet for identity and wardrobe. Location and framing come from the prompt.`
      );
      if (castSplit.promptOnlyEntries.length > 0) {
        detailParts.push(
          `${castSplit.promptOnlyEntries.map((entry) => entry.character.name).join(", ")}: look descriptions in the prompt only, not reference art.`
        );
      }
    } else if (plan.effectiveMode === "location") {
      detailParts.push(
        `Single IP-Adapter: ${locationLabel || "location"} reference for background and set lighting. Cast appearance comes from the prompt${refs.characterPath ? " and character look descriptions" : ""}.`
      );
      if (castEntries.length > 0) {
        detailParts.push(
          `Cast (${castEntries.map((entry) => entry.character.name).join(", ")}): look descriptions in the prompt only unless character reference mode is selected.`
        );
      }
    } else if (plan.effectiveMode === "integrate_in_scene") {
      detailParts.push(
        `Integrate in scene: ${refs.characterName ?? "Character"} painted into ${locationLabel || "location"} via location-plate img2img. One diffusion pass, no cutout paste.`
      );
    } else if (plan.effectiveMode === "composited") {
      detailParts.push(
        `Composited: ${refs.characterName ?? "Character"} on ${locationLabel || "location"}. Location plate locks set layout; character reference locks identity and wardrobe.`
      );
    } else if (plan.effectiveMode === "prompt_only") {
      detailParts.push(
        "Prompt only: no reference image is sent to ComfyUI for this shot."
      );
    } else if (refs.characterPath) {
      if (castSplit.promptOnlyEntries.length > 0) {
        detailParts.push(
          `${castSplit.promptOnlyEntries.map((entry) => entry.character.name).join(", ")}: look descriptions in the prompt only, not reference art.`
        );
      }
      if (castSplit.ipAdapterEntry && castEntries.length > 1) {
        detailParts.unshift(
          `${castSplit.ipAdapterEntry.character.name} is the only cast member whose reference art is sent to IP-Adapter (first in list with a sheet).`
        );
      }
    } else if (castEntries.length > 0) {
      detailParts.push(
        `Cast (${castEntries.map((entry) => entry.character.name).join(", ")}): look descriptions in the prompt only, not reference art.`
      );
    }

    return {
      usesReferenceMedia: plan.useIpAdapter,
      usesDualIpAdapter: plan.useDualIpAdapter,
      usesCharacterReference:
        plan.effectiveMode === "character" || plan.useDualIpAdapter,
      referenceMediaLabel: plan.label ?? refs.primaryLabel,
      referenceDetail: detailParts.length > 0 ? detailParts.join(" ") : null,
      stillReferenceMode,
      identityStrength,
      showIdentityStrength,
      subjectScale,
      subjectPosition,
      showSubjectControls,
      faceDetail,
      showFaceDetail,
      availableReferenceModes: listAvailableShotStillReferenceModes(refs),
      characterName: refs.characterName,
      locationLabel: locationLabel || null,
    };
  }, [selectedShot, selectedLocation, characters]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, shotsRes, locsRes, charsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/shots`),
        fetch(`/api/projects/${projectId}/locations`),
        fetch(`/api/projects/${projectId}/characters`),
      ]);
      const projData = await projRes.json();
      const shotsData = await shotsRes.json();
      const locsData = await locsRes.json();
      const charsData = await charsRes.json();
      if (!projRes.ok) throw new Error(projData.error);
      if (!shotsRes.ok) throw new Error(shotsData.error);
      setFps(projData.project.defaultFps ?? 24);
      setVisualStyleJson(projData.project.visualStyleJson ?? null);
      setShots(shotsData.shots ?? []);
      setLocations(locsData.locations ?? []);
      setCharacters(charsData.characters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const totalFrames = totalProjectFrames(shots);

  useEffect(() => {
    if (totalFrames > 0 && currentFrame >= totalFrames) {
      setCurrentFrame(Math.max(0, totalFrames - 1));
    }
  }, [totalFrames, currentFrame]);

  useEffect(() => {
    if (!playing || shots.length === 0) return;
    const { shotIndex } = frameAtTimelinePosition(shots, currentFrame);
    const shot = shots[shotIndex];
    if (shot && shot.id !== selectedShotId) {
      setSelectedShotId(shot.id);
    }
  }, [playing, currentFrame, shots, selectedShotId]);

  useEffect(() => {
    if (!playing) {
      if (playRef.current) clearInterval(playRef.current);
      return;
    }
    playRef.current = setInterval(() => {
      setCurrentFrame((f) => {
        if (f >= totalFrames - 1) {
          setPlaying(false);
          return 0;
        }
        return f + 1;
      });
    }, 1000 / fps);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, fps, totalFrames]);

  async function handleAddShot() {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/shots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Shot ${shots.length + 1}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add shot");
      await loadAll();
      setSelectedShotId(data.shot.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add shot");
    }
  }

  async function handleReorder(orderedIds: string[]) {
    const res = await fetch(`/api/projects/${projectId}/shots/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    if (res.ok) {
      const reordered = orderedIds
        .map((id) => shots.find((s) => s.id === id))
        .filter(Boolean) as StoryboardShot[];
      setShots(reordered);
    }
  }

  const saveShot = useCallback(
    async (patch: Partial<StoryboardShot>, ctx: DebouncedSaveContext) => {
      if (!selectedShotId) return;
      const res = await fetch(
        `/api/projects/${projectId}/shots/${selectedShotId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!ctx.isLatest()) return;
      setShots((prev) =>
        prev.map((s) => {
          if (s.id !== selectedShotId) return s;
          return {
            ...data.shot,
            title: s.title,
            prompt: s.prompt,
            durationFrames: s.durationFrames,
          };
        })
      );
    },
    [projectId, selectedShotId]
  );

  const handlePlaceholderSelected = useCallback(
    (updated: Pick<
      Shot,
      "id" | "placeholderPath" | "placeholderKind" | "updatedAt"
    >) => {
      setShots((prev) =>
        prev.map((s) =>
          s.id === updated.id
            ? {
                ...s,
                placeholderPath: updated.placeholderPath,
                placeholderKind: updated.placeholderKind,
                updatedAt: updated.updatedAt,
              }
            : s
        )
      );
    },
    []
  );

  const { schedule, saving, saved } = useDebouncedSave(saveShot);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading storyboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Storyboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preview still images in sequence, then scrub or play through the
            timeline.
          </p>
        </div>
        <Button onClick={() => void handleAddShot()}>Add shot</Button>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <Timeline
        projectId={projectId}
        shots={shots}
        fps={fps}
        selectedShotId={selectedShotId}
        currentFrame={currentFrame}
        playing={playing}
        onSelectShot={setSelectedShotId}
        onReorder={(ids) => void handleReorder(ids)}
        onPlayPause={() => {
          if (!playing && totalFrames === 0) return;
          setPlaying((p) => !p);
        }}
        onStop={() => {
          setPlaying(false);
          setCurrentFrame(0);
        }}
        onSeek={(frame) => {
          const clamped = Math.max(0, Math.min(frame, Math.max(totalFrames - 1, 0)));
          setCurrentFrame(clamped);
          const { shotIndex } = frameAtTimelinePosition(shots, clamped);
          const shot = shots[shotIndex];
          if (shot) setSelectedShotId(shot.id);
        }}
      />

      {selectedShot ? (
        <ShotPlaceholderBatchProvider
          projectId={projectId}
          shotId={selectedShot.id}
          shotTitle={selectedShot.title}
          placeholderDescription={shotPlaceholderDescription}
          hasPlaceholder={Boolean(selectedShot.placeholderPath)}
          renderOverridesJson={selectedShot.renderOverridesJson}
          hasLocationReference={Boolean(selectedShot.locationId)}
          hasCharacterReference={Boolean(
            shotReferenceMeta.usesCharacterReference ||
              shotReferenceMeta.availableReferenceModes.includes("character")
          )}
          stillReferenceMode={shotReferenceMeta.stillReferenceMode}
          onRenderOverridesChange={(renderOverridesJson) => {
            setShots((prev) =>
              prev.map((s) =>
                s.id === selectedShotId ? { ...s, renderOverridesJson } : s
              )
            );
            schedule({ renderOverridesJson });
          }}
          onPlaceholderSelected={handlePlaceholderSelected}
        >
          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <Card className="mb-0 flex h-full flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="entity-card-subheader">Shot Editor</h2>
              {saving ? (
                <Badge variant="warning">Saving…</Badge>
              ) : saved ? (
                <Badge variant="success">Saved</Badge>
              ) : (
                <Badge>Unsaved</Badge>
              )}
            </div>
            <ShotTextFields
              shotId={selectedShot.id}
              title={selectedShot.title}
              prompt={selectedShot.prompt}
              durationFrames={selectedShot.durationFrames}
              onFieldsChange={(fields) => {
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? {
                          ...s,
                          title: fields.title,
                          prompt: fields.prompt,
                          durationFrames: fields.durationFrames,
                        }
                      : s
                  )
                );
              }}
              onSave={schedule}
              locationField={
                <div className="space-y-1.5">
                  <Label htmlFor="shot-location">Location</Label>
                  <Select
                    id="shot-location"
                    value={selectedShot.locationId ?? ""}
                    onChange={(e) => {
                      const locationId = e.target.value || null;
                      const location = locationId
                        ? locations.find((item) => item.id === locationId)
                        : null;
                      const defaults = location
                        ? defaultLocationRef(location)
                        : {
                            locationStateId: null as string | null,
                            locationAngleId: null as string | null,
                          };
                      setShots((prev) =>
                        prev.map((s) =>
                          s.id === selectedShotId
                            ? {
                                ...s,
                                locationId,
                                locationStateId: defaults.locationStateId,
                                locationAngleId: defaults.locationAngleId,
                              }
                            : s
                        )
                      );
                      schedule({
                        locationId,
                        locationStateId: defaults.locationStateId,
                        locationAngleId: defaults.locationAngleId,
                      });
                    }}
                  >
                    <option value="">None</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />
            {selectedLocation && selectedLocation.states.length > 0 && (
              <ShotLocationRefEditor
                locationStates={selectedLocation.states}
                locationStateId={selectedShot.locationStateId}
                locationAngleId={selectedShot.locationAngleId}
                onStateChange={(locationStateId) => {
                  const state = selectedLocation.states.find(
                    (item) => item.id === locationStateId
                  );
                  const angle =
                    state?.angles.find((item) => item.referencePath) ??
                    state?.angles[0] ??
                    null;
                  setShots((prev) =>
                    prev.map((s) =>
                      s.id === selectedShotId
                        ? {
                            ...s,
                            locationStateId,
                            locationAngleId: angle?.id ?? null,
                          }
                        : s
                    )
                  );
                  schedule({
                    locationStateId,
                    locationAngleId: angle?.id ?? null,
                  });
                }}
                onAngleChange={(locationAngleId) => {
                  setShots((prev) =>
                    prev.map((s) =>
                      s.id === selectedShotId ? { ...s, locationAngleId } : s
                    )
                  );
                  schedule({ locationAngleId });
                }}
              />
            )}
            <ShotCastEditor
              characters={characters}
              characterCast={selectedShot.characterCast ?? []}
              onChange={(characterCast) => {
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId ? { ...s, characterCast } : s
                  )
                );
                schedule({ characterCast });
              }}
            />
            <ShotStillReferenceControls
              mode={shotReferenceMeta.stillReferenceMode}
              availableModes={shotReferenceMeta.availableReferenceModes}
              characterName={shotReferenceMeta.characterName}
              locationLabel={shotReferenceMeta.locationLabel}
              identityStrength={shotReferenceMeta.identityStrength}
              showIdentityStrength={shotReferenceMeta.showIdentityStrength}
              subjectScale={shotReferenceMeta.subjectScale}
              subjectPosition={shotReferenceMeta.subjectPosition}
              showSubjectControls={shotReferenceMeta.showSubjectControls}
              faceDetail={shotReferenceMeta.faceDetail}
              showFaceDetail={shotReferenceMeta.showFaceDetail}
              onFaceDetailChange={(faceDetail) => {
                const next = serializeShotRenderOverrides(
                  mergeShotRenderOverrides(
                    parseShotRenderOverrides(selectedShot.renderOverridesJson),
                    { faceDetail }
                  )
                );
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? { ...s, renderOverridesJson: next }
                      : s
                  )
                );
                schedule({ renderOverridesJson: next });
              }}
              onSubjectScaleChange={(subjectScale) => {
                const next = serializeShotRenderOverrides(
                  mergeShotRenderOverrides(
                    parseShotRenderOverrides(selectedShot.renderOverridesJson),
                    { subjectScale }
                  )
                );
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? { ...s, renderOverridesJson: next }
                      : s
                  )
                );
                schedule({ renderOverridesJson: next });
              }}
              onSubjectPositionChange={(subjectPosition) => {
                const next = serializeShotRenderOverrides(
                  mergeShotRenderOverrides(
                    parseShotRenderOverrides(selectedShot.renderOverridesJson),
                    { subjectPosition }
                  )
                );
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? { ...s, renderOverridesJson: next }
                      : s
                  )
                );
                schedule({ renderOverridesJson: next });
              }}
              onChange={(stillReferenceMode) => {
                const next = serializeShotRenderOverrides(
                  mergeShotRenderOverrides(
                    parseShotRenderOverrides(selectedShot.renderOverridesJson),
                    { stillReferenceMode }
                  )
                );
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? { ...s, renderOverridesJson: next }
                      : s
                  )
                );
                schedule({ renderOverridesJson: next });
              }}
              onIdentityStrengthChange={(identityStrength) => {
                const next = serializeShotRenderOverrides(
                  mergeShotRenderOverrides(
                    parseShotRenderOverrides(selectedShot.renderOverridesJson),
                    { identityStrength }
                  )
                );
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? { ...s, renderOverridesJson: next }
                      : s
                  )
                );
                schedule({ renderOverridesJson: next });
              }}
            />
            <ShotReferenceInfoPanel
              usesReferenceMedia={shotReferenceMeta.usesReferenceMedia}
              usesDualIpAdapter={shotReferenceMeta.usesDualIpAdapter}
              usesCharacterReference={shotReferenceMeta.usesCharacterReference}
              referenceMediaLabel={shotReferenceMeta.referenceMediaLabel}
              referenceMediaDetail={shotReferenceMeta.referenceDetail}
            />
          </Card>

          <Card className="mb-0 flex h-full flex-col space-y-0">
            <MediaPanel
              embedded
              projectId={projectId}
              entityType="shot"
              entityId={selectedShot.id}
              referencePath={selectedShot.placeholderPath}
              referenceKind={selectedShot.placeholderKind}
              mediaVersion={selectedShot.updatedAt}
              onMediaChange={(path, kind) => {
                const updatedAt = Date.now();
                setShots((prev) =>
                  prev.map((s) =>
                    s.id === selectedShotId
                      ? {
                          ...s,
                          placeholderPath: path,
                          placeholderKind: kind,
                          updatedAt,
                        }
                      : s
                  )
                );
                void loadAll();
              }}
            />
            <ShotPlaceholderControls
              projectId={projectId}
              visualStyleJson={visualStyleJson}
              usesReferenceMedia={
                shotReferenceMeta.availableReferenceModes.length > 1 ||
                shotReferenceMeta.usesReferenceMedia
              }
              usesDualIpAdapter={shotReferenceMeta.usesDualIpAdapter}
            />
          </Card>
          </div>

          <ShotPlaceholderOptionsPanel projectId={projectId} />
        </ShotPlaceholderBatchProvider>
      ) : (
        <Card className="text-center text-muted-foreground">
          Select a shot on the timeline to edit.
        </Card>
      )}
    </div>
  );
}

function ShotTextFields({
  shotId,
  title,
  prompt,
  durationFrames,
  onFieldsChange,
  onSave,
  locationField,
}: {
  shotId: string;
  title: string;
  prompt: string;
  durationFrames: number;
  onFieldsChange: (fields: {
    title: string;
    prompt: string;
    durationFrames: number;
  }) => void;
  onSave: (patch: Partial<StoryboardShot>) => void;
  locationField: ReactNode;
}) {
  const fieldSource = useMemo(
    () => ({
      title,
      prompt,
      durationFrames: String(durationFrames),
    }),
    [shotId, title, prompt, durationFrames]
  );
  const { bind } = useSyncedEditableFields(fieldSource, shotId);

  function emit(next: {
    title: string;
    prompt: string;
    durationFrames: string;
  }) {
    const duration = Math.max(1, Number(next.durationFrames) || 1);
    onFieldsChange({
      title: next.title,
      prompt: next.prompt,
      durationFrames: duration,
    });
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="shot-title">Title</Label>
        <Input
          id="shot-title"
          {...bind("title", (next) => {
            emit(next);
            onSave({ title: next.title });
          })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="shot-prompt">Prompt</Label>
        <Textarea
          id="shot-prompt"
          {...bind("prompt", (next) => {
            emit(next);
            onSave({ prompt: next.prompt });
          })}
          className="min-h-[120px]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shot-frames">Duration (frames)</Label>
          <Input
            id="shot-frames"
            type="number"
            min={1}
            {...bind("durationFrames", (next) => {
              emit(next);
              onSave({
                durationFrames: Math.max(1, Number(next.durationFrames) || 1),
              });
            })}
          />
        </div>
        {locationField}
      </div>
    </>
  );
}
