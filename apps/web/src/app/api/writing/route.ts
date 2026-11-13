import { writingUser, writingBody, writingJson, writingError } from "@/lib/writing-api";
import { listWritings, saveWriting } from "@/lib/writing-store";
import { validateWritingInput } from "@/lib/writing";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const user = await writingUser(request); if (typeof user !== "string") return user;
  try { return writingJson({ documents: await listWritings(user) }); } catch (error) { return writingError(error); }
}
export async function POST(request: Request) {
  const user = await writingUser(request); if (typeof user !== "string") return user;
  try { const body = await writingBody(request); return writingJson({ document: await saveWriting(user, body.id, body.expectedRevision, validateWritingInput(body)) }); } catch (error) { return writingError(error); }
}
