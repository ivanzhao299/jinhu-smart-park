#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { t5DomainBatchItemsFromManifest } from "../hr-cutover/t5-stage-domain-items.mjs";

const hash = value => value.toString(16).padStart(64, "0");
const sourceObjects = { accept:"dbo.accept",family:"dbo.family",his:"dbo.his",knowhow:"dbo.knowhow",ticket:"dbo.ticket",person_core:"dbo.person.core_residue",person_user:"dbo.person_user.core_residue",person_user_item:"dbo.person_user_item.core_residue",readjust:"dbo.readjust.core_residue",readjustitem:"dbo.readjustitem.core_residue",jobstatecode:"dbo.jobstatecode.core_residue",compact:"dbo.compact.core_residue",compact_c:"dbo.compact_c.core_residue",compacttypecode:"dbo.compacttypecode.core_residue",photo:"dbo.person.photo",docs:"dbo.docs",course:"dbo.course",train:"dbo.train",trainhis:"dbo.trainhis",jobtrain:"dbo.jobtrain",bonuscode:"dbo.bonuscode",bonusrecord:"dbo.bonusrecord",jch_1:"dbo.jch_1" };
const manifest = () => ({ domains: Object.fromEntries(Object.entries(sourceObjects).map(([name, sourceObject], index) => { const rows = name === "jch_1" ? 0 : index + 1; return [name, { sourceObject, rows, fileSha256: hash(index + 1), objectStatus: rows === 0 ? "absent" : "present" }]; })) });

test("T5 batch items use verified manifest hashes instead of stale loader constants", () => {
  const items = t5DomainBatchItemsFromManifest(manifest());
  assert.equal(items.length, 23);
  assert.deepEqual(items.find(item => item.sourceObject === "dbo.family"), { domain:"family",sourceObject:"dbo.family",extractedCount:2,checksumSha256:hash(2),status:"running" });
  assert.deepEqual(items.find(item => item.sourceObject === "dbo.jch_1"), { domain:"reward",sourceObject:"dbo.jch_1",extractedCount:0,checksumSha256:hash(23),status:"skipped" });
});

test("T5 batch item derivation rejects domain-set and source-object drift", () => {
  const missing = manifest(); delete missing.domains.docs;
  assert.throws(() => t5DomainBatchItemsFromManifest(missing), /manifest domain set/);
  const wrongSource = manifest(); wrongSource.domains.family.sourceObject = "dbo.person";
  assert.throws(() => t5DomainBatchItemsFromManifest(wrongSource), /manifest domain family/);
});
