import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/dialog/ConsequenceDialog.tsx"),
  "utf8"
);
const partsSource = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/dialog/ConsequenceDialogParts.tsx"),
  "utf8"
);
const cssSource = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/dialog/ConsequenceDialog.module.css"),
  "utf8"
);
const combinedSource = `${source}\n${partsSource}`;

test("consequence confirmation uses native modal dialog and explicit cancellation", () => {
  assert.match(source, /<dialog/);
  assert.match(source, /\.showModal\(\)/);
  assert.match(source, /onCancel=/);
  assert.match(combinedSource, /autoFocus/);
  assert.match(source, /trigger\?\.focus\(\)/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(cssSource, /min-block-size: 44px/);
  assert.match(cssSource, /min-inline-size: 44px/);
});

test("dialog exposes stable target, outcome, consequences, and reason policy", () => {
  for (const contract of [
    "target: ConsequenceTarget",
    "consequences: readonly string[]",
    "resultingState: string",
    "reasonPolicy: ConsequenceReasonPolicy",
    "actionLabel: string"
  ]) {
    assert.match(source, new RegExp(contract.replace(/[()[\]]/g, "\\$&")));
  }
  assert.match(source, /aria-labelledby=/);
  assert.match(source, /aria-describedby=/);
});

test("focus behavior remains registered for real route browser verification", () => {
  // This source-level contract does not pretend to prove browser focus trapping.
  assert.match(source, /queueMicrotask/);
  assert.match(source, /document\.activeElement/);
});
