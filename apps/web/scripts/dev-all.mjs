import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("Use services/launch.py and pnpm dev on this platform; the all-in-one launcher currently supports Windows.");
if (process.argv.length > 2) throw new Error("dev:all takes no arguments. It starts the shared services and web app using Start-LearningApps.ps1.");
const script = fileURLToPath(new URL("../../../Start-LearningApps.ps1", import.meta.url));
const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: "inherit", windowsHide: true });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
