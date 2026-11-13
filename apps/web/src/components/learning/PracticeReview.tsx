"use client";

import type { ReactNode } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { PianoIcon } from "@/components/ui/piano-icon";

type Review = {
  correct: number;
  total: number;
  score: number;
  questions: { id: string; correct: boolean }[];
};

/** A completed practice keeps its next useful step beside the result. */
export function PracticeReview({ id, kind, review, activeQuestionId, disabled, onSelectQuestion, children }: {
  id: string;
  kind: "reading" | "listening";
  review: Review;
  activeQuestionId?: string;
  disabled?: boolean;
  onSelectQuestion: (id: string) => void;
  children?: ReactNode;
}) {
  const { locale } = useUiLocale();
  const english = locale === "en";
  const firstMiss = review.questions.findIndex(question => !question.correct);
  const missed = review.questions.filter(question => !question.correct).length;
  const title = english
    ? `${kind === "reading" ? "Reading" : "Listening"} practice complete`
    : `本次${kind === "reading" ? "阅读" : "听力"}练习已完成`;

  return <section id={id} className="practice-review" tabIndex={-1} aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary ${id}-score`}>
    <div className="practice-review-heading"><h3 id={`${id}-title`}>{title}</h3><span id={`${id}-score`}>{review.score}%</span></div>
    <p id={`${id}-summary`} className="practice-review-summary">{english ? `${review.correct} of ${review.total} answers correct.` : `${review.total} 题中答对 ${review.correct} 题。`} {missed
      ? english ? `${missed} to revisit, with evidence from the text.` : `还有 ${missed} 题，回到原文找找依据。`
      : english ? "Every answer is correct. The evidence is still here to explore." : "全部答对了。还可以看看原文中的依据。"}</p>
    <nav className="practice-review-keys" aria-label={english ? "Review each answer" : "逐题回顾"}>
      {review.questions.map((question, index) => <button key={question.id} type="button" disabled={disabled}
        data-correct={question.correct} aria-current={activeQuestionId === question.id ? "step" : undefined}
        aria-label={english ? `Question ${index + 1}: ${question.correct ? "correct" : "revisit answer"}` : `第 ${index + 1} 题：${question.correct ? "答对" : "回看答案"}`}
        onClick={() => onSelectQuestion(question.id)}>
        <span>{index + 1}</span><PianoIcon name={question.correct ? "check" : "arrow-left"} width={14} height={14} />
      </button>)}
    </nav>
    <div className="practice-review-guide">{review.correct > 0 && <span><PianoIcon name="check" width={14} height={14} />{english ? "Correct" : "答对"}</span>}{missed > 0 && <span><PianoIcon name="arrow-left" width={14} height={14} />{english ? "Revisit" : "回看"}</span>}{firstMiss >= 0 && <button className="piano-text-button" disabled={disabled} onClick={() => onSelectQuestion(review.questions[firstMiss].id)}>{english ? `Start with question ${firstMiss + 1}` : `先看第 ${firstMiss + 1} 题`}</button>}</div>
    {children && <div className="practice-review-note">{children}</div>}
  </section>;
}
