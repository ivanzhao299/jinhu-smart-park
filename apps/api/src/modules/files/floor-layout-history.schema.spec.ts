import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../../../database/migrations/000183_floor_layout_deleted_file_backfill.sql"
  ),
  "utf8"
);

test("floor layout history repair clears references to soft-deleted files", () => {
  assert.match(migration, /UPDATE biz_floor AS floor/);
  assert.match(migration, /FROM sys_file AS layout_file/);
  assert.match(migration, /floor\.layout_file_id = layout_file\.id/);
  assert.match(migration, /layout_file\.is_deleted = true/);
  assert.match(migration, /SET layout_file_id = NULL,\s+layout_url = NULL/);
});

test("floor layout history repair preserves active file references and deleted floors", () => {
  assert.doesNotMatch(migration, /layout_file\.is_deleted\s*=\s*false/);
  assert.match(migration, /floor\.is_deleted = false/);
});
