import type { NextRequest } from "next/server";

import { getShotPlaceholderBatchView } from "@/lib/services/shot-asset-generation";



const POLL_INTERVAL_MS = 1000;



type RouteParams = {

  params: Promise<{ id: string; shotId: string }>;

};



export async function GET(req: NextRequest, { params }: RouteParams) {

  const { shotId } = await params;

  const batchId = req.nextUrl.searchParams.get("batchId");

  const encoder = new TextEncoder();



  const stream = new ReadableStream({

    start(controller) {

      let closed = false;



      const send = () => {

        if (closed) return;

        const view = getShotPlaceholderBatchView(shotId, batchId);

        controller.enqueue(

          encoder.encode(`data: ${JSON.stringify(view)}\n\n`)

        );

      };



      send();

      const interval = setInterval(send, POLL_INTERVAL_MS);



      req.signal.addEventListener("abort", () => {

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

