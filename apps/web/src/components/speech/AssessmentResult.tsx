"use client";

import { UiText } from "@/components/i18n/UiLocale";


import { useState } from "react";
import type { PronunciationAssessment } from "@/lib/speech/types";
import { pronunciationNotice } from "@/lib/speech/feedback";
import { ProgressRing } from "@/components/speech/ProgressRing";
import { WordFeedback } from "@/components/speech/WordFeedback";
import { PhonemeFeedback } from "@/components/speech/PhonemeFeedback";
import { Button } from "@/components/ui/button";

interface AssessmentResultProps {
  assessment: PronunciationAssessment;
  onRetry: () => void;
  onNext: () => void;
  nextLabel?: string;
  showActions?: boolean;
}

export function AssessmentResult({ assessment, onRetry, onNext, nextLabel = "Next Word", showActions = true }: AssessmentResultProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const notice = pronunciationNotice(assessment);
  return <div className="space-y-4">
    <UiText text={assessment.recordWarning ? <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><UiText text={assessment.recordWarning} /></p> : null} />
    <UiText text={notice ? <p role="status" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900"><UiText text={notice} /></p> : null} />
    <div className="grid gap-4">
      <div className="rounded-[2rem] bg-white px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center gap-4">
          <ProgressRing score={assessment.overallScore} size={92} strokeWidth={7} />
          <div className="space-y-2">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Pronunciation reference score"} /></p>
            <p className="text-3xl font-semibold text-hunter-green"><UiText text={assessment.overallScore} /><UiText text={"/100"} /></p>
            <p className="text-sm leading-6 text-iron-grey">{assessment.summary}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-6 text-iron-grey"><UiText text={"分数表示目标与识别音素的一致程度，供练习参考，不是经过人工标定的发音准确率。"} /></p>
        <div className="mt-5 space-y-3">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Target reply"} /></p>
            <p lang="en" className="mt-2 text-2xl font-semibold text-hunter-green">{assessment.targetText}</p>
            <p className="mt-2 break-words text-sm leading-6 text-iron-grey"><UiText text={assessment.ipaTarget} /></p>
          </div>
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Decoded phonemes"} /></p>
            <p className="mt-2 break-words text-lg font-semibold text-hunter-green">{assessment.transcript || <UiText text="未识别到清晰音素" />}</p>
          </div>
        </div>
      </div>
      <div className="rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6">
        <p className="eyebrow text-xs text-sage-green"><UiText text={"Word feedback"} /></p>
        <h3 className="mt-2 text-2xl font-semibold text-hunter-green"><UiText text={"See which parts of the reply need attention."} /></h3>
        <div className="mt-4 rounded-3xl bg-white px-4 py-4"><WordFeedback key={assessment.targetText} highlights={assessment.highlights} /></div>
        <div className="mt-4 rounded-3xl bg-white px-4 py-4">
          <p className="eyebrow text-xs text-sage-green"><UiText text={"Next cue"} /></p>
          <p className="mt-2 text-sm leading-6 text-iron-grey"><UiText text={assessment.nextStep} /></p>
        </div>
      </div>
    </div>
    <UiText text={showActions ? <div className="flex flex-col gap-3 sm:flex-row"><Button variant="ghost" onClick={onRetry} className="flex-1"><UiText text={"Try Again"} /></Button><Button variant="primary" onClick={onNext} className="flex-1 text-white"><UiText text={nextLabel} /></Button></div> : null} />
    <div className="rounded-[2rem] bg-white px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1"><p className="eyebrow text-xs text-sage-green"><UiText text={"Phoneme breakdown"} /></p><p className="text-sm leading-6 text-iron-grey"><UiText text={"查看音素匹配、疑似替换、漏读和额外音素；无法确认的部分单独标注。"} /></p></div>
        <Button variant="ghost" onClick={() => setShowAdvanced(value => !value)}><UiText text={showAdvanced ? "Hide breakdown" : "Show breakdown"} /></Button>
      </div>
      <UiText text={showAdvanced ? <div className="mt-4"><PhonemeFeedback phonemes={assessment.phonemes} /></div> : null} />
    </div>
  </div>;
}
