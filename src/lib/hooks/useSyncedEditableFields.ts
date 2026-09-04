"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

type StringFields = Record<string, string>;

type FieldBinding = {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
};

/**
 * Local form state that syncs from server props without clobbering in-progress edits.
 * Skips prop→local sync for focused fields and when switching entity (by entityKey).
 */
export function useSyncedEditableFields<T extends StringFields>(
  source: T,
  entityKey: string
): {
  fields: T;
  bind: (
    key: keyof T & string,
    onFieldsChange?: (next: T) => void
  ) => FieldBinding;
} {
  const [fields, setFields] = useState<T>(source);
  const focusedKeysRef = useRef(new Set<keyof T & string>());
  const entityKeyRef = useRef(entityKey);

  useEffect(() => {
    if (entityKeyRef.current !== entityKey) {
      entityKeyRef.current = entityKey;
      focusedKeysRef.current.clear();
      setFields(source);
      return;
    }

    setFields((prev) => {
      let next: T | null = null;
      for (const key of Object.keys(source) as (keyof T & string)[]) {
        if (focusedKeysRef.current.has(key)) continue;
        if (prev[key] !== source[key]) {
          if (!next) next = { ...prev };
          next[key] = source[key];
        }
      }
      return next ?? prev;
    });
  }, [source, entityKey]);

  const bind = useCallback(
    (key: keyof T & string, onFieldsChange?: (next: T) => void): FieldBinding => ({
      value: fields[key],
      onChange: (event) => {
        const value = event.target.value;
        setFields((prev) => {
          const next = { ...prev, [key]: value };
          onFieldsChange?.(next);
          return next;
        });
      },
      onFocus: () => {
        focusedKeysRef.current.add(key);
      },
      onBlur: () => {
        focusedKeysRef.current.delete(key);
      },
    }),
    [fields]
  );

  return { fields, bind };
}
