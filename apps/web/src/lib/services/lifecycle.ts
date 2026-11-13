import "server-only";
import { getSpeechServiceUrl, getModelServiceUrl } from "./runtime";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { localModelPort } from "./local-config";

const shared = globalThis as typeof globalThis & { sharedServicesStarting?: Promise<void> };
export function localDesktopRoot() {
  // The Windows desktop launcher explicitly configures this directory.
  // Never launch local processes in cloud deployments or against a remote URL.
  if (process.platform !== "win32" || !process.env.ENGLISH_DATA_DIR || process.env.NEXT_PHASE === "phase-production-build") return null;
  if (process.env.ENGLISH_PACKAGED_RUNTIME === "1") return process.env.ENGLISH_DATA_DIR;
  const dataDir = resolve(process.env.ENGLISH_DATA_DIR), root = dirname(dirname(dataDir));
  if (join(root, "deployment", "learning-data").toLowerCase() !== dataDir.toLowerCase()) return null;
  for (const [address, port] of [[getSpeechServiceUrl("web"), "8000"], [getModelServiceUrl("web"), String(localModelPort() || 8001)]]) {
    try {
      const url = new URL(address);
      if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== port) return null;
    } catch { return null; }
  }
  return root;
}
export async function ensureSharedServices() {
  const root = localDesktopRoot();
  if (!root) throw new Error("本地后台自动启动暂不可用，请检查应用启动配置。");
  if (shared.sharedServicesStarting) return shared.sharedServicesStarting;
  const job = (async () => {
    if (await sharedServicesReady()) return;
    if (process.env.ENGLISH_PACKAGED_RUNTIME === "1") throw new Error("发音后台正在恢复，请稍后重新连接；也可以退出软件后重新打开。");
    const script = join(root, "Start-LearningApps.ps1"); await access(script);
    const logs = join(root, "deployment", "logs"); await mkdir(logs, { recursive: true });
    const out = openSync(join(logs, "automatic-start.out.log"), "a"), err = openSync(join(logs, "automatic-start.err.log"), "a");
    let child;
    try {
      child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-App", "services"],
        { cwd: root, windowsHide: true, stdio: ["ignore", out, err] });
    } finally { closeSync(out); closeSync(err); }
    let launchError: Error | undefined;
    child.on("error", error => { launchError = error; }); child.unref();
    const deadline = Date.now() + 150_000;
    do {
      if (await sharedServicesReady()) return;
      if (launchError || child.signalCode || (child.exitCode !== null && child.exitCode !== 0)) throw new Error("后台启动失败，请查看 deployment/logs/automatic-start.err.log。");
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    throw new Error("公共服务启动超时，请查看 deployment/logs 下的服务日志后重试。");
  })();
  shared.sharedServicesStarting = job;
  try { await job; } finally { if (shared.sharedServicesStarting === job) delete shared.sharedServicesStarting; }
}

export async function sharedServicesReady() {
  const states = await Promise.all([`${getSpeechServiceUrl("web")}/health`, `${getModelServiceUrl("web")}/health`, "http://127.0.0.1:9881/docs"].map(async url => {
    try { return (await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2000) })).ok; }
    catch { return false; }
  }));
  return states.every(Boolean);
}
