"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import { difficultyLabels, type LearningLevel } from "@/lib/learning-generation";
export function GenerationGuidance({ remarks, onRemarks, level, onLevel, disabled = false }: {
  remarks: string; onRemarks: (value: string) => void; level: LearningLevel; onLevel: (value: LearningLevel) => void; disabled?: boolean;
}) {
  const field = "w-full rounded-xl border border-hunter-green/20 bg-white px-3 py-2.5 text-sm text-hunter-green";
  return <><label className="space-y-2 text-sm font-semibold text-hunter-green"><span><UiText text={"备注（选填）"} /></span><UiElement as="input" maxLength={100} value={remarks} disabled={disabled} onChange={event => onRemarks(event.target.value)} placeholder="例如：面向大一经济学学生，用故事解释通胀与失业的关系" className={field} /><span className="block text-xs font-normal text-iron-grey"><UiText text={"说明想学的知识、理论或故事 · "} /><UiText text={remarks.length} /><UiText text={"/100 字符"} /></span></label>
    <label className="space-y-2 text-sm font-semibold text-hunter-green"><span><UiText text={"文章难度"} /></span><select value={level} disabled={disabled} onChange={event => onLevel(event.target.value as LearningLevel)} className={field}><UiText text={Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}><UiText text={label} /></option>)} /></select></label></>;
}
