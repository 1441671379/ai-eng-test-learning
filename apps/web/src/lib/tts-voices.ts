import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type Voice = { label: string; version: string; voice: Record<string, string> };
type Config = { provider?: string; model_dir: string; speed?: number; default_voice?: string; selection_file: string; voices: Record<string, Voice> };
export const listeningRoles = ["A", "B", "C"] as const;
export type ListeningRole = typeof listeningRoles[number];
type Selection = { voiceId: string; roleVoices: Record<ListeningRole, string> };
async function selection(settings: Config): Promise<Selection> {
  let saved: Partial<Selection> = {};
  try { saved = JSON.parse(await readFile(settings.selection_file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const valid = (id?: string) => id && Object.hasOwn(settings.voices, id) ? id : "";
  return { voiceId: valid(saved.voiceId) || settings.default_voice || "af_heart",
    roleVoices: Object.fromEntries(listeningRoles.map(role => [role, valid(saved.roleVoices?.[role])])) as Record<ListeningRole, string> };
}
async function config(): Promise<Config> {
  const path = process.env.ENGLISH_TTS_CONFIG || (process.env.ENGLISH_APP_ROOT
    ? resolve(/* turbopackIgnore: true */ process.env.ENGLISH_APP_ROOT, "deployment/kokoro/settings.json") : "");
  if (!path) throw new Error("未配置语音设置路径，请使用 Start-LearningApps.cmd 或 pnpm dev 启动应用。");
  const settings: Config = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  if (settings.provider && settings.provider !== 'kokoro') throw new Error('This application uses Kokoro for all speech synthesis.');
  settings.selection_file = resolve(dirname(path), settings.selection_file);
  settings.model_dir = resolve(dirname(path), settings.model_dir);
  for (const voice of Object.values(settings.voices)) voice.voice.voice_file = resolve(dirname(path), voice.voice.voice_file);
  return settings;
}
export async function getTtsVoiceOptions() {
  const settings = await config();
  const { voiceId: selectedVoiceId, roleVoices } = await selection(settings);
  if (!settings.voices[selectedVoiceId]) throw new Error("已选音色不存在。");
  return { provider: "kokoro", supportsInstructions: false, selectedVoiceId, roleVoices,
    voiceLabel: settings.voices[selectedVoiceId].label, options: {}, default: "",
    voices: Object.entries(settings.voices).map(([id, voice]) => ({ id, label: voice.label, version: voice.version })) };
}
const store = globalThis as typeof globalThis & { ttsSelectionQueue?: Promise<unknown> };
export async function setTtsVoice(voiceId: unknown, roleVoices?: unknown) {
  const settings = await config();
  if (typeof voiceId !== "string" || !Object.hasOwn(settings.voices, voiceId)) throw new TypeError("请选择已安装的音色。");
  let roles: Record<ListeningRole, string> | undefined;
  if (roleVoices !== undefined) {
    if (!roleVoices || typeof roleVoices !== "object" || Array.isArray(roleVoices) || Object.keys(roleVoices).some((key) => !listeningRoles.includes(key as ListeningRole))) throw new TypeError("角色音色设置无效。");
    const input = roleVoices as Record<string, unknown>;
    roles = Object.fromEntries(listeningRoles.map((role) => {
      const id = input[role];
      if (typeof id !== "string" || (id !== "" && !Object.hasOwn(settings.voices, id))) throw new TypeError(`请选择角色 ${role} 的已安装音色，或跟随全局音色。`);
      return [role, id];
    })) as Record<ListeningRole, string>;
  }
  const job = (store.ttsSelectionQueue ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const previous = await selection(settings);
    const temporary = join(dirname(settings.selection_file), randomUUID() + ".tmp");
    try { await writeFile(temporary, JSON.stringify({ voiceId, roleVoices: roles ?? previous.roleVoices }), "utf8"); await rename(temporary, settings.selection_file); }
    finally { await unlink(temporary).catch(() => undefined); }
    return getTtsVoiceOptions();
  });
  store.ttsSelectionQueue = job;
  try { return await job; } finally { if (store.ttsSelectionQueue === job) delete store.ttsSelectionQueue; }
}
// One snapshot per complete article prevents mixed voices if settings change mid-generation.
export async function ttsVoiceSnapshot() {
  const settings = await config(), saved = await selection(settings);
  return voiceSnapshot(settings, saved.voiceId);
}
async function voiceSnapshot(settings: Config, voiceId: string) {
  if (!Object.hasOwn(settings.voices, voiceId)) throw new Error("已选音色不存在。");
  const voice = settings.voices[voiceId];
  const provider = "kokoro";
  const paths = [voice.voice.voice_file, join(settings.model_dir, "kokoro-v1_0.pth"), join(settings.model_dir, "config.json")];
  const files = await Promise.all(paths.map(async (path) => {
    const info = await stat(path); return [path, info.size, info.mtimeMs];
  }));
  return { provider, voiceId, label: voice.label, cacheKey: createHash("sha256").update(JSON.stringify([provider, settings.speed, voice, files])).digest("hex").slice(0, 24) };
}
export async function ttsListeningVoiceSnapshot() {
  const settings = await config(), saved = await selection(settings);
  const ids = [...new Set([saved.voiceId, ...listeningRoles.map((role) => saved.roleVoices[role] || saved.voiceId)])];
  const voices = new Map(await Promise.all(ids.map(async (id) => [id, await voiceSnapshot(settings, id)] as const)));
  return { global: voices.get(saved.voiceId)!, roles: Object.fromEntries(listeningRoles.map((role) => [role, voices.get(saved.roleVoices[role] || saved.voiceId)!])) as Record<ListeningRole, Awaited<ReturnType<typeof voiceSnapshot>>> };
}
