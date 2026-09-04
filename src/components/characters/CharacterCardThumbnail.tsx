"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character, CharacterState } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";

const DISPLAY_MS = 5000;
const FADE_MS = 1000;

interface CharacterCardThumbnailProps {
  projectId: string;
  characterName: string;
  states?: CharacterState[];
  previewItems?: Array<{
    referencePath: string | null;
    referenceKind?: string | null;
  }>;
  variantCount?: number;
  /** When true, crossfade whenever multiple preview sources exist (e.g. location angles). */
  animateMultipleSources?: boolean;
  fallbackReferencePath?: string | null;
  variantLabel?: string;
  aspectClassName?: string;
}

function resolveImageSourcesFromItems(
  projectId: string,
  items: Array<{
    referencePath: string | null;
    referenceKind?: string | null;
  }>,
  fallbackReferencePath?: string | null
): string[] {
  const fromItems = items
    .filter((item) => item.referencePath && item.referenceKind !== "video")
    .map((item) => mediaUrl(projectId, item.referencePath!));

  if (fromItems.length > 0) return fromItems;

  if (fallbackReferencePath) {
    return [mediaUrl(projectId, fallbackReferencePath)];
  }

  return [];
}

function resolveImageSources(
  projectId: string,
  states: CharacterState[],
  fallbackReferencePath?: string | null
): string[] {
  const fromStates = states
    .filter((state) => state.referencePath && state.referenceKind !== "video")
    .map((state) => mediaUrl(projectId, state.referencePath!));

  if (fromStates.length > 0) return fromStates;

  if (fallbackReferencePath) {
    return [mediaUrl(projectId, fallbackReferencePath)];
  }

  return [];
}

function CharacterThumbnailPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 text-2xl font-semibold text-muted-foreground">
        {initial}
      </div>
      <p className="mt-3 px-4 text-center text-xs text-white/40">No reference yet</p>
    </div>
  );
}

function CharacterThumbnailImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover object-top"
      draggable={false}
    />
  );
}

function CharacterStateSlideshow({
  sources,
  alt,
}: {
  sources: string[];
  alt: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const upcoming = (activeIndex + 1) % sources.length;
    const preload = new window.Image();
    preload.src = sources[upcoming]!;
  }, [activeIndex, sources]);

  useEffect(() => {
    if (sources.length <= 1) return;

    const displayTimer = window.setTimeout(() => {
      const upcoming = (activeIndex + 1) % sources.length;
      setNextIndex(upcoming);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsFading(true);
        });
      });
    }, DISPLAY_MS);

    return () => window.clearTimeout(displayTimer);
  }, [activeIndex, sources]);

  useEffect(() => {
    if (nextIndex === null || !isFading) return;

    const fadeTimer = window.setTimeout(() => {
      setActiveIndex(nextIndex);
      setNextIndex(null);
      setIsFading(false);
    }, FADE_MS);

    return () => window.clearTimeout(fadeTimer);
  }, [nextIndex, isFading]);

  const fadeTransition = "transition-opacity duration-1000 ease-in-out";

  return (
    <>
      <img
        src={sources[activeIndex]}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-cover object-top ${
          nextIndex !== null && isFading
            ? `${fadeTransition} opacity-0`
            : "opacity-100"
        }`}
        draggable={false}
      />
      {nextIndex !== null && (
        <img
          src={sources[nextIndex]}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover object-top ${
            isFading ? `${fadeTransition} opacity-100` : "opacity-0"
          }`}
          draggable={false}
        />
      )}
    </>
  );
}

export function CharacterCardThumbnail({
  projectId,
  characterName,
  states = [],
  previewItems,
  variantCount,
  animateMultipleSources = false,
  fallbackReferencePath,
  variantLabel = "looks",
  aspectClassName = "aspect-square",
}: CharacterCardThumbnailProps) {
  const sources = useMemo(() => {
    if (previewItems) {
      return resolveImageSourcesFromItems(
        projectId,
        previewItems,
        fallbackReferencePath
      );
    }
    return resolveImageSources(projectId, states, fallbackReferencePath);
  }, [projectId, states, previewItems, fallbackReferencePath]);

  const totalVariants = variantCount ?? states.length;
  const shouldAnimate =
    sources.length > 1 &&
    (animateMultipleSources ? true : totalVariants > 1);

  return (
    <div
      className={`relative w-full overflow-hidden bg-zinc-950 ${aspectClassName}`}
    >
      {sources.length === 0 ? (
        <CharacterThumbnailPlaceholder name={characterName} />
      ) : shouldAnimate ? (
        <CharacterStateSlideshow sources={sources} alt={characterName} />
      ) : (
        <CharacterThumbnailImage src={sources[0]!} alt={characterName} />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />

      {totalVariants > 1 && sources.length > 0 && (
        <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80 backdrop-blur-sm">
          {totalVariants} {variantLabel}
        </div>
      )}
    </div>
  );
}

export type CharacterWithStates = Character & { states: CharacterState[] };

export function getCharacterPreviewSources(
  projectId: string,
  character: CharacterWithStates
): string[] {
  return resolveImageSources(
    projectId,
    character.states,
    character.referencePath
  );
}
