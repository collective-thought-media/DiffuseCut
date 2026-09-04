import { jsonOk, handleApiError } from "@/lib/api-helpers";
import { checkAllDependencies } from "@/lib/services/dependency-checker";

export async function GET() {
  try {
    const dependencies = await checkAllDependencies();
    return jsonOk({ dependencies });
  } catch (err) {
    return handleApiError(err);
  }
}
