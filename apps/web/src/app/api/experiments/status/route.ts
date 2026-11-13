import { globalModelProxy } from "@/lib/models/global-proxy";
import { getSpeechServiceUrlForRequest } from "@/lib/services/runtime";
import { experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await experimentUser(request);
    const results = await Promise.allSettled([
      globalModelProxy(request, "status").then(async response => ({ ok: response.ok, value: await response.json() })),
      fetch(`${getSpeechServiceUrlForRequest(request)}/health`, { cache: "no-store", signal: AbortSignal.timeout(4000) }).then(response => response.json()),
      fetch(`${getSpeechServiceUrlForRequest(request)}/experiments/time-alignment/status`, { cache: "no-store", signal: AbortSignal.timeout(4000) }).then(response => response.json()),
    ]);
    const model = results[0].status === "fulfilled" ? results[0].value : null;
    const speech = results[1].status === "fulfilled" ? results[1].value : null;
    const timing = results[2].status === "fulfilled" ? results[2].value : null;
    const assessmentReady = Boolean(speech?.modelReady && speech?.transcriberReady && timing?.timingReady && !timing?.error);
    return experimentJson({ model: { ready: Boolean(model?.ok && model.value.ready), message: model?.value.message || "模型服务暂不可用，可到设置页检查。" },
      transcription: { ready: Boolean(speech?.transcriberReady), message: "Whisper 语音识别" },
      assessment: { ready: assessmentReady, message: "单词时间定位＋边界容错音素评估" },
      pronunciation: { ready: assessmentReady, message: "统一时间配对评估" },
      tts: { ready: Boolean(speech?.ttsReady && speech?.ttsProvider === "kokoro"), message: speech?.ttsModel || "TTS" } });
  } catch (error) { return experimentFailure(error); }
}
