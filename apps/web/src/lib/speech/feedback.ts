import type { PronunciationAssessment, PronunciationHighlight, PronunciationPhoneme } from "./types";

export function wordFeedbackLabel(highlight: PronunciationHighlight): string {
  if (highlight.uncertain) return "无法确认";
  if (highlight.status === "correct") return "音素匹配";
  if (highlight.status === "needs-work") return "疑似误读";
  return "需核对 / 可能弱读";
}

export function phonemeFeedbackLabel(phoneme: PronunciationPhoneme): string {
  if (phoneme.uncertain && phoneme.operation === "insertion") return "额外音素 · 归属未确认";
  if (phoneme.uncertain) return "无法确认";
  switch (phoneme.operation) {
    case "match": return "音素匹配";
    case "variant": return "可能连读 / 弱读";
    case "substitution": return "疑似替换";
    case "deletion": return "疑似漏读";
    case "insertion": return "额外音素";
    default: return "历史检查结果";
  }
}

export function wordFeedbackCounts(highlights: PronunciationHighlight[]) {
  return {
    matched: highlights.filter(item => !item.uncertain && item.status === "correct").length,
    review: highlights.filter(item => !item.uncertain && item.status === "needs-work").length,
    uncertain: highlights.filter(item => item.uncertain).length,
    variation: highlights.filter(item => !item.uncertain && item.status === "mixed").length,
  };
}

export function pronunciationNotice(assessment: PronunciationAssessment): string | null {
  if (assessment.assessmentWarning) return assessment.assessmentWarning;
  if (assessment.scoringVersion !== "word-alignment-v2") return "这是旧规则生成的历史结果，可能存在单词归属偏差；重新录音可使用改进后的检查。";
  return null;
}
