import type { LearningModuleId } from "./learning-modules";

export type PracticeEntry = { route: string; view: Record<string, unknown> };
export type PracticeSnapshot = Partial<Record<LearningModuleId, PracticeEntry>>;
export const KNOWLEDGE_HOME_EVENT = "english-knowledge-home";
export const practiceModules = ["listening", "speaking", "reading", "writing", "vocabulary", "knowledge"] as const;
export function isPracticeModule(value: unknown): value is LearningModuleId {
  return practiceModules.some(module => module === value);
}

/** Only local learning routes can become a resume destination. */
export function validatePracticeEntry(module: LearningModuleId, raw: unknown): PracticeEntry | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid practice checkpoint");
  const { route, view } = raw as PracticeEntry;
  const allowed = module === "speaking" ? [`/${module}/coach`, `/${module}/pronunciation`, `/${module}/article-reading`] : [`/${module}`];
  if (typeof route !== "string" || route.length > 250 || !route.startsWith("/") || route.startsWith("//")) throw new Error("Invalid practice route");
  const url = new URL(route, "http://local.invalid");
  if (url.origin !== "http://local.invalid" || !allowed.includes(url.pathname) || url.hash) throw new Error("Invalid practice route");
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const keys = module === "speaking" ? ["session", "lesson"] : module === "vocabulary" ? ["view"] : ["id"];
  for (const [key, value] of url.searchParams) {
    if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1 || (key === "view" ? value !== "personal" : !id.test(value))) throw new Error("Invalid practice query");
  }
  if (!view || typeof view !== "object" || Array.isArray(view) || JSON.stringify(view).length > 55000) throw new Error("Invalid practice view");
  return { route: url.pathname + url.search, view: JSON.parse(JSON.stringify(view)) };
}

export function practiceDestination(module: LearningModuleId, snapshot: PracticeSnapshot) {
  if(module === "knowledge") return "/knowledge";
  return snapshot[module]?.route || `/${module}`;
}

export function practiceSeed(snapshot: PracticeSnapshot, module: LearningModuleId, route: string) {
  if(module === "knowledge") return {};
  return snapshot[module]?.route === route ? snapshot[module]!.view : {};
}

/** Move only phrase UI state; the same learner's phrase database keeps its IDs. */
export function movePhraseCheckpoint(snapshot: PracticeSnapshot): PracticeSnapshot {
  const old=snapshot.vocabulary;
  if(!old)return snapshot;
  const details=old.view.details as Record<string,unknown>|undefined;
  const phraseDetails=Object.fromEntries(Object.entries(details||{}).filter(([key])=>key.startsWith("phrase-")));
  if(old.view.view!=="phrases"&&!Object.keys(phraseDetails).length)return snapshot;
  const result={...snapshot};
  if(!result.knowledge)result.knowledge={route:"/knowledge",view:{section:"phrases",details:{...phraseDetails,...(old.view.view==="phrases"&&details?.["scroll:page"]!==undefined?{"scroll:page":details["scroll:page"]}:{})}}};
  result.vocabulary={...old,view:{...old.view,...(old.view.view==="phrases"?{view:"review"}:{}),details:Object.fromEntries(Object.entries(details||{}).filter(([key])=>!key.startsWith("phrase-")&&(old.view.view!=="phrases"||key!=="scroll:page")))}};
  return result;
}
