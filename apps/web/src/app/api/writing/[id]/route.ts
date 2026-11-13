import { writingUser, writingJson, writingError } from "@/lib/writing-api";
import { readWriting } from "@/lib/writing-store";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await writingUser(request); if (typeof user !== "string") return user;
  try { return writingJson({ document: await readWriting(user, (await context.params).id) }); } catch (error) { return writingError(error); }
}
