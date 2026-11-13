import { NextResponse } from "next/server";
import { readingUser, readingError } from "@/lib/reading-api";
import { readReading } from "@/lib/reading-store";
import { publicReading } from "@/lib/reading";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try { const { id } = await context.params; return NextResponse.json({ lesson: publicReading(await readReading(userId, id)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return readingError(error); }
}
