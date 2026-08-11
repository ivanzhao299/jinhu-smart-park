import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../../../database/migrations/000199_floor_layout_deleted_file_backfill.sql"
  ),
  "utf8"
);
const migrationAliases = readFileSync(
  resolve(__dirname, "../../../../../database/migration-history-aliases.txt"),
  "utf8"
);
const migrationRunner = readFileSync(
  resolve(__dirname, "../../../../../scripts/db-migrate.sh"),
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

test("floor layout migration rename preserves successful legacy history without rerunning SQL", () => {
  assert.deepEqual(
    migrationAliases
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
    [
      "000183_floor_layout_deleted_file_backfill.sql|000199_floor_layout_deleted_file_backfill.sql|b8187f89e8810abeaac09f7e615e9247335e6a9655550e74886d65b4a2e1bdc3"
    ]
  );
  assert.match(migrationRunner, /reconcile_migration_history_aliases\(\)/u);
  assert.match(migrationRunner, /legacy_history_row" != "succeeded\|\$expected_checksum/u);
  assert.match(migrationRunner, /both legacy and canonical migration history identities exist/u);
  assert.match(migrationRunner, /migration history filename rekeyed; SQL bytes unchanged/u);
  assert.match(migrationRunner, /migration history alias audit marker drifted/u);
  assert.match(migrationRunner, /pg_try_advisory_lock/u);
  assert.match(migrationRunner, /FULL JOIN \$\{STANDARD_HISTORY_TABLE\}/u);
  assert.match(
    migrationRunner,
    /UPDATE \$\{HISTORY_TABLE\}[\s\S]*UPDATE \$\{STANDARD_HISTORY_TABLE\}[\s\S]*COMMIT;/u
  );
  assert.ok(
    migrationRunner.lastIndexOf("reconcile_migration_history_aliases")
      < migrationRunner.lastIndexOf("baseline_nonempty_database_if_needed"),
    "history aliases must be reconciled before baseline and migration execution"
  );
});
