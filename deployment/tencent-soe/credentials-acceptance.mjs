// Isolated HTTP check. Only dummy credentials are saved; no Tencent request is made.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const origin = process.env.SOE_QA_ORIGIN || "http://127.0.0.1:3011", endpoint = `${origin}/api/experiments/tencent-comparison/config`;
const profile = id => encodeURIComponent(JSON.stringify({ id, displayName: "Tencent configuration QA", practiceFocus: "conversations", practiceCadence: "15-minutes", createdAt: "2026-10-27T00:00:00.000Z", onboardingCompleted: true }));
const headers = { Cookie: `english_local_profile=${profile("tencent-credentials-qa")}`, Origin: origin, "Content-Type": "application/json" };
const dummy = { appId: "1300000000", secretId: "qa-dummy-secret-id", secretKey: "qa-dummy-secret-key" };
const privateValues = /qa-dummy-secret-id|qa-dummy-secret-key/;
const send = (method, body, extra = {}) => fetch(endpoint, { method, headers: { ...headers, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal((await send("PUT", dummy, { Origin: "http://untrusted.invalid" })).status, 403);
  assert.equal((await send("PUT", { appId: "1300000000", secretId: "one-half" })).status, 400);
  const response = await send("PUT", dummy); assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json(); assert.equal(saved.config.configured, true); assert.equal(saved.config.source, "saved"); assert.doesNotMatch(JSON.stringify(saved), privateValues);
  const loadedResponse = await send("GET"); assert.equal(loadedResponse.headers.get("cache-control"), "no-store");
  const loaded = await loadedResponse.json(); assert.equal(loaded.config.appId, dummy.appId); assert.equal(loaded.config.hasSecretId, true); assert.equal(loaded.config.hasSecretKey, true); assert.doesNotMatch(JSON.stringify(loaded), privateValues);
  const overview = await (await fetch(`${origin}/api/experiments/tencent-comparison`, { headers })).json(); assert.equal(overview.config.source, "saved"); assert.doesNotMatch(JSON.stringify(overview), privateValues);
  const other = await (await send("GET", null, { Cookie: `english_local_profile=${profile("other-tencent-credentials-qa")}` })).json(); assert.equal(other.config.source, "none"); assert.equal(other.config.hasSecretKey, false);
  const keep = await send("PUT", { appId: "1300000001", secretId: "", secretKey: "" }); assert.equal(keep.status, 200); assert.equal((await keep.json()).config.hasSecretKey, true);
  assert.equal((await send("DELETE", null, { Origin: "http://untrusted.invalid" })).status, 403);
  const cleared = await send("DELETE"); assert.equal(cleared.status, 200); assert.equal((await cleared.json()).config.source, "none");
  const result = { date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }), dummyCredentialsOnly: true, calledTencent: false, passed: true,
    cases: ["authentication", "same-origin save/reset", "paired key validation", "encrypted save", "masked GET/overview", "reload", "learner isolation", "blank preserves existing pair", "clear restores environment"] };
  const directory = new URL("./artifacts/", import.meta.url); await mkdir(directory, { recursive: true }); await writeFile(new URL("credentials-acceptance.json", directory), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await send("DELETE"); }
