import WebSocket from "ws";
import { normalizeUrl } from "@/lib/services/comfyui-client";

export type ComfyUIWsUpdate =
  | {
      type: "executing";
      promptId: string;
      nodeId: string | null;
    }
  | {
      type: "progress";
      promptId: string;
      nodeId: string;
      value: number;
      max: number;
    }
  | {
      type: "execution_error";
      promptId: string;
      nodeId?: string;
      message: string;
    }
  | {
      type: "status";
      promptId?: string;
      message: string;
    };

export interface ComfyUIWsBridgeOptions {
  baseUrl: string;
  clientId: string;
  onUpdate: (update: ComfyUIWsUpdate) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export class ComfyUIWsBridge {
  private ws: WebSocket | null = null;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly onUpdate: (update: ComfyUIWsUpdate) => void;
  private readonly onError?: (error: Error) => void;
  private readonly onClose?: () => void;
  private closed = false;

  constructor(options: ComfyUIWsBridgeOptions) {
    this.baseUrl = options.baseUrl;
    this.clientId = options.clientId;
    this.onUpdate = options.onUpdate;
    this.onError = options.onError;
    this.onClose = options.onClose;
  }

  connect(): Promise<void> {
    if (this.ws) return Promise.resolve();

    const wsUrl = `${normalizeUrl(this.baseUrl)
      .replace(/^http/i, "ws")}/ws?clientId=${encodeURIComponent(this.clientId)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.on("open", () => resolve());
      ws.on("error", (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.onError?.(error);
        reject(error);
      });
      ws.on("close", () => {
        this.ws = null;
        if (!this.closed) this.onClose?.();
      });
      ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });
    });
  }

  private handleMessage(raw: string): void {
    let parsed: { type?: string; data?: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
    } catch {
      return;
    }

    const type = parsed.type;
    const data = parsed.data ?? {};

    if (type === "executing") {
      this.onUpdate({
        type: "executing",
        promptId: String(data.prompt_id ?? ""),
        nodeId: data.node == null ? null : String(data.node),
      });
      return;
    }

    if (type === "progress") {
      this.onUpdate({
        type: "progress",
        promptId: String(data.prompt_id ?? ""),
        nodeId: String(data.node ?? ""),
        value: Number(data.value ?? 0),
        max: Number(data.max ?? 0),
      });
      return;
    }

    if (type === "execution_error") {
      this.onUpdate({
        type: "execution_error",
        promptId: String(data.prompt_id ?? ""),
        nodeId: data.node_id != null ? String(data.node_id) : undefined,
        message: String(
          data.exception_message ??
            data.message ??
            "ComfyUI execution error"
        ),
      });
      return;
    }

    if (type === "status") {
      const execInfo = data.status as
        | { exec_info?: { queue_remaining?: number } }
        | undefined;
      const remaining = execInfo?.exec_info?.queue_remaining;
      this.onUpdate({
        type: "status",
        message:
          remaining != null
            ? `Queue remaining: ${remaining}`
            : "Status update",
      });
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getClientId(): string {
    return this.clientId;
  }
}
