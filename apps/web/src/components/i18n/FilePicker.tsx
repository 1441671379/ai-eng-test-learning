"use client";

import { useRef } from "react";
import { UiText, useUiLocale } from "./UiLocale";

/** Keep browser-owned file-input text out of the visible interface. */
export function FilePicker({ accept, disabled, fileName, label, onFile }: {
  accept: string;
  disabled?: boolean;
  fileName?: string;
  label: string;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { t } = useUiLocale();
  return <div className="piano-file-picker mt-2 flex min-w-0 flex-wrap items-center gap-3">
    <input ref={input} type="file" hidden accept={accept} disabled={disabled} aria-label={t(label)} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) onFile(file);
    }} />
    <button type="button" disabled={disabled} onClick={() => input.current?.click()} aria-label={t(label)} className="shrink-0 rounded-full border border-hunter-green/20 bg-white px-4 py-2 text-sm font-semibold text-hunter-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-green disabled:opacity-50">
      <UiText text="选择文件" />
    </button>
    <span role="status" className="min-w-0 break-all text-sm text-iron-grey">{fileName || <UiText text="未选择文件" />}</span>
  </div>;
}
