"use client";
import { useEffect, useRef, useState } from "react";
export type ExperimentStatus = Record<"model" | "transcription" | "pronunciation" | "assessment" | "tts", { ready: boolean; message: string }>;
export function useExperimentStatus() {
  const [status, setStatus] = useState<ExperimentStatus | null>(null), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch("/api/experiments/status", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("status");
        const value = await response.json() as ExperimentStatus;
        if (controller.signal.aborted) return;
        setStatus(value);
        if (Object.values(value).some(item => !item.ready)) timer = setTimeout(() => void load(), 15_000);
      } catch { if (!controller.signal.aborted) timer = setTimeout(() => void load(), 15_000); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  return { status, refresh: () => setRevision(value => value + 1) };
}
export function useExperimentApi() {
  const controller = useRef(new AbortController());
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  return async function call<T>(path: string, body?: Record<string, unknown> | FormData, method?: string): Promise<T> {
    const response = await fetch(`/api/experiments/${path}`, { method: method || (body ? "POST" : "GET"),
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, cache: "no-store",
      signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(200_000)]) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "实验请求失败，请重试。");
    return value as T;
  };
}
export function message(error: unknown) { return error instanceof Error ? error.message : "操作失败，请重试。"; }
export const fieldClass = "w-full rounded-2xl bg-vanilla-cream/50 px-4 py-3 text-hunter-green ring-1 ring-hunter-green/15 focus:ring-2 focus:ring-sage-green disabled:opacity-60";
