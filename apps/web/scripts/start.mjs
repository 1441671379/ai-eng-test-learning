import { spawn } from "node:child_process";
import { access, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { applicationEnvironment } from "./app-env.mjs";

const web = fileURLToPath(new URL("../", import.meta.url));
const standalone = join(web, ".next/standalone");
await access(join(standalone, "server.js"));
// Next's standalone output intentionally omits these assets. Copy only web assets.
await cp(join(web, "public"), join(standalone, "public"), { recursive: true });
await cp(join(web, ".next/static"), join(standalone, ".next/static"), { recursive: true });
const child = spawn(process.execPath, [join(standalone, "server.js")], {
  cwd: standalone, stdio: "inherit", windowsHide: true,
  env: { ...applicationEnvironment(), NODE_ENV: "production", ENGLISH_LOCAL_HTTP: "1", HOSTNAME: "127.0.0.1", PORT: process.env.PORT || "3000" },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
