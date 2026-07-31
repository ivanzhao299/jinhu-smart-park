import assert from "node:assert/strict";
import test from "node:test";
import { resolveCheckInPhotoFileIds } from "./safety-inspect-task-check-in.logic";

test("omitted check-in photos preserve existing safety evidence", () => {
  assert.deepEqual(resolveCheckInPhotoFileIds(undefined, ["existing-file"]), ["existing-file"]);
  assert.deepEqual(resolveCheckInPhotoFileIds(undefined, undefined), []);
});

test("explicit check-in photo arrays retain replacement semantics", () => {
  assert.deepEqual(resolveCheckInPhotoFileIds([], ["existing-file"]), []);
  assert.deepEqual(resolveCheckInPhotoFileIds(["replacement-file"], ["existing-file"]), ["replacement-file"]);
});
