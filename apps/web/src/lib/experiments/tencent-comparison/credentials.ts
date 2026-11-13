import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ExperimentError } from "../types";
import { publicTencentConfig, tencentConfig } from "./tencent";

type Credentials = { appId: string; secretId: string; secretKey: string; token: string; soeAppId: string };
const STORAGE_ERROR = "无法使用当前 Windows 账户读取已保存的腾讯配置。请重新填写 SECRET_ID 和 SECRET_KEY 后保存。";
const writes = new Map<string, Promise<unknown>>();
const credentialPath = (root: string, userId: string) => join(root, "settings", "tencent-soe", createHash("sha256").update(userId).digest("hex") + ".json");

/** Windows DPAPI CurrentUser, matching the product's existing model-key protection.
 * Payload travels through stdin, never process arguments or shell interpolation.
 */
export function protectTencentCredentials(value: string, decrypt = false): Promise<string> {
  if (process.platform !== "win32") throw new ExperimentError("页面保存腾讯密钥需要 Windows 本机账户加密；其他系统请使用服务端环境变量。", 422);
  const operation = decrypt
    ? "$bytes=[Convert]::FromBase64String($inputValue);$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))"
    : "$bytes=[Text.Encoding]::UTF8.GetBytes($inputValue);$cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($cipher))";
  const script = "$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;$inputValue=[Console]::In.ReadToEnd();" + operation;
  return new Promise((resolve, reject) => {
    const child = execFile("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024, encoding: "utf8" }, (error, stdout) => {
      if (error || !stdout) reject(new ExperimentError(decrypt ? STORAGE_ERROR : "腾讯配置加密失败，请重试。", 503));
      else resolve(stdout);
    });
    child.stdin?.on("error", () => undefined); child.stdin?.end(value);
  });
}
function credentialsFromConfig(config: ReturnType<typeof tencentConfig>): Credentials {
  return { appId: config.appId, secretId: config.secretId, secretKey: config.secretKey, token: config.token, soeAppId: config.soeAppId };
}
async function savedCredentials(path: string): Promise<Credentials | null> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (raw.length > 32_000) throw new Error("Invalid credentials file");
  const envelope = JSON.parse(raw);
  if (envelope?.version !== 1 || typeof envelope.protectedCredentials !== "string") throw new Error("Invalid credentials file");
  const value = JSON.parse(await protectTencentCredentials(envelope.protectedCredentials, true));
  if (!value || !["appId", "secretId", "secretKey", "token", "soeAppId"].every(key => typeof value[key] === "string" && value[key].length <= 4096)) throw new Error("Invalid credentials file");
  return value as Credentials;
}
export async function loadTencentSettings(root: string, userId: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  let saved: Credentials | null;
  try { saved = await savedCredentials(credentialPath(root, userId)); }
  catch { return { config: tencentConfig({}), source: "saved" as const, storageError: STORAGE_ERROR }; }
  if (!saved) return { config: tencentConfig(env), source: env.ENGLISH_TENCENT_SOE_SECRET_ID || env.ENGLISH_TENCENT_SOE_SECRET_KEY ? "environment" as const : "none" as const, storageError: null };
  return { config: tencentConfig({ ENGLISH_TENCENT_SOE_SECRET_ID: saved.secretId, ENGLISH_TENCENT_SOE_SECRET_KEY: saved.secretKey,
    ENGLISH_TENCENT_SOE_ACCOUNT_APP_ID: saved.appId, ENGLISH_TENCENT_SOE_TOKEN: saved.token, ENGLISH_TENCENT_SOE_APP_ID: saved.soeAppId,
    ENGLISH_TENCENT_SOE_SCORE_COEFF: env.ENGLISH_TENCENT_SOE_SCORE_COEFF, ENGLISH_TENCENT_SOE_PROTOCOL: env.ENGLISH_TENCENT_SOE_PROTOCOL }), source: "saved" as const, storageError: null };
}
export async function publicTencentSettings(root: string, userId: string) {
  const value = await loadTencentSettings(root, userId);
  return publicTencentConfig(value.config, value);
}
async function serialized<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const running = (writes.get(path) || Promise.resolve()).catch(() => undefined).then(operation); writes.set(path, running);
  try { return await running; } finally { if (writes.get(path) === running) writes.delete(path); }
}
export async function saveTencentSettings(root: string, userId: string, input: Record<string, unknown>, env: Readonly<Record<string, string | undefined>> = process.env) {
  const field = (name: string, max: number) => {
    const value = input[name] ?? "";
    if (typeof value !== "string" || value.length > max || /\s/.test(value.trim())) throw new ExperimentError(`${name} 格式无效。`);
    return value.trim();
  };
  const appId = field("appId", 20), secretId = field("secretId", 512), secretKey = field("secretKey", 512);
  if (appId && !/^\d+$/.test(appId)) throw new ExperimentError("AppID 应为腾讯控制台中的数字账号标识。");
  if (!appId && env.ENGLISH_TENCENT_SOE_PROTOCOL !== "http") throw new ExperimentError("WebSocket 口语评测需要填写 AppID。");
  if (Boolean(secretId) !== Boolean(secretKey)) throw new ExperimentError("更换密钥时，请同时填写 SECRET_ID 和 SECRET_KEY；两项均留空可保留已有密钥。");
  const path = credentialPath(root, userId);
  return serialized(path, async () => {
    const previous = await loadTencentSettings(root, userId, env);
    if (!secretId && (previous.storageError || !previous.config.secretId || !previous.config.secretKey)) throw new ExperimentError("请填写 SECRET_ID 和 SECRET_KEY。");
    const value: Credentials = secretId ? { appId, secretId, secretKey, token: "", soeAppId: "" } : { ...credentialsFromConfig(previous.config), appId };
    const encrypted = await protectTencentCredentials(JSON.stringify(value));
    await mkdir(dirname(path), { recursive: true });
    const temporary = path + "." + randomUUID() + ".tmp";
    try { await writeFile(temporary, JSON.stringify({ version: 1, protectedCredentials: encrypted }), { flag: "wx", mode: 0o600 }); await rename(temporary, path); }
    finally { await unlink(temporary).catch(() => undefined); }
    const config = tencentConfig({ ENGLISH_TENCENT_SOE_SECRET_ID: value.secretId, ENGLISH_TENCENT_SOE_SECRET_KEY: value.secretKey,
      ENGLISH_TENCENT_SOE_ACCOUNT_APP_ID: value.appId, ENGLISH_TENCENT_SOE_TOKEN: value.token, ENGLISH_TENCENT_SOE_APP_ID: value.soeAppId,
      ENGLISH_TENCENT_SOE_SCORE_COEFF: env.ENGLISH_TENCENT_SOE_SCORE_COEFF, ENGLISH_TENCENT_SOE_PROTOCOL: env.ENGLISH_TENCENT_SOE_PROTOCOL });
    return publicTencentConfig(config, { source: "saved" });
  });
}
export async function resetTencentSettings(root: string, userId: string) {
  const path = credentialPath(root, userId);
  return serialized(path, async () => { await unlink(path).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); return publicTencentSettings(root, userId); });
}
