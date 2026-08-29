#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const DOMAIN_CONTRACT = Object.freeze({
  accept: ["candidate", "dbo.accept"], family: ["family", "dbo.family"], his: ["experience", "dbo.his"], knowhow: ["skill", "dbo.knowhow"], ticket: ["credential", "dbo.ticket"],
  person_core: ["employee_profile_raw", "dbo.person.core_residue"], person_user: ["employee_profile_raw", "dbo.person_user.core_residue"], person_user_item: ["employee_profile_raw", "dbo.person_user_item.core_residue"],
  readjust: ["employment_change_raw", "dbo.readjust.core_residue"], readjustitem: ["employment_change_raw", "dbo.readjustitem.core_residue"], jobstatecode: ["employment_change_raw", "dbo.jobstatecode.core_residue"],
  compact: ["contract_raw", "dbo.compact.core_residue"], compact_c: ["contract_raw", "dbo.compact_c.core_residue"], compacttypecode: ["contract_raw", "dbo.compacttypecode.core_residue"],
  photo: ["employee_file", "dbo.person.photo"], docs: ["employee_file", "dbo.docs"], course: ["training", "dbo.course"], train: ["training", "dbo.train"], trainhis: ["training", "dbo.trainhis"], jobtrain: ["training", "dbo.jobtrain"],
  bonuscode: ["reward", "dbo.bonuscode"], bonusrecord: ["reward", "dbo.bonusrecord"], jch_1: ["reward", "dbo.jch_1"]
});

const fail = detail => { throw new Error(`T5_STAGE_DOMAIN_ITEMS_INVALID: ${detail}`); };

export function t5DomainBatchItemsFromManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || !manifest.domains || typeof manifest.domains !== "object" || Array.isArray(manifest.domains)) fail("manifest domains");
  const expected = Object.keys(DOMAIN_CONTRACT).sort(), actual = Object.keys(manifest.domains).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("manifest domain set");
  return expected.map(name => {
    const item = manifest.domains[name], [domain, sourceObject] = DOMAIN_CONTRACT[name];
    if (!item || typeof item !== "object" || item.sourceObject !== sourceObject || !Number.isInteger(item.rows) || item.rows < 0 || !SHA256.test(item.fileSha256 ?? "")) fail(`manifest domain ${name}`);
    if (!["present", "empty", "absent"].includes(item.objectStatus) || ((item.rows === 0) !== (item.objectStatus !== "present"))) fail(`manifest object status ${name}`);
    return { domain, sourceObject, extractedCount: item.rows, checksumSha256: item.fileSha256, status: item.rows === 0 ? "skipped" : "running" };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv.length !== 3) fail("exactly one manifest path required");
  process.stdout.write(JSON.stringify(t5DomainBatchItemsFromManifest(JSON.parse(readFileSync(resolve(process.argv[2]), "utf8")))));
}
