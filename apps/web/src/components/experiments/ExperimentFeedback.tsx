
import { UiText } from "@/components/i18n/UiLocale";
import type { CoachFeedback } from "@/lib/models/types";
export function ExperimentFeedback({ feedback }: { feedback: CoachFeedback }) {
  return <div className="speaking-coach-feedback">
    <p className="font-semibold">{feedback.summary}</p>
    <UiText text={feedback.directions.length ? <div><h4 className="font-semibold"><UiText text={"可以继续聊的方向"} /></h4><ul className="list-disc pl-5"><UiText text={feedback.directions.map((item, i) => <li key={i}>{item}</li>)} /></ul></div> : null} />
    <div><h4 className="font-semibold"><UiText text={"更自然的表达"} /></h4><p lang="en" className="speaking-turn-reply">{feedback.betterAnswer}</p></div>
    <UiText text={feedback.expressions.length ? <div><h4 className="font-semibold"><UiText text={"词语提示与简单说法"} /></h4><UiText text={feedback.expressions.map((item, i) => <p key={i} className="speaking-expression"><strong lang="en">{item.phrase}</strong> <UiText text={" · "} />{item.meaning}<br /><UiText text={"简单说："} /><span lang="en">{item.simpler}</span></p>)} /></div> : null} />
    <div><h4 className="font-semibold"><UiText text={"语法建议"} /></h4><UiText text={feedback.grammar.length ? feedback.grammar.map((item, i) => <div key={i} className="speaking-expression"><p lang="en"><span className="text-iron-grey">{item.original}</span> → <strong>{item.corrected}</strong></p><p>{item.explanation}</p></div>) : <p><UiText text={"本轮未指出需要修改的语法问题。"} /></p>} /></div>
    <p className="speaking-small speaking-muted"><UiText text={feedback.model} /> <UiText text={" · 基于你确认后的回答文字生成。"} /></p>
  </div>;
}
