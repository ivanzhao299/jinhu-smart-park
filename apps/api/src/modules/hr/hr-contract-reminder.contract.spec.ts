import assert from "node:assert/strict";import {readFileSync} from "node:fs";import {resolve} from "node:path";import {test} from "node:test";
const root=process.cwd().endsWith("/apps/api")?resolve(process.cwd(),"../.."):process.cwd(),read=(p:string)=>readFileSync(resolve(root,p),"utf8");
test("P0-4 contract chain and reminder contracts are fail closed",()=>{
 const migration=read("database/migrations/000277_hr_contract_chain_reminder.sql"),service=read("apps/api/src/modules/hr/hr-contract-reminder.service.ts"),extractor=read("scripts/extract-yuzhou-t2-contracts.sh"),loader=read("scripts/load-yuzhou-t2-contracts.sh"),rollback=read("scripts/rollback-yuzhou-t2-contracts.sh");
 for(const value of ["cumulative_term_months","first_signature_date","last_signature_date","renewal_count","legacy_source_identity_sha256","hr_contract_legacy_evidence","hr_contract_reminder_policy","hr_contract_reminder_outbox","recipient_user_id","dedupe_key"])assert.match(migration,new RegExp(value));
 assert.match(migration,/uq_hr_contract_reminder_recipient UNIQUE/);assert.match(service,/ON CONFLICT\(tenant_id,park_id,dedupe_key\)DO NOTHING/);assert.match(service,/cancelStale/);assert.match(service,/recordHrSensitiveRead/);
 assert.match(loader,/legacy_source_identity_sha256,legacy_source_row_sha256/);assert.match(loader,/previous_start_date,previous_end_date/);assert.match(rollback,/DELETE FROM hr_contract_reminder_outbox[\s\S]*DELETE FROM hr_contract_reminder[\s\S]*DELETE FROM hr_contract_change/);
 assert.match(extractor,/legacyFileLocatorSha256/);assert.match(extractor,/legacyTextSha256/);assert.doesNotMatch(extractor,/AS legacyFilePath|AS compactText/);
 assert.doesNotMatch(migration,/absolute_path|compacttext\s+text/iu);
});
