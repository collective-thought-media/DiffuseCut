"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-foreground hover:bg-neutral-800"
      >
        Close
      </button>

      <div
        className="absolute inset-0 flex items-center justify-center p-4 pt-14"
        onClick={onClose}
      >
        <img
          src={src}
          alt={alt}
          className="block max-h-[calc(100dvh-4.5rem)] max-w-[calc(100vw-2rem)] object-contain"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>,
    document.body
  );
}
