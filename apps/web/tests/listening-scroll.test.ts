import test from "node:test";
import assert from "node:assert/strict";
import { listeningPlayerCompact } from "../src/lib/listening-scroll.ts";

test("player collapse keeps native anchoring from immediately expanding it again", () => {
  assert.equal(listeningPlayerCompact(false, -97), true);
  assert.equal(listeningPlayerCompact(true, -97 + 82), true);
  assert.equal(listeningPlayerCompact(true, 17), false);
  assert.equal(listeningPlayerCompact(false, 17 - 82), false);
});

test("small wheel changes around the sticky boundary keep the current player state", () => {
  for (const offset of [-10, -1, 0, 1, 10]) {
    assert.equal(listeningPlayerCompact(false, offset), false);
    assert.equal(listeningPlayerCompact(true, offset), true);
  }
  assert.equal(listeningPlayerCompact(false, -200), true);
  assert.equal(listeningPlayerCompact(true, 100), false);
});
