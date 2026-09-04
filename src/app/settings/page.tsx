"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WorkflowTemplate } from "@/lib/db/schema";
import type { DependencyStatus } from "@/types";
import { DependencyChecklist } from "@/components/setup/DependencyChecklist";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/button";

interface AppSettings {
  appDataDir: string | null;
  ffmpegPath: string | null;
  comfyuiEndpoints: string[];
  defaultCharacterSheetTemplateId: string | null;
  builtinCharacterSheetTemplateId: string;
  llmPromptExpandEnabled: boolean;
  llmProvider: string;
  llmApiUrl: string;
  llmModel: string;
  llmApiKeySet: boolean;
  musicApiKeySet: boolean;
  scoreAudioProvider: string;
  aceStepInstallDir: string;
  aceStepComputeMode: "local" | "remote";
  aceStepRemoteUrl: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [deps, setDeps] = useState<DependencyStatus[]>([]);
  const [sheetTemplates, setSheetTemplates] = useState<WorkflowTemplate[]>([]);
  const [ffmpegPath, setFfmpegPath] = useState("");
  const [endpointsJson, setEndpointsJson] = useState("[]");
  const [characterSheetTemplateId, setCharacterSheetTemplateId] = useState("");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmProvider, setLlmProvider] = useState("none");
  const [llmApiUrl, setLlmApiUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [musicApiKey, setMusicApiKey] = useState("");
  const [scoreAudioProvider, setScoreAudioProvider] = useState("auto");
  const [aceStepInstallDir, setAceStepInstallDir] = useState("");
  const [aceStepComputeMode, setAceStepComputeMode] = useState<"local" | "remote">("local");
  const [aceStepRemoteUrl, setAceStepRemoteUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [importPurpose, setImportPurpose] = useState<
    "shot_video" | "character_sheet" | "location_sheet"
  >("shot_video");
  const [importWorkflowJson, setImportWorkflowJson] = useState("");
  const [importBindingsJson, setImportBindingsJson] = useState("{}");
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const refreshDependencies = useCallback(async () => {
    try {
      const depsRes = await fetch("/api/system/dependencies/recheck", {
        method: "POST",
      });
      const depsData = await depsRes.json();
      if (depsRes.ok) {
        setDeps(depsData.dependencies ?? []);
      }
    } catch {
      /* keep existing checklist if recheck fails */
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, depsRes, templatesRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/system/dependencies"),
        fetch("/api/workflow-templates?purpose=character_sheet"),
      ]);
      const settingsData = await settingsRes.json();
      const depsData = await depsRes.json();
      const templatesData = await templatesRes.json();
      if (!settingsRes.ok) {
        throw new Error(settingsData.error ?? "Failed to load settings");
      }
      if (!depsRes.ok) {
        throw new Error(depsData.error ?? "Failed to load dependencies");
      }
      const s = settingsData.settings as AppSettings;
      setSettings(s);
      setFfmpegPath(s.ffmpegPath ?? "");
      setEndpointsJson(JSON.stringify(s.comfyuiEndpoints ?? [], null, 2));
      setCharacterSheetTemplateId(s.defaultCharacterSheetTemplateId ?? "");
      setLlmEnabled(s.llmPromptExpandEnabled ?? false);
      setLlmProvider(s.llmProvider ?? "none");
      setLlmApiUrl(s.llmApiUrl ?? "");
      setLlmModel(s.llmModel ?? "");
      setScoreAudioProvider(s.scoreAudioProvider ?? "auto");
      setAceStepInstallDir(s.aceStepInstallDir ?? "");
      setAceStepComputeMode(s.aceStepComputeMode === "remote" ? "remote" : "local");
      setAceStepRemoteUrl(s.aceStepRemoteUrl ?? "");
      setDeps(depsData.dependencies ?? []);
      if (templatesRes.ok) {
        setSheetTemplates(templatesData.templates ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      JSON.parse(endpointsJson);
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ffmpegPath: ffmpegPath || null,
          defaultComfyuiEndpointsJson: endpointsJson,
          defaultCharacterSheetTemplateId: characterSheetTemplateId || null,
          llmPromptExpandEnabled: llmEnabled,
          llmProvider: llmProvider as "openai" | "ollama" | "none",
          llmApiUrl: llmApiUrl || null,
          llmModel: llmModel || null,
          llmApiKey: llmApiKey || undefined,
          musicApiKey: musicApiKey || undefined,
          scoreAudioProvider: scoreAudioProvider as
            | "auto"
            | "ace_step"
            | "elevenlabs"
            | "upload",
          aceStepInstallDir: aceStepInstallDir || null,
          aceStepComputeMode,
          aceStepRemoteUrl: aceStepRemoteUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      setLlmApiKey("");
      setMusicApiKey("");
      await refreshDependencies();
      setSaveMessage("Settings saved.");
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("ComfyUI endpoints must be valid JSON");
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleImportTemplate(e: React.FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setSaveMessage(null);
    try {
      JSON.parse(importWorkflowJson);
      JSON.parse(importBindingsJson);
      const res = await fetch("/api/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importName,
          workflowJson: importWorkflowJson,
          bindingsJson: importBindingsJson,
          purpose: importPurpose,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setSaveMessage(`Imported template "${data.template.name}".`);
      setImportName("");
      setImportWorkflowJson("");
      setImportBindingsJson("{}");
      await loadAll();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Workflow or bindings JSON is invalid");
      } else {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    } finally {
      setImporting(false);
    }
  }

  async function copyDiagnosticReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      settings: settings ?? {
        appDataDir: null,
        ffmpegPath,
        comfyuiEndpoints: [],
      },
      dependencies: deps,
    };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">App Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          App-wide defaults for FFmpeg, ComfyUI, character sheets, and optional
          LLM prompt expansion.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">System Health</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshDependencies()}
          >
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Core items must be ready to use DiffuseCut. Video engines, IP-Adapter,
          and ACE-Step show as optional until you install them for that workflow.
        </p>
        <DependencyChecklist deps={deps} />
      </section>

      <Card>
        <form onSubmit={handleSave} className="space-y-5">
          <h2 className="font-medium">Paths & Endpoints</h2>

          {settings?.appDataDir && (
            <div className="space-y-1.5">
              <Label>App data directory</Label>
              <p className="rounded-lg bg-neutral-950 px-3 py-2 text-sm text-muted-foreground">
                {settings.appDataDir}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ffmpeg-path">FFmpeg path (optional override)</Label>
            <Input
              id="ffmpeg-path"
              value={ffmpegPath}
              onChange={(e) => setFfmpegPath(e.target.value)}
              placeholder="Leave empty to use PATH"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comfyui-endpoints">
              Default ComfyUI endpoints (JSON array)
            </Label>
            <Textarea
              id="comfyui-endpoints"
              value={endpointsJson}
              onChange={(e) => setEndpointsJson(e.target.value)}
              className="min-h-[100px] font-mono text-xs"
              placeholder='["http://127.0.0.1:8188"]'
            />
            <p className="text-xs text-muted-foreground">
              Your ComfyUI server URL(s). Use localhost for a machine running
              ComfyUI on the same PC, or a LAN IP for a remote GPU box. Per-project
              overrides are available in project settings.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sheet-template">Character sheet workflow</Label>
            <Select
              id="sheet-template"
              value={characterSheetTemplateId}
              onChange={(e) => setCharacterSheetTemplateId(e.target.value)}
            >
              <option value="">Built-in default (recommended)</option>
              {sheetTemplates
                .filter((t) => t.id !== settings?.builtinCharacterSheetTemplateId)
                .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              A default txt2img turnaround workflow is included. Pick another
              template here only if you imported a custom character sheet
              workflow.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-medium">
              Optional: LLM Prompt Expansion
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={llmEnabled}
                onChange={(e) => setLlmEnabled(e.target.checked)}
              />
              Enable LLM prompt expansion for character sheets
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="llm-provider">Provider</Label>
              <Select
                id="llm-provider"
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
                disabled={!llmEnabled}
              >
                <option value="none">None</option>
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-api-url">API URL (Ollama)</Label>
              <Input
                id="llm-api-url"
                value={llmApiUrl}
                onChange={(e) => setLlmApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                disabled={!llmEnabled || llmProvider !== "ollama"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-model">Model</Label>
              <Input
                id="llm-model"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="llama3.2 or gpt-4o-mini"
                disabled={!llmEnabled || llmProvider === "none"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-api-key">
                API key (OpenAI){settings?.llmApiKeySet ? " (saved)" : ""}
              </Label>
              <Input
                id="llm-api-key"
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder="Leave blank to keep existing key"
                disabled={!llmEnabled || llmProvider !== "openai"}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-neutral-800 pt-4">
            <h3 className="text-sm font-medium">Musical score (optional)</h3>
            <p className="text-xs text-muted-foreground">
              Generate on Finishing via local or remote ACE-Step 1.5, ElevenLabs,
              or upload your own licensed score file.
            </p>
            {(() => {
              const aceDep = deps.find((d) => d.id === "comfyui_ace_step");
              if (!aceDep) return null;
              return (
                <p className="text-xs text-muted-foreground">
                  Local ACE-Step: {aceDep.message}
                </p>
              );
            })()}
            <div className="space-y-1.5">
              <Label htmlFor="score-audio-provider">Score generator</Label>
              <Select
                id="score-audio-provider"
                value={scoreAudioProvider}
                onChange={(e) => setScoreAudioProvider(e.target.value)}
              >
                <option value="auto">
                  Auto (ACE-Step, then ElevenLabs)
                </option>
                <option value="ace_step">ACE-Step 1.5</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="upload">Upload</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ace-step-compute-mode">ACE-Step compute</Label>
              <Select
                id="ace-step-compute-mode"
                value={aceStepComputeMode}
                onChange={(e) =>
                  setAceStepComputeMode(
                    e.target.value === "remote" ? "remote" : "local"
                  )
                }
              >
                <option value="local">This machine (local install)</option>
                <option value="remote">LAN GPU server (remote API)</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                ComfyUI endpoints below are for renders only. Score music uses
                ACE-Step separately, local or on another box on your network.
              </p>
            </div>
            {aceStepComputeMode === "local" ? (
              <div className="space-y-1.5">
                <Label htmlFor="ace-step-install-dir">
                  ACE-Step install folder (optional)
                </Label>
                <Input
                  id="ace-step-install-dir"
                  value={aceStepInstallDir}
                  onChange={(e) => setAceStepInstallDir(e.target.value)}
                  placeholder="%LOCALAPPDATA%\DiffuseCut\ace-step\ACE-Step-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for the default path. Install with
                  scripts/local-dev/install-ace-step-local.ps1
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="ace-step-remote-url">Remote ACE-Step API URL</Label>
                <Input
                  id="ace-step-remote-url"
                  value={aceStepRemoteUrl}
                  onChange={(e) => setAceStepRemoteUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8188"
                />
                <p className="text-xs text-muted-foreground">
                  Use your LAN ComfyUI URL (port 8188) when ACE-Step runs there.
                  Port 8002 only if you started the separate native API script.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="music-api-key">
                ElevenLabs API key (SFX fallback)
                {settings?.musicApiKeySet ? " (saved)" : ""}
              </Label>
              <Input
                id="music-api-key"
                type="password"
                value={musicApiKey}
                onChange={(e) => setMusicApiKey(e.target.value)}
                placeholder="Leave blank to keep existing key"
              />
              <p className="text-xs text-muted-foreground">
                Sound effects use ComfyUI-Woosh on your GPU Comfy server when
                installed. ElevenLabs is the cloud fallback. ACE-Step is score only.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          {saveMessage && (
            <p className="text-sm text-emerald-400">{saveMessage}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyDiagnosticReport()}
            >
              {copied ? "Copied!" : "Copy diagnostic report"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <form onSubmit={handleImportTemplate} className="space-y-4">
          <h2 className="font-medium">Import Workflow Template</h2>
          <p className="text-sm text-muted-foreground">
            Paste a ComfyUI API-format workflow JSON and bindings. Set purpose
            to character sheet for turnaround generation.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="import-name">Name</Label>
            <Input
              id="import-name"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-purpose">Purpose</Label>
            <Select
              id="import-purpose"
              value={importPurpose}
              onChange={(e) =>
                setImportPurpose(
                  e.target.value as
                    | "shot_video"
                    | "character_sheet"
                    | "location_sheet"
                )
              }
            >
              <option value="shot_video">Shot video (render)</option>
              <option value="character_sheet">Character sheet</option>
              <option value="location_sheet">Location sheet</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-workflow">Workflow JSON</Label>
            <Textarea
              id="import-workflow"
              value={importWorkflowJson}
              onChange={(e) => setImportWorkflowJson(e.target.value)}
              className="min-h-[120px] font-mono text-xs"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-bindings">Bindings JSON</Label>
            <Textarea
              id="import-bindings"
              value={importBindingsJson}
              onChange={(e) => setImportBindingsJson(e.target.value)}
              className="min-h-[80px] font-mono text-xs"
            />
          </div>
          <Button type="submit" disabled={importing}>
            {importing ? "Importing…" : "Import template"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
