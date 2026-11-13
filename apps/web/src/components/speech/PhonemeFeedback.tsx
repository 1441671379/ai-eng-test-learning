
import { UiText } from "@/components/i18n/UiLocale";
import type { PronunciationPhoneme } from "@/lib/speech/types";
import { phonemeFeedbackLabel } from "@/lib/speech/feedback";
import { cn } from "@/lib/utils";

export function PhonemeFeedback({ phonemes }: { phonemes: PronunciationPhoneme[] }) {
  return <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
    <UiText text={phonemes.map((phoneme, index) => <div key={`${phoneme.targetIndex}-${phoneme.heardIndex}-${index}`} className={cn("rounded-3xl px-4 py-4", phoneme.uncertain ? "bg-slate-100 text-slate-700" : phoneme.status === "correct" ? "bg-yellow-green/25 text-hunter-green" : phoneme.status === "mixed" ? "bg-[#efd889]/40 text-hunter-green" : "bg-blushed-brick text-bright-snow")}>
      <p className="text-sm font-semibold"><UiText text={phonemeFeedbackLabel(phoneme)} /></p>
      <p lang="en" className="mt-3 text-2xl font-semibold">{phoneme.symbol}</p>
      <p className="mt-3 text-sm leading-6"><UiText text={"目标 "} />{phoneme.expected}<UiText text={"，识别 "} />{phoneme.heard}<UiText text={"。"} /></p>
    </div>)} />
  </div>;
}
