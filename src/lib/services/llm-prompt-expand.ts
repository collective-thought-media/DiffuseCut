import { getSetting } from "@/lib/services/settings";
import {
  DEFAULT_VISUAL_STYLE,
  getCharacterSheetLayoutMode,
  getVisualStyleDefinition,
  type VisualStyle,
} from "@/lib/services/visual-style";

export type LlmPromptExpandMode =
  | "character_sheet"
  | "location_reference"
  | "shot";

function buildSystemPrompt(
  style: VisualStyle,
  mode: LlmPromptExpandMode,
  backdropMode?: boolean
): string {
  const def = getVisualStyleDefinition(style);

  if (mode === "shot") {
    return `You refine ComfyUI positive prompts for a single cinematic storyboard film still. Output ONE camera angle in ONE environment frame. Preserve the location, weather, and camera direction from the draft. Do NOT describe a character turnaround sheet, model sheet, figurine, product photo, or gray studio backdrop. Do NOT include front view and back view in the same image. Output only the prompt text, no quotes or explanation.`;
  }

  if (mode === "location_reference") {
    if (backdropMode) {
      return `You expand backdrop descriptions into ComfyUI positive prompts for an in-camera seamless backdrop plate. Describe ONLY the smooth background surface the camera sees filling the frame edge to edge. Do NOT describe studio equipment, light stands, softboxes, c-stands, ceiling rigs, or behind-the-scenes setup. Do NOT describe architecture or a room. Output only the prompt text, no quotes or explanation.`;
    }
    return `You expand location descriptions into detailed ComfyUI positive prompts for ${def.locationReferenceTheme}. Focus on architecture, materials, lighting, and atmosphere. Do NOT describe photography studio equipment or behind-the-scenes setup unless the location IS a visible studio interior. Output only the prompt text, no quotes or explanation.`;
  }

  const hint = def.llmCharacterSheetHint;
  if (getCharacterSheetLayoutMode(style) === "casting_portrait") {
    return `You expand brief character descriptions into detailed ComfyUI positive prompts for generating ${hint}. Focus on wardrobe, hair, age, build, and natural skin. The output MUST describe ONE person in ONE front-facing three-quarter casting photo, full body head to toe, single subject only. Do NOT describe turnaround sheets, multiple views, front and back in one image, profile collages, or gray mannequin reference layouts. Output only the prompt text, no quotes or explanation.`;
  }
  return `You expand brief character descriptions into detailed ComfyUI positive prompts for generating ${hint}. Focus on costume, anatomy, colors, materials, and distinctive features. The output MUST describe a turnaround model sheet on one wide image with front view, back view, left profile, and right profile in one row, full body head to toe, wings and accessories fully visible, neutral pose, flat neutral background. Do NOT write cinematic portrait, hero shot, close-up, or single-pose language. Output only the prompt text, no quotes or explanation.`;
}

function buildUserMessage(input: {
  name: string;
  userDescription: string;
  templatePrompt?: string;
  mode: LlmPromptExpandMode;
}): string {
  if (input.mode === "shot" && input.templatePrompt?.trim()) {
    return `Shot title: ${input.name}\nDraft prompt:\n${input.templatePrompt.trim()}`;
  }

  if (input.mode === "location_reference" && input.templatePrompt?.trim()) {
    return `Location: ${input.name}\nDraft prompt:\n${input.templatePrompt.trim()}`;
  }

  return `Character name: ${input.name}\nDescription: ${input.userDescription}`;
}

export async function expandPromptWithLlm(input: {
  name: string;
  userDescription: string;
  templatePrompt?: string;
  visualStyle?: VisualStyle;
  mode?: LlmPromptExpandMode;
  backdropMode?: boolean;
}): Promise<{ prompt: string; usedLlm: boolean }> {
  const visualStyle = input.visualStyle ?? DEFAULT_VISUAL_STYLE;
  const mode = input.mode ?? "character_sheet";
  const systemPrompt = buildSystemPrompt(visualStyle, mode, input.backdropMode);

  const enabled = (await getSetting("llm_prompt_expand_enabled")) === "true";
  if (!enabled) {
    return {
      prompt: input.templatePrompt?.trim() || input.userDescription,
      usedLlm: false,
    };
  }

  const provider = (await getSetting("llm_provider")) ?? "none";
  if (provider === "none") {
    return {
      prompt: input.templatePrompt?.trim() || input.userDescription,
      usedLlm: false,
    };
  }

  const userMessage = buildUserMessage({
    name: input.name,
    userDescription: input.userDescription,
    templatePrompt: input.templatePrompt,
    mode,
  });

  try {
    if (provider === "ollama") {
      const apiUrl =
        (await getSetting("llm_api_url")) ?? "http://127.0.0.1:11434";
      const model = (await getSetting("llm_model")) ?? "llama3.2";
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: `${systemPrompt}\n\n${userMessage}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { response?: string };
      const text = data.response?.trim();
      if (!text) throw new Error("Empty LLM response");
      return { prompt: text, usedLlm: true };
    }

    if (provider === "openai") {
      const apiKey = await getSetting("llm_api_key");
      if (!apiKey) throw new Error("OpenAI API key not configured");
      const model = (await getSetting("llm_model")) ?? "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty LLM response");
      return { prompt: text, usedLlm: true };
    }
  } catch {
    /* fallback below */
  }

  return {
    prompt: input.templatePrompt?.trim() || input.userDescription,
    usedLlm: false,
  };
}
