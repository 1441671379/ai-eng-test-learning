import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const legacy = (file: string) => /[\\/]features[\\/]legacy-speaking(?:[\\/]|$)|[\\/]\(legacy-speaking\)(?:[\\/]|$)/.test(file);
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test("retired speaking source is absent and core modules cannot reintroduce dependencies on it", () => {
  for (const path of ["features/legacy-speaking", "app/(dashboard)/(legacy-speaking)", "app/api/(legacy-speaking)"]) {
    assert.equal(existsSync(join(src, path)), false, path);
  }
  const files = sources(src).filter(file => !legacy(file));
  assert.ok(files.length > 100);
  for (const file of files) {
    const imports = readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(|require\s*\(|import\s+)["']([^"']+)["']/g);
    for (const [, specifier] of imports) {
      const target = specifier.startsWith("@/") ? resolve(src, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : specifier;
      assert.equal(legacy(target), false, `${file} depends on legacy implementation ${specifier}`);
    }
  }
});

test("retired pronunciation service and mouth UI are outside the active application", () => {
  const root = resolve(src, "../../..");
  for (const path of ["services/pronunciation", "runtimes/pronunciation", "services/assets/mouths", "services/speech/whisperx_word_worker.py", "deployment/whisperx-runtime.json"]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
  for (const path of ["components/experiments/ExperimentMouth.tsx", "lib/experiments/mouth.ts", "app/api/experiments/mouth/route.ts"]) {
    assert.equal(existsSync(join(src, path)), false, path);
  }
  const timer = readFileSync(join(root, "services/speech/ctc_word_alignment.py"), "utf8");
  assert.doesNotMatch(timer, /^\s*(?:import whisperx|from whisperx|import subprocess|import runpy)/m);
  const launcher = readFileSync(join(root, "Start-LearningApps.ps1"), "utf8");
  assert.doesNotMatch(launcher, /pronunciation-service|runtimes\/pronunciation/);
});
