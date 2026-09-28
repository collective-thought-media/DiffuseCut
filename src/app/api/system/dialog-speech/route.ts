import { jsonOk, handleApiError } from "@/lib/api-helpers";
import { getDialogSpeechSourceStatus } from "@/lib/services/score-audio-source";

export async function GET() {
  try {
    const status = await getDialogSpeechSourceStatus();
    return jsonOk({ dialogSpeech: status });
  } catch (err) {
    return handleApiError(err);
  }
}
