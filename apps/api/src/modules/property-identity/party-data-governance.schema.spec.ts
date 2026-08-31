import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(
  __dirname, "../../../../../database/migrations/000287_party_consent_retention_rights_foundation.sql"
), "utf8");
const service = readFileSync(resolve(__dirname, "party-data-governance.service.ts"), "utf8");

test("000287 maps legacy consent without fabricating provenance", () => {
  assert.match(migration, /'pending_evidence', 'consent',[\s\S]*'legacy_unknown', party\.consent_status/u);
  assert.match(migration, /notice_version IS NULL[\s\S]*effective_at IS NULL[\s\S]*operator_id IS NULL/u);
  assert.doesNotMatch(migration, /party\.consent_status='granted'[\s\S]*effective_at/u);
  assert.match(migration, /party consent facts are append-only/u);
});

test("000287 separates retention categories, legal hold, and rights outcomes", () => {
  for (const category of ["submission", "snapshot", "identity_photo", "protected_audit"]) {
    assert.match(migration, new RegExp(`'${category}'`, "u"));
  }
  assert.match(migration, /pending_legal_review/u);
  assert.match(migration, /biz_party_identity_legal_hold/u);
  assert.match(migration, /biz_party_data_subject_request/u);
  assert.match(migration, /processing_restricted/u);
  assert.match(migration, /legacy_unknown'[\s\S]*pending_classification/u);
});

test("000287 derives photo retention from the file and enrolls all protected identity audit sources", () => {
  const photoTrigger = migration.slice(
    migration.indexOf("fn_party_identity_photo_assign_retention"),
    migration.indexOf("trg_party_identity_draft_file_retention")
  );
  assert.match(photoTrigger, /FROM public\.sys_file/u);
  assert.match(photoTrigger, /id=NEW\.file_id/u);
  assert.doesNotMatch(photoTrigger, /party_id,create_time INTO party_value,object_time/u);

  for (const source of [
    "biz_party_identity_assignment_audit",
    "biz_party_identity_decision",
    "sys_op_log"
  ]) {
    assert.match(migration, new RegExp(`FROM public\\.${source}`, "u"));
  }
  assert.match(migration, /trg_party_identity_assignment_audit_retention/u);
  assert.match(migration, /trg_party_identity_decision_retention/u);
  assert.match(migration, /trg_party_identity_op_log_retention/u);
  assert.match(migration, /op\.biz_id::text ~\*/u);
  assert.match(migration, /NEW\.biz_id::text ~\*/u);
  assert.match(service, /COALESCE\(audit\.create_time,assignment_audit\.occurred_at,decision\.create_time\)/u);
});

test("identity processing restriction is consumed by writes, domain projections, and evidence access", () => {
  const identityService = readFileSync(resolve(__dirname, "property-identity.service.ts"), "utf8");
  const partyService = readFileSync(resolve(
    __dirname, "../property-operations/parties.service.ts"
  ), "utf8");
  const fileAccess = readFileSync(resolve(__dirname, "../files/file-business-access.service.ts"), "utf8");
  assert.match(identityService, /assertProcessingAllowed/u);
  assert.match(identityService, /party\.processing_restricted_at IS NULL/u);
  assert.match(partyService, /if \(!applyProjection\)[\s\S]*processing_restricted_at IS NULL/u);
  assert.match(partyService, /builder\.andWhere\("party\.processing_restricted_at IS NULL"\)/u);
  assert.equal((fileAccess.match(/party\.processing_restricted_at IS NULL/gu) ?? []).length, 3);
});

test("governance commands keep audit retention and writes tenant-park scoped", () => {
  assert.match(service, /if \(!retentionPartyId\) return/u);
  assert.doesNotMatch(service, /test\(bizId\)/u);
  assert.match(service, /WHERE tenant_id=\$1 AND park_id=\$2 AND id=\$3::uuid/u);
  assert.match(service, /release_reason_code=\$6/u);
  assert.match(service, /reasonCode: dto\.reason_code/u);
  assert.match(service, /SELECT \$1::varchar,\$2::varchar,\$3::uuid,'protected_audit'/u);
  assert.match(service, /policy\.tenant_id=\$1::varchar AND policy\.park_id=\$2::varchar/u);
});

test("retention policy read is side-effect free and defaults remain legally unapproved", () => {
  const method = service.slice(
    service.indexOf("async getRetentionPolicy"),
    service.indexOf("updateRetentionPolicy")
  );
  assert.match(method, /SELECT \* FROM public\.biz_party_identity_retention_policy/u);
  assert.doesNotMatch(method, /INSERT INTO/u);
  assert.match(method, /legal_review_status: "pending_legal_review"/u);
  assert.match(method, /persisted: false/u);
});

test("governance replays bind the request body and legal holds resume due work", () => {
  assert.match(migration, /request_hash varchar\(64\) NOT NULL/u);
  assert.match(service, /Idempotency key was reused with a different request/u);
  assert.match(service, /createHash\("sha256"\)/u);
  assert.match(service, /Legal-hold object does not belong to the Party/u);
  assert.match(service, /assignment\.state='held'/u);
  assert.match(service, /NOT EXISTS \(SELECT 1 FROM public\.biz_party_identity_legal_hold active_hold/u);
  assert.match(service, /requestedActions/u);
});
