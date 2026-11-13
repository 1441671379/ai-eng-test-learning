import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTencentSettings, protectTencentCredentials, publicTencentSettings, resetTencentSettings, saveTencentSettings } from "../../src/lib/experiments/tencent-comparison/credentials.ts";
import { tencentRequest } from "../../src/lib/experiments/tencent-comparison/tencent.ts";

test("page credential validation rejects incomplete pairs and invalid AppID without writing anything", async () => {
  const root = await mkdtemp(join(tmpdir(), "soe-credentials-validation-"));
  try {
    for (const input of [{ appId: "account" }, { appId: "123", secretId: "id" }, { secretKey: "key" }, { secretId: 123, secretKey: "key" }, { secretId: "with space", secretKey: "key" }, {}]) {
      await assert.rejects(saveTencentSettings(root, "learner", input, {}));
    }
    assert.equal((await loadTencentSettings(root, "learner", {})).source, "none");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("Windows DPAPI keeps page credentials encrypted, private per learner, and immediately usable without echo", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "soe-credentials-roundtrip-"));
  const env = { ENGLISH_TENCENT_SOE_SECRET_ID: "environment-id", ENGLISH_TENCENT_SOE_SECRET_KEY: "environment-key", ENGLISH_TENCENT_SOE_APP_ID: "business-id", ENGLISH_TENCENT_SOE_TOKEN: "environment-token" };
  try {
    const text = 'dummy-secret-汉字-$();"';
    const cipher = await protectTencentCredentials(text); assert.notEqual(cipher, text); assert.equal(await protectTencentCredentials(cipher, true), text);
    const original = await loadTencentSettings(root, "a", env); assert.equal(original.source, "environment");
    const saved = await saveTencentSettings(root, "a", { appId: "1300000000", secretId: "page-dummy-id", secretKey: "page-dummy-key" }, env);
    assert.equal(saved.source, "saved"); assert.equal(saved.configured, true); assert.equal(saved.appId, "1300000000");
    assert.equal(saved.hasSecretId, true); assert.equal(saved.hasSecretKey, true); assert.doesNotMatch(JSON.stringify(saved), /page-dummy-id|page-dummy-key/);
    const path = join(root, "settings", "tencent-soe", createHash("sha256").update("a").digest("hex") + ".json");
    const raw = await readFile(path, "utf8"); assert.doesNotMatch(raw, /page-dummy|1300000000/); assert.ok(JSON.parse(raw).protectedCredentials);
    const reloaded = await loadTencentSettings(root, "a", env); assert.equal(reloaded.config.secretId, "page-dummy-id"); assert.equal(reloaded.config.secretKey, "page-dummy-key");
    // A new page-supplied credential pair must not inherit another account's token/business id.
    assert.equal(reloaded.config.token, ""); assert.equal(reloaded.config.soeAppId, "");
    assert.equal(tencentRequest("test", "session", reloaded.config).parameters.SoeAppId, undefined);
    assert.equal((await loadTencentSettings(root, "b", {})).config.configured, false);
    const kept = await saveTencentSettings(root, "a", { appId: "1300000001", secretId: "", secretKey: "" }, env);
    assert.equal(kept.appId, "1300000001"); assert.equal((await loadTencentSettings(root, "a", env)).config.secretKey, "page-dummy-key");
    assert.doesNotMatch(JSON.stringify(await publicTencentSettings(root, "a")), /page-dummy-id|page-dummy-key/);
    await writeFile(path, '{"version":1,"protectedCredentials":"invalid"}');
    const broken = await loadTencentSettings(root, "a", env); assert.equal(broken.config.configured, false); assert.ok(broken.storageError);
    assert.equal(broken.config.secretKey, ""); // Never silently use environment credentials after a decryption failure.
    await saveTencentSettings(root, "a", { appId: "1300000000", secretId: "replacement-id", secretKey: "replacement-key" }, env);
    assert.equal((await loadTencentSettings(root, "a", env)).config.secretKey, "replacement-key");
    await resetTencentSettings(root, "a"); assert.equal((await loadTencentSettings(root, "a", env)).source, "environment");
  } finally { await rm(root, { recursive: true, force: true }); }
});
