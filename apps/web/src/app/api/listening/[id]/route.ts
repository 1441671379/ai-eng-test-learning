import { NextResponse } from "next/server";
import { listeningUser, listeningError } from "@/lib/listening-api";
import { readListening } from "@/lib/listening-store";
import { publicListening } from "@/lib/listening";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  try { return NextResponse.json({ lesson: publicListening(await readListening(userId, (await context.params).id)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return listeningError(error); }
}
