import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export function applicationEnvironment(env = process.env) {
  env = { ...env };
  // Compatibility for existing launchers; all application code uses ENGLISH_*.
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("CADENCE_")) env[key.replace(/^CADENCE_/, "ENGLISH_")] ??= value;
  }
  const root = env.ENGLISH_APP_ROOT || fileURLToPath(new URL("../../../", import.meta.url));
  for (const [name, old, current] of [
    ["ENGLISH_DATA_DIR", "deployment/cadence-data", "deployment/learning-data"],
  ]) {
    if (env[name] && resolve(env[name]).toLowerCase() === resolve(root, old).toLowerCase() && existsSync(join(root, current))) env[name] = join(root, current);
  }
  const data = env.ENGLISH_DATA_DIR || join(root, "deployment/learning-data");
  const runtimeFile = join(root, 'deployment/tts/runtime.json');
  const runtime = existsSync(runtimeFile) ? JSON.parse(readFileSync(runtimeFile, 'utf8').replace(/^\uFEFF/, '')) : null;
  return {
    ...env, ENGLISH_APP_ROOT: root, ENGLISH_DATA_DIR: data,
    ENGLISH_TTS_PROVIDER: 'kokoro',
    ENGLISH_TTS_CONFIG: env.ENGLISH_TTS_CONFIG || (runtime ? resolve(root, runtime.config) : join(root, 'deployment/kokoro/settings.json')),
    ENGLISH_WORDBOOKS_DIR: env.ENGLISH_WORDBOOKS_DIR || join(root, "deployment/vocabulary/books"),
  };
}
