import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CHECKPOINTS,
  REQUIRED_OWNER_CONSTRAINTS,
  REQUIRED_OWNER_TRIGGERS,
  REQUIRED_MIGRATIONS,
  migrationSetHash,
  parseArgs,
  runReconcile
} from "./track-b-final-reconcile.mjs";

test("freezes the complete forward Track B migration set and ordered B4 checkpoints", () => {
  assert.equal(REQUIRED_MIGRATIONS.length, 14);
  assert.deepEqual(REQUIRED_MIGRATIONS.map((name) => name.slice(0, 6)), [
    "000185","000186","000187","000188","000189","000200","000191",
    "000192","000193","000194","000195","000197","000198","000209"
  ]);
  assert.deepEqual(CHECKPOINTS.map(([kind]) => kind), [
    "backfill","change_capture","mutation_replay","shadow_compare","reconcile","constraint_validate"
  ]);
  assert.match(migrationSetHash(), /^[0-9a-f]{64}$/u);
  assert.equal(Object.keys(REQUIRED_OWNER_CONSTRAINTS).length, 23);
  assert.deepEqual(REQUIRED_OWNER_CONSTRAINTS.fk_homestay_turnover_booking_scope, {
    table: "biz_homestay_turnover_task", type: "f",
    localColumns: ["tenant_id","park_id","booking_id","unit_id"],
    referencedTable: "biz_homestay_booking",
    referencedColumns: ["tenant_id","park_id","id","unit_id"]
  });
  assert.equal(Object.keys(REQUIRED_OWNER_TRIGGERS).length, 4);
});

test("fails closed without database authority and rejects output outside the repository", async () => {
  await assert.rejects(() => runReconcile({ connectionString: "" }), /DATABASE_URL is required/u);
  assert.throws(() => parseArgs(["--output", "/tmp/report.json"]), /inside the repository/u);
  assert.deepEqual(parseArgs(["--dry-run"]), { output: null, dryRun: true });
});

test("keeps every hard-difference family and atomic checkpoint write in the executable", () => {
  const source = readFileSync(resolve("scripts/property-remediation/migration/track-b-final-reconcile.mjs"), "utf8");
  for (const token of [
    "activeIdentityDuplicates","verifiedIdentityWithoutSnapshot","illegalApprovalStatusPair",
    "staleExecutingApproval","activeTaskDuplicates","taskProjectionScopeDrift",
    "eventInboxScopeDrift","openMigrationAnomalies","validateTrackBConstraints",
    "MVP owner constraint catalog drift","MVP owner trigger catalog drift",
    "convalidated","tgenabled","VALIDATE CONSTRAINT","pg_advisory_xact_lock","rollbackProbe","rpo: 0",
    "BEGIN","COMMIT","ROLLBACK","openP0P1"
  ]) assert.match(source, new RegExp(token));
});
