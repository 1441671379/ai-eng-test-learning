"use client";

import { UiText } from "@/components/i18n/UiLocale";
// FILE: src/components/coach/FreedomAssessmentPanel.tsx

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/speech/ProgressRing";
import type { PronunciationAssessment } from "@/lib/speech/types";
import { pronunciationNotice } from "@/lib/speech/feedback";
import { WordFeedback } from "./WordFeedback";
import { PhonemeFeedback } from "./PhonemeFeedback";

interface FreedomAssessmentPanelProps {
  transcript: string;
  assessment: PronunciationAssessment | null;
}

export function FreedomAssessmentPanel({ transcript, assessment }: FreedomAssessmentPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!assessment) {
    return (
      <Card className="bg-white">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-sage-green"><UiText text={"Freedom reply"} /></p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              <UiText text={" Your reply is ready for the next coach turn. "} /></h3>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Reply text"} /></p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">
              {transcript}
            </p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              <UiText text={" The coach uses this reply to continue the conversation. Pronunciation results appear when audio scoring is available. "} /></p>
          </div>
        </div>
      </Card>
    );
  }

  const notice = pronunciationNotice(assessment);

  return (
    <Card className="bg-white">
      <div className="space-y-5">
        <UiText text={notice ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-900"><UiText text={notice} /></p> : null} />
        <div className="space-y-2">
          <p className="eyebrow text-sm text-sage-green"><UiText text={"Freedom transcript"} /></p>
          <h3 className="text-2xl font-semibold text-hunter-green">
            <UiText text={" Whisper builds the reply text, then the local acoustic model checks the live phonemes against it. "} /></h3>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <p className="eyebrow text-xs text-sage-green"><UiText text={"Whisper transcript"} /></p>
          <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">{transcript}</p>
          <p className="mt-2 text-sm leading-6 text-iron-grey">
            <UiText text={" This is the word-level transcript from the freedom take. "} /></p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Pronunciation reference score"} /></p>
            <div className="mt-3 flex justify-center">
              <ProgressRing score={assessment.overallScore} size={88} strokeWidth={7} />
            </div>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Pronunciation check"} /></p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">{assessment.summary}</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-hunter-green"><UiText text={assessment.nextStep} /></p>
            <p className="mt-3 text-xs leading-6 text-iron-grey"><UiText text={"参考分表示音素一致程度。转写文字不正确时，请先校对再检查发音。"} /></p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Target reply"} /></p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green"><UiText text={assessment.targetText} /></p>
            <p className="mt-2 text-sm leading-6 text-iron-grey break-words"><UiText text={assessment.ipaTarget} /></p>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green"><UiText text={"Decoded phonemes"} /></p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green break-words">
              {assessment.transcript}
            </p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              <UiText text={" The live model decode for this take is shown here directly. "} /></p>
          </div>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="eyebrow text-xs text-sage-green"><UiText text={"Word feedback"} /></p>
              <p className="text-sm leading-6 text-iron-grey">
                <UiText text={" Compare the transcript-driven target with what the audio model heard. "} /></p>
            </div>
          </div>

          <div className="mt-3"><WordFeedback key={assessment.targetText} highlights={assessment.highlights} /></div>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="eyebrow text-xs text-sage-green"><UiText text={"Advanced breakdown"} /></p>
              <p className="text-sm leading-6 text-iron-grey">
                <UiText text={" Open the phoneme grid to compare expected sounds with the live decode. "} /></p>
            </div>
            <Button variant="ghost" onClick={() => setShowAdvanced((v) => !v)}>
              <UiText text={showAdvanced ? "Hide breakdown" : "Show breakdown"} />
            </Button>
          </div>

          <UiText text={showAdvanced ? (
            <div className="mt-4"><PhonemeFeedback phonemes={assessment.phonemes} /></div>
          ) : null} />
        </div>
      </div>
    </Card>
  );
}
