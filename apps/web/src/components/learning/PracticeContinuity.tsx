"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isPracticeModule, practiceDestination, practiceSeed, KNOWLEDGE_HOME_EVENT, type PracticeEntry, type PracticeSnapshot } from "@/lib/practice-continuity";
import type { LearningModuleId } from "@/lib/learning-modules";
import { useUiLocale } from "@/components/i18n/UiLocale";

type Controls = { module: LearningModuleId; blocked: boolean; beforeEnd: () => Promise<void> };
type Context = { snapshot: PracticeSnapshot; initial: PracticeSnapshot; remember: (module: LearningModuleId, entry: PracticeEntry) => void; detail: (module: LearningModuleId, route: string, key: string, value: unknown) => void; current: () => PracticeSnapshot; controls: (value: Controls | null) => void; finish: () => Promise<void>; retry: () => Promise<void>; active: Controls | null; saving: boolean; error: string };
const Continuity = createContext<Context | null>(null);
const noop = async () => {};

export function PracticeContinuity({ children, initial, loadFailed = false }: { children: ReactNode; initial: PracticeSnapshot; loadFailed?: boolean }) {
  const pathname = usePathname(), search = useSearchParams(), router = useRouter();
  const [snapshot, setSnapshot] = useState(initial), [active, setActive] = useState<Controls | null>(null), [saving, setSaving] = useState(false);
  const [error, setError] = useState(loadFailed ? "练习进度暂时无法读取，请稍后重试。" : "");
  const latest = useRef(initial), queue = useRef<Promise<void>>(Promise.resolve()), pending = useRef(new Set<LearningModuleId>()), finishing = useRef(false);
  const post = useCallback((module: LearningModuleId, entry: PracticeEntry | null) => {
    const action = queue.current.catch(() => {}).then(async () => {
      const body = JSON.stringify({ module, entry });
      const response = await fetch("/api/practice-continuity", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: new TextEncoder().encode(body).byteLength < 60000 });
      if (!response.ok) throw new Error("练习进度保存失败，请重试。");
    });
    queue.current = action; return action;
  }, []);
  const remember = useCallback((module: LearningModuleId, entry: PracticeEntry) => {
    const previous = latest.current[module];
    if (previous?.route === entry.route && previous.view.details && !entry.view.details) entry = { ...entry, view: { ...entry.view, details: previous.view.details } };
    if (finishing.current || JSON.stringify(latest.current[module]) === JSON.stringify(entry)) return;
    latest.current = { ...latest.current, [module]: entry }; pending.current.add(module); setSnapshot(latest.current);
    void post(module, entry).then(() => { if (latest.current[module] === entry) pending.current.delete(module); setError(""); }).catch(() => setError("练习进度保存失败，请稍后重试；暂不要关闭窗口。"));
  }, [post]);
  const current = useCallback(() => latest.current, []);
  const detail = useCallback((module: LearningModuleId, route: string, key: string, value: unknown) => {
    const entry = latest.current[module]; if (!entry || entry.route !== route) return;
    const details = entry.view.details as Record<string, unknown> | undefined;
    if (JSON.stringify(details?.[key]) === JSON.stringify(value)) return;
    remember(module, { ...entry, view: { ...entry.view, details: { ...details, [key]: value } } });
  }, [remember]);
  useEffect(() => {
    const flush = () => {
      if (finishing.current) return;
      for (const moduleId of pending.current) navigator.sendBeacon("/api/practice-continuity", new Blob([JSON.stringify({ module: moduleId, entry: latest.current[moduleId] })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", flush); window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); };
  }, []);
  // Only ordinary module entrances resume. Explicit history and record links stay explicit.
  const moduleId = pathname.slice(1), isEntrance = isPracticeModule(moduleId) && !search.toString();
  const destination = isEntrance && moduleId !== "knowledge" && snapshot[moduleId]?.route !== pathname ? snapshot[moduleId]?.route : undefined;
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);
  const finish = useCallback(async () => {
    if (!active || active.blocked || finishing.current) return;
    finishing.current = true; setSaving(true); setError("");
    try {
      await active.beforeEnd(); await queue.current.catch(() => {}); await post(active.module, null);
      delete latest.current[active.module]; pending.current.delete(active.module);
      // A clean mount prevents the just-ended component from recreating its checkpoint.
      window.location.assign(`/${active.module}`);
    } catch { finishing.current = false; setSaving(false); setError("结束练习失败，当前页面和进度已保留，请重试。"); }
  }, [active, post]);
  const retry = useCallback(async () => {
    try {
      if (!pending.current.size) {
        const response = await fetch("/api/practice-continuity", { cache: "no-store" }); if (!response.ok) throw new Error();
        const value = await response.json(); latest.current = { ...value.modules, ...latest.current }; setSnapshot(latest.current);
      }
      for (const moduleId of pending.current) { const entry = latest.current[moduleId]; if (entry) { await post(moduleId, entry); if (latest.current[moduleId] === entry) pending.current.delete(moduleId); } }
      setError("");
    } catch { setError("练习进度保存失败，请稍后重试；暂不要关闭窗口。"); }
  }, [post]);
  useEffect(() => {
    const deleted = (event: Event) => {
      const id = (event as CustomEvent<string>).detail, entry = latest.current.speaking;
      if (entry && new URL(entry.route, window.location.origin).searchParams.get("session") === id) {
        latest.current = { ...latest.current }; delete latest.current.speaking; pending.current.delete("speaking"); setSnapshot(latest.current);
      }
    };
    window.addEventListener("practice-record-deleted", deleted); return () => window.removeEventListener("practice-record-deleted", deleted);
  }, []);
  return <Continuity.Provider value={{ snapshot, initial, remember, detail, current, controls: setActive, finish, retry, active, saving, error }}>{destination ? <p role="status"><ResumeMessage /></p> : children}</Continuity.Provider>;
}
function ResumeMessage() { const { locale } = useUiLocale(); return <>{locale === "en" ? "Resuming your practice…" : "正在恢复上次练习…"}</>; }

export function PracticeModuleLink({ module, page, children, ...props }: Omit<React.ComponentProps<typeof Link>, "href"> & { module: LearningModuleId; page?: string }) {
  const context = useContext(Continuity);
  const destination = practiceDestination(module, context?.snapshot || {});
  if(module === "knowledge")return <Link {...props} href="/knowledge" onNavigate={event=>{props.onNavigate?.(event);window.dispatchEvent(new Event(KNOWLEDGE_HOME_EVENT));}}>{children}</Link>;
  return <Link {...props} href={page && destination.split("?")[0] !== page ? page : destination}>{children}</Link>;
}

export function PracticeActions() {
  const context = useContext(Continuity), { locale } = useUiLocale();
  if (!context) return null;
  return <>{context.active && <button className="piano-text-button" disabled={context.active.blocked || context.saving} onClick={() => void context.finish()}>{locale === "en" ? context.saving ? "Ending…" : "End this practice" : context.saving ? "正在结束…" : "结束该练习"}</button>}{context.error && <span className="piano-error" role="alert">{locale === "en" ? "Practice progress could not be saved. Please retry before closing." : context.error}<button className="piano-text-button" onClick={() => void context.retry()}>{locale === "en" ? "Retry" : "重试"}</button></span>}</>;
}

export function usePracticeSeed(module: LearningModuleId, route: string) {
  const context = useContext(Continuity);
  const [seed] = useState(() => practiceSeed(context?.snapshot || {}, module, route));
  return seed;
}

export function usePracticeCheckpoint(module: LearningModuleId, route: string, view: Record<string, unknown>, enabled: boolean, blocked = false, beforeEnd = noop) {
  const context = useContext(Continuity), remember = context?.remember, controls = context?.controls;
  const serialized = JSON.stringify(view), end = useRef(beforeEnd);
  useEffect(() => { end.current = beforeEnd; }, [beforeEnd]);
  useEffect(() => { if (enabled) remember?.(module, { route, view: JSON.parse(serialized) }); }, [enabled, module, route, serialized, remember]);
  useEffect(() => {
    if (!enabled) return;
    controls?.({ module, blocked, beforeEnd: () => end.current() });
    return () => controls?.(null);
  }, [enabled, blocked, controls, module]);
  usePracticeViewport(module, route, enabled);
}

function usePracticeViewport(module: LearningModuleId, route: string, enabled: boolean) {
  const context = useContext(Continuity), detail = context?.detail, current = context?.current;
  useEffect(() => {
    if (!enabled || !detail || !current) return;
    const nodes = [...document.querySelectorAll<HTMLElement>(".piano-content,.reading-workspace,.speaking-scroll")];
    const entry = current()[module], details = entry?.route === route ? entry.view.details as Record<string, unknown> | undefined : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = (node: HTMLElement) => "scroll:" + (node.classList.contains("piano-content") ? "page" : node.classList.contains("speaking-scroll") ? "speaking" : "reading");
    // Detached elements report scrollTop=0 during React cleanup. Keep the last
    // connected position rather than overwriting the saved viewport on exit.
    const positions = new Map(nodes.map(node => [node, node.scrollTop]));
    const save = () => { clearTimeout(timer); for (const node of nodes) detail(module, route, key(node), positions.get(node) || 0); };
    const flush = () => { for (const node of nodes) if (node.isConnected) positions.set(node, node.scrollTop); save(); };
    const scroll = () => { for (const node of nodes) positions.set(node, node.scrollTop); clearTimeout(timer); timer = setTimeout(save, 250); };
    const frame = requestAnimationFrame(() => {
      for (const node of nodes) { const top = details?.[key(node)]; if (typeof top === "number") node.scrollTop = top; positions.set(node, node.scrollTop); node.addEventListener("scroll", scroll, { passive: true }); }
    });
    window.addEventListener("pagehide", flush); window.addEventListener("beforeunload", flush);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); nodes.forEach(node => node.removeEventListener("scroll", scroll)); window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); save(); };
  }, [module, route, enabled, detail, current]);
}

/** Small child controls (audio position, selected word) share the same checkpoint. */
export function usePracticeDetail<T extends string | number | boolean>(key: string, fallback: T) {
  const context = useContext(Continuity), pathname = usePathname(), search = useSearchParams();
  const route = pathname + (search.toString() ? "?" + search.toString() : ""), moduleId = pathname.split("/")[1];
  const [value, setValue] = useState<T>(() => {
    const entry = isPracticeModule(moduleId) ? context?.snapshot[moduleId] : undefined;
    const saved = entry?.route === route ? (entry.view.details as Record<string, unknown> | undefined)?.[key] : undefined;
    return typeof saved === typeof fallback ? saved as T : fallback;
  });
  const detail = context?.detail;
  useEffect(() => { if (isPracticeModule(moduleId)) detail?.(moduleId, route, key, value); }, [detail, moduleId, route, key, value]);
  return [value, setValue] as const;
}

export function draftString(seed: Record<string, unknown>, key: string, fallback = "") { return typeof seed[key] === "string" ? seed[key] as string : fallback; }
export function draftNumber(seed: Record<string, unknown>, key: string, fallback = 0) { return typeof seed[key] === "number" && Number.isFinite(seed[key]) ? seed[key] as number : fallback; }
export function draftChoice<const T extends string>(seed: Record<string, unknown>, key: string, choices: readonly T[], fallback: NoInfer<T>): T { return choices.includes(seed[key] as T) ? seed[key] as T : fallback; }
export function draftFlag(seed: Record<string, unknown>, key: string, fallback = false) { return typeof seed[key] === "boolean" ? seed[key] as boolean : fallback; }
export function draftAnswers(seed: Record<string, unknown>) { const raw = seed.answers; return raw && typeof raw === "object" && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v.length <= 120)) as Record<string, string> : {}; }
