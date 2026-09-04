"use client";

import type { LocationAngle, LocationState } from "@/lib/db/schema";
import { Label, Select } from "@/components/ui/button";

type LocationStateWithAngles = LocationState & { angles: LocationAngle[] };

export function ShotLocationRefEditor({
  locationStates,
  locationStateId,
  locationAngleId,
  onStateChange,
  onAngleChange,
}: {
  locationStates: LocationStateWithAngles[];
  locationStateId: string | null;
  locationAngleId: string | null;
  onStateChange: (stateId: string | null) => void;
  onAngleChange: (angleId: string | null) => void;
}) {
  const selectedState =
    locationStates.find((state) => state.id === locationStateId) ??
    locationStates[0] ??
    null;
  const angles = selectedState?.angles ?? [];
  const selectedAngle =
    angles.find((angle) => angle.id === locationAngleId) ?? angles[0] ?? null;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="shot-location-state">Location state</Label>
          <Select
            id="shot-location-state"
            value={selectedState?.id ?? ""}
            onChange={(e) => {
              const nextStateId = e.target.value || null;
              onStateChange(nextStateId);
              const nextState = locationStates.find(
                (state) => state.id === nextStateId
              );
              const nextAngle =
                nextState?.angles.find((angle) => angle.referencePath) ??
                nextState?.angles[0] ??
                null;
              onAngleChange(nextAngle?.id ?? null);
            }}
          >
            {locationStates.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shot-location-angle">Camera angle</Label>
          <Select
            id="shot-location-angle"
            value={selectedAngle?.id ?? ""}
            onChange={(e) => onAngleChange(e.target.value || null)}
            disabled={angles.length === 0}
          >
            {angles.map((angle) => (
              <option key={angle.id} value={angle.id}>
                {angle.name}
                {angle.referencePath ? "" : " (no reference yet)"}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
