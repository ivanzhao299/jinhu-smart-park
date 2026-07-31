import assert from "node:assert/strict";
import test from "node:test";
import { resolveSubmittedPhotoFileIds } from "./safety-inspect-task-check-in.logic";

test("omitted check-in photos preserve existing safety evidence", () => {
  assert.deepEqual(resolveSubmittedPhotoFileIds(undefined, ["existing-file"]), ["existing-file"]);
  assert.deepEqual(resolveSubmittedPhotoFileIds(undefined, undefined), []);
});

test("explicit check-in photo arrays retain replacement semantics", () => {
  assert.deepEqual(resolveSubmittedPhotoFileIds([], ["existing-file"]), []);
  assert.deepEqual(resolveSubmittedPhotoFileIds(["replacement-file"], ["existing-file"]), ["replacement-file"]);
});

test("omitted result photos preserve an existing result but default new results to empty", () => {
  assert.deepEqual(resolveSubmittedPhotoFileIds(undefined, ["existing-result-file"]), ["existing-result-file"]);
  assert.deepEqual(resolveSubmittedPhotoFileIds(undefined, null), []);
});
