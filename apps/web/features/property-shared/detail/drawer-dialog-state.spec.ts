import assert from "node:assert/strict";
import test from "node:test";
import { resolveDrawerDialogCommand } from "./drawer-dialog-state";

test("drawer lifecycle opens modally and full presentation closes an existing dialog", () => {
  assert.equal(resolveDrawerDialogCommand("drawer", false), "show-modal");
  assert.equal(resolveDrawerDialogCommand("drawer", true), "none");
  assert.equal(resolveDrawerDialogCommand("full", true), "close");
  assert.equal(resolveDrawerDialogCommand("full", false), "none");
});
