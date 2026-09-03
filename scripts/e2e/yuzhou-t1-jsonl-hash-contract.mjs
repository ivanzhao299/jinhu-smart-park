#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const root = mkdtempSync(join(tmpdir(), "yuzhou-t1-jsonl-hash-"));
const stage = join(root, "staging-fixture");

try {
  mkdirSync(stage, { mode: 0o700 }); chmodSync(stage, 0o700);
  const source = {
    legacyId: 1, legacyEventNo: "L001", legacyEventType: "transfer", sourceEffectiveAt: "2026-01-01 00:00:00",
    employeeCode: "E001", beforeOrgCode: null, afterOrgCode: null, beforePositionCode: null, afterPositionCode: null,
    legacyEmployeeState: null, legacyState: null, departmentflag: null, jobflag: null, payflag: null, otherflag: null,
    reason: "contains a literal \\ separator",
  };
  const write = (name, value) => { writeFileSync(join(stage, name), `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(join(stage, name), 0o600); };
  write("employment-event-types.raw.json", [{ sourceValue: "transfer", usageCount: 1 }]);
  write("employment-event-states.raw.json", [{ sourceValue: "effective", usageCount: 1 }]);
  write("employment-events.raw.json", [source]);
  const run = spawnSync(process.execPath, [resolve(import.meta.dirname, "../transform-yuzhou-t1-employment-events.mjs"), stage], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const row = JSON.parse(readFileSync(join(stage, "employment-events.jsonl"), "utf8").trim());
  assert.deepEqual(row.source, source);
  assert.equal(row.sourceRowSha256, sha(canonical(source)));
  assert.equal(row.sourceIdentitySha256, sha("dbo.readjust\0" + "1"));
  console.log("Yuzhou T1 JSONL hash contract passed: escaped characters preserve source-row hashes.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
