export function formatComfyuiError(raw: string): string {
  if (!raw.trim()) return "ComfyUI request failed";

  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) {
    return truncate(raw);
  }

  try {
    const payload = JSON.parse(raw.slice(jsonStart)) as {
      error?: { type?: string; message?: string };
      node_errors?: Record<
        string,
        {
          errors?: {
            type?: string;
            message?: string;
            details?: string;
            input_name?: string;
            received_value?: string;
            extra_info?: {
              input_name?: string;
              received_value?: string;
              input_config?: unknown[];
            };
          }[];
        }
      >;
    };

    const nodeErrors = payload.node_errors;
    if (nodeErrors) {
      for (const nodeError of Object.values(nodeErrors)) {
        for (const item of nodeError.errors ?? []) {
          const inputName =
            item.input_name ?? item.extra_info?.input_name ?? "input";
          const received =
            item.received_value ?? item.extra_info?.received_value ?? "unknown";

          if (item.type === "value_not_in_list" && inputName === "ckpt_name") {
            const available = extractStringList(item.extra_info?.input_config?.[0]);
            const preview = available.slice(0, 4).join(", ");
            const suffix =
              available.length > 4
                ? ` (+${available.length - 4} more on ComfyUI)`
                : "";
            return `Checkpoint "${received}" is not installed on ComfyUI. Pick one of: ${preview}${suffix}. Update generation defaults on this page or in Render settings.`;
          }

          if (item.type === "value_not_in_list") {
            return `ComfyUI rejected ${inputName}: "${received}" is not available on the server.`;
          }

          if (
            inputName === "image" &&
            typeof item.message === "string" &&
            item.message.includes("Invalid image file")
          ) {
            return `ComfyUI could not load the establishing reference image (${received}). DiffuseCut will retry the upload automatically; if this keeps happening, regenerate once more or restart ComfyUI.`;
          }

          if (item.message) return item.message;
        }
      }
    }

    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    /* fall through */
  }

  return truncate(raw);
}

function extractStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function truncate(text: string, max = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}
