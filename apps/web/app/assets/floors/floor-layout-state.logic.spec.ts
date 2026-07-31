import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  applyCommittedFloorLayout,
  clearCommittedFloorLayout
} from "./floor-layout-state.logic";

const floor = {
  id: "floor-1",
  floorName: "一层",
  layoutFileId: "file-1",
  layoutUrl: "/files/file-1"
};

test("committed layout deletion clears the matching floor projection immediately", () => {
  assert.deepEqual(
    clearCommittedFloorLayout(floor, "floor-1", "file-1"),
    {
      ...floor,
      layoutFileId: null,
      layoutUrl: null
    }
  );
});

test("layout deletion leaves another floor projection unchanged", () => {
  assert.equal(
    clearCommittedFloorLayout(floor, "floor-2", "file-1"),
    floor
  );
});

test("committed upload replaces the matching floor projection immediately", () => {
  assert.deepEqual(
    applyCommittedFloorLayout(floor, "floor-1", "file-2", "/files/file-2"),
    {
      ...floor,
      layoutFileId: "file-2",
      layoutUrl: "/files/file-2"
    }
  );
});

test("committed upload leaves another floor projection unchanged", () => {
  assert.equal(
    applyCommittedFloorLayout(floor, "floor-2", "file-2", "/files/file-2"),
    floor
  );
});

test("deleting an older file does not clear a newer replacement layout", () => {
  const replacement = applyCommittedFloorLayout(
    floor,
    "floor-1",
    "file-2",
    "/files/file-2"
  );

  assert.equal(
    clearCommittedFloorLayout(replacement, "floor-1", "file-1"),
    replacement
  );
});

test("floor page reconciles every owner projection before the follow-up refresh", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const handler = page.slice(
    page.indexOf("function handleLayoutDeleted"),
    page.indexOf("\n  return (")
  );

  assert.match(handler, /setPageData/);
  assert.match(handler, /setLayoutTarget/);
  assert.match(handler, /setDetail/);
  assert.ok(
    handler.indexOf("setPageData") < handler.indexOf("void load"),
    "committed owner projections must be reconciled before refresh"
  );
});

test("floor page reconciles uploads before the follow-up refresh", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const handler = page.slice(
    page.indexOf("function handleLayoutUploaded"),
    page.indexOf("\n  function handleLayoutDeleted")
  );

  assert.match(handler, /setPageData/);
  assert.match(handler, /setLayoutTarget/);
  assert.match(handler, /setDetail/);
  assert.ok(
    handler.indexOf("setPageData") < handler.indexOf("void load"),
    "committed upload projections must be reconciled before refresh"
  );
});
