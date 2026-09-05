import type { NextRequest } from "next/server";
import { getCharacterSheetBatchView } from "@/lib/services/asset-generation-queue";

const POLL_INTERVAL_MS = 1000;

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { characterId, stateId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = () => {
        if (closed) return;
        const view = getCharacterSheetBatchView(characterId, stateId);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(view)}\n\n`)
        );
      };

      send();
      const interval = setInterval(send, POLL_INTERVAL_MS);

      _req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
