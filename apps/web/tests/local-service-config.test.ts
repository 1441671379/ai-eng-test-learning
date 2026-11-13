import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localModelPort } from "../src/lib/services/local-config.ts";

test("local service discovery rereads recovered ports, accepts Windows BOM, and leaves packaged runtimes alone", () => {
  const root = mkdtempSync(join(tmpdir(), "english-service-config-"));
  const directory = join(root, "deployment");
  mkdirSync(directory);
  const file = join(directory, "service-ports.json");
  const previousRoot = process.env.ENGLISH_APP_ROOT;
  const previousPackaged = process.env.ENGLISH_PACKAGED_RUNTIME;
  try {
    process.env.ENGLISH_APP_ROOT = root;
    delete process.env.ENGLISH_PACKAGED_RUNTIME;
    assert.equal(localModelPort(), null);
    writeFileSync(file, '\uFEFF{"model":18001}');
    assert.equal(localModelPort(), 18001);
    writeFileSync(file, '{"model":18002}');
    assert.equal(localModelPort(), 18002);
    for (const invalid of ["18002", 0, 65536, 18002.5]) {
      writeFileSync(file, JSON.stringify({ model: invalid }));
      assert.equal(localModelPort(), null);
    }
    writeFileSync(file, '{"model":18002}');
    process.env.ENGLISH_PACKAGED_RUNTIME = "1";
    assert.equal(localModelPort(), null);
    delete process.env.ENGLISH_APP_ROOT;
    assert.equal(localModelPort(), null);
  } finally {
    if (previousRoot === undefined) delete process.env.ENGLISH_APP_ROOT; else process.env.ENGLISH_APP_ROOT = previousRoot;
    if (previousPackaged === undefined) delete process.env.ENGLISH_PACKAGED_RUNTIME; else process.env.ENGLISH_PACKAGED_RUNTIME = previousPackaged;
    unlinkSync(file);
    rmdirSync(directory);
    rmdirSync(root);
  }
});
