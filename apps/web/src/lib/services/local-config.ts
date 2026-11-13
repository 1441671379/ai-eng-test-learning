import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Read on each request so a recovered backend can change port without restarting the web app. */
export function localModelPort(): number | null {
  const root = process.env.ENGLISH_APP_ROOT;
  if (!root || process.env.ENGLISH_PACKAGED_RUNTIME === "1") return null;
  try {
    const port: unknown = JSON.parse(readFileSync(join(root, "deployment/service-ports.json"), "utf8").replace(/^\uFEFF/, "")).model;
    return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
  } catch { return null; }
}
