"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  Character,
  CharacterState,
  Location,
  LocationAngle,
  LocationState,
} from "@/lib/db/schema";
import { Button, Card, Input, Label, Select } from "@/components/ui/button";

type CharacterWithStates = Character & { states: CharacterState[] };
type LocationWithStates = Location & {
  states: Array<LocationState & { angles: LocationAngle[] }>;
};

interface InterviewMonologuePlannerProps {
  projectId: string;
  fps: number;
  characters: CharacterWithStates[];
  locations: LocationWithStates[];
  onPlanned: () => void | Promise<void>;
}

function defaultLocationRef(location: LocationWithStates) {
  const state = location.states[0];
  if (!state) {
    return { locationStateId: "", locationAngleId: "" };
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
    locationAngleId: angle?.id ?? "",
  };
}

export function InterviewMonologuePlanner({
  projectId,
  fps,
  characters,
  locations,
  onPlanned,
}: InterviewMonologuePlannerProps) {
  const [characterId, setCharacterId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [cameraAStateId, setCameraAStateId] = useState("");
  const [cameraBStateId, setCameraBStateId] = useState("");
  const [segmentSec, setSegmentSec] = useState("6");
  const [firstCamera, setFirstCamera] = useState<"A" | "B">("A");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // Collapsed by default: only interview / talking-head projects need this.
  const [expanded, setExpanded] = useState(false);

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === characterId) ?? null,
    [characters, characterId]
  );
  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === locationId) ?? null,
    [locations, locationId]
  );

  const states = selectedCharacter?.states ?? [];

  async function handlePlan() {
    setLocalError(null);
    setMessage(null);
    if (!characterId || !locationId || !cameraAStateId || !cameraBStateId) {
      setLocalError("Pick spokesperson, location, and both camera states.");
      return;
    }
    if (cameraAStateId === cameraBStateId) {
      setLocalError("Camera A and Camera B must be different states.");
      return;
    }

    const locRef = selectedLocation
      ? defaultLocationRef(selectedLocation)
      : { locationStateId: "", locationAngleId: "" };

    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/shots/plan-interview-monologue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            locationId,
            cameraAStateId,
            cameraBStateId,
            defaultLocationStateId: locRef.locationStateId || null,
            defaultLocationAngleId: locRef.locationAngleId || null,
            segmentDurationSec: Number(segmentSec) || 6,
            firstCamera,
            replaceExistingShots: replaceExisting,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not plan interview cuts");
      }
      const plan = data.plan as {
        shotsCreated: number;
        totalFrames: number;
        segmentDurationSec: number;
      };
      const minutes = (plan.totalFrames / fps / 60).toFixed(1);
      setMessage(
        `Created ${plan.shotsCreated} alternating shots (~${minutes} min at ${fps} fps, ${plan.segmentDurationSec}s per take). Next: generate integrate stills per shot, then Finishing lip sync for the full dialog bed.`
      );
      await onPlanned();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not plan interview cuts"
      );
    } finally {
      setBusy(false);
    }
  }

  if (characters.length === 0 || locations.length === 0) {
    return null;
  }

  return (
    <Card className="space-y-4 p-4">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <h2 className="font-medium">Interview monologue planner</h2>
          {!expanded && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Talking-head A/B takes for long lip-sync scripts. Expand when you
              need it.
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <>
          <p className="text-sm text-muted-foreground">
            Long lip-sync scripts split into many takes. Each segment
            alternates camera A and camera B so you never cut same angle to
            same angle. One segment equals one LTX lip sync render.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="interview-character">Spokesperson</Label>
              <Select
                id="interview-character"
                value={characterId}
                onChange={(e) => {
                  setCharacterId(e.target.value);
                  setCameraAStateId("");
                  setCameraBStateId("");
                }}
              >
                <option value="">Select character</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="interview-location">Studio location</Label>
              <Select
                id="interview-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">Select location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="interview-segment-sec">Seconds per take</Label>
              <Input
                id="interview-segment-sec"
                type="number"
                min={2}
                max={10}
                step={0.5}
                value={segmentSec}
                onChange={(e) => setSegmentSec(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="interview-cam-a">Camera A state</Label>
              <Select
                id="interview-cam-a"
                value={cameraAStateId}
                onChange={(e) => setCameraAStateId(e.target.value)}
                disabled={!selectedCharacter}
              >
                <option value="">Select state (medium / wide)</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="interview-cam-b">Camera B state</Label>
              <Select
                id="interview-cam-b"
                value={cameraBStateId}
                onChange={(e) => setCameraBStateId(e.target.value)}
                disabled={!selectedCharacter}
              >
                <option value="">Select state (close / portrait)</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="interview-first-cam">First take</Label>
              <Select
                id="interview-first-cam"
                value={firstCamera}
                onChange={(e) => setFirstCamera(e.target.value as "A" | "B")}
              >
                <option value="A">Camera A</option>
                <option value="B">Camera B</option>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            Replace existing storyboard shots before planning
          </label>

          {localError && (
            <p className="text-sm text-red-400" role="alert">
              {localError}
            </p>
          )}
          {message && <p className="text-sm text-emerald-400">{message}</p>}

          <Button
            type="button"
            disabled={busy}
            onClick={() => void handlePlan()}
          >
            {busy ? "Planning cuts…" : "Plan interview monologue shots"}
          </Button>
        </>
      )}
    </Card>
  );
}
