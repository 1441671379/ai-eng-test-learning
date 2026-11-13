
import { UiText, UiElement } from "@/components/i18n/UiLocale";
import type { PronunciationReference as Reference } from "@/lib/experiments/time-alignment-types";

export function PronunciationReference({ reference, appearance }: { reference?: Reference; appearance?: "piano" }) {
  if (!reference) return null;
  return <UiElement as="div" className={appearance === "piano" ? "speaking-reference" : "space-y-2 rounded-xl bg-vanilla-cream/50 p-3 text-sm"} aria-label="词典基础音标">
    <p className="text-xs font-semibold text-iron-grey"><UiText text={"词典基础音标 · 学习参考"} /></p>
    <UiText text={reference.dictionary.length ? (["US", "UK"] as const).map(accent => {
      const entries = reference.dictionary.filter(entry => entry.accent === accent);
      return entries.length ? <p key={accent}><span className="mr-2 text-xs text-iron-grey"><UiText text={accent === "US" ? "美音" : "英音"} /></span><span className="break-words font-mono"><UiText text={entries.map(entry => entry.ipa).join(" · ")} /></span></p> : null;
    }) : <p className="text-xs text-iron-grey"><UiText text={"开放词典尚未收录此词，本次使用自动生成的发音参考。"} /></p>} />
    <p className="text-xs leading-5 text-iron-grey"><UiText text={"评分接受该词的英美发音及局部混用、合理弱读与闪音；下方音素用于录音配对。当前不评估重音。开放词典收录可能不全。"} /></p>
  </UiElement>;
}
