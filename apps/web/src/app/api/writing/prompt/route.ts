import { writingUser, writingBody, writingJson, writingError, writingModel } from "@/lib/writing-api";
import { WritingError } from "@/lib/writing";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await writingUser(request); if (typeof user !== "string") return user;
  try {
    const body = await writingBody(request);
    if (typeof body.topic !== "string" || !body.topic.trim() || body.topic.length > 160 || !["free", "task2"].includes(body.mode)) throw new WritingError("请填写 160 字符以内的话题并选择写作类型。");
    return writingJson(await writingModel(request, user, "prompt", { topic: body.topic.trim(), mode: body.mode }));
  } catch (error) { return writingError(error); }
}
