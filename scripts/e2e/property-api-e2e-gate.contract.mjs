import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const gate = read("scripts/e2e/property-api-e2e-gate.mjs");
const homestay = read("scripts/e2e/homestay-api-e2e.mjs");
const housing = read("scripts/e2e/housing-rental-api-e2e.mjs");
const safety = read("scripts/e2e/property-api-e2e-safety.mjs");
const packageJson = read("package.json");
const ci = read(".github/workflows/ci.yml");
const fixtures = read("scripts/e2e/property-api-e2e-fixtures.sql");

for (const suite of [homestay, housing]) {
  assert.match(suite, /requirePropertyApiE2eIsolation\(\)/, "every mutating property E2E suite must enforce the shared isolation boundary");
}
assert.match(safety, /jinhu_\(\?:property_api_e2e_/, "gate must only allow disposable database names");
assert.match(safety, /loopback API/, "gate must reject shared UAT and production API URLs");
assert.match(safety, /docker.*inspect|execFileSync\("docker", \["inspect"/s, "gate must bind the loopback endpoint to an inspected API container");
assert.match(safety, /POSTGRES_DB does not match/, "gate must bind the inspected API container to the declared disposable database");
assert.match(safety, /PROPERTY_API_E2E_POSTGRES_CONTAINER/, "gate must inspect the disposable PostgreSQL container");
assert.match(safety, /POSTGRES_HOST/, "gate must bind the API container database host to the inspected PostgreSQL container");
assert.match(safety, /postgresAliases\.has\(postgresHost\)/, "gate must reject API containers pointing at an external or shared PostgreSQL host");
assert.match(safety, /TEST_RUN_ID is required/, "each suite must receive a gate-controlled run id");
assert.match(gate, /--suite requires a nonempty suite name/, "gate must reject an empty --suite argument instead of widening scope");
assert.match(gate, /health/, "gate must check API health");
assert.match(gate, /ready/, "gate must check API readiness");
assert.match(packageJson, /test:e2e:property-api/, "package scripts must expose the aggregate property API E2E gate");
assert.match(ci, /Run property API E2E gate/, "release smoke must invoke the real property API E2E gate");
assert.match(ci, /Assert disposable property E2E cleanup/, "release smoke must assert cleanup after the disposable run");
assert.doesNotMatch(ci, /Bootstrap separated property approver/, "release smoke must not create a second bootstrap admin as the approval actor");
assert.match(ci, /Provision disposable property operation fixtures/, "release smoke must provision explicit operation-mode fixtures");
assert.match(fixtures, /PROPERTY_API_E2E_APPROVER/, "fixtures must provision a disposable least-privilege approval role");
assert.match(fixtures, /approver_password_hash/, "fixtures must create a login-capable disposable approver without bootstrap-admin");
assert.match(fixtures, /ON CONFLICT \(tenant_id, code\) WHERE is_deleted = false/, "approver role upsert must match the current tenant-scoped sys_role unique index");
assert.doesNotMatch(fixtures, /ON CONFLICT \(tenant_id, park_id, code\)/, "approver role upsert must not use the retired park-scoped sys_role conflict target");
assert.match(fixtures, /short_stay/, "fixtures must provision a short-stay unit");
assert.match(fixtures, /long_rent/, "fixtures must provision a long-rent unit");
assert.match(fixtures, /biz_party_identity_verification_queue/, "fixtures must provision an identity verification queue");
assert.match(fixtures, /eligibleVerifierUserIds/, "the identity queue must freeze the separated approver eligibility");
for (const dependency of ["auth", "files", "property-approvals", "property-identity", "units", "work-orders"]) {
  assert.match(ci, new RegExp(`modules/\\([^)]*${dependency}`), `release-smoke scope must include ${dependency}`);
}
assert.match(ci, /PROPERTY_API_E2E_POSTGRES_CONTAINER/, "release smoke must pass the disposable PostgreSQL container identity to the property API E2E gate");
assert.match(gate, /AbortController/, "readiness checks must be bounded by a response timeout");
assert.match(gate, /readinessAttempts/, "readiness checks must retry transient startup failures");
assert.match(read("scripts/e2e/property-api-e2e-approval.mjs"), /approvalWaitDeadlineMs = 40000/, "approval polling must enforce a total 40 second deadline");
assert.match(read("scripts/e2e/property-api-e2e-approval.mjs"), /Promise\.race/, "approval detail polling must bound each request");
assert.match(gate, /activeSuite \?\? "gate"/, "preflight failures must be attributed to the gate");
assert.doesNotMatch(gate, /\bfail\(/, "the gate must not call an undefined failure helper");
for (const suite of [homestay, housing]) {
  assert.doesNotMatch(suite, /unit_id: candidate\.id/, "availability checks must use the current camelCase DTO contract");
  assert.match(suite, /unitId: candidate\.id/, "availability checks must send unitId");
  assert.match(suite, /version: currentOperation\.version/, "operation writes must use the current optimistic-concurrency version");
  assert.doesNotMatch(suite, /\.operating_mode/, "operation reads must use the current configuredMode response contract");
}
assert.match(housing, /submission: leaseApproval/, "lease approval must execute before signing");
assert.match(housing, /submission: purchasePayment/, "purchase payment must execute before transfer");
assert.match(housing, /submission: checkoutRequest/, "checkout must execute before terminal assertions");
assert.match(homestay, /submission: futureCancellation/, "homestay cancellation must execute before the suite continues");
assert.match(homestay, /identity-submissions\/\$\{identitySubmissionId\}\/submit/, "identity drafts must be submitted before a separate actor verifies them");
assert.match(homestay, /identity-submissions\/\$\{identitySubmissionId\}\/claim/, "a separate actor must claim submitted identity work before legacy verification");
assert.match(homestay, /token: approverToken,[\s\S]*verification_status: "verified"/, "identity verification must preserve maker-checker separation");

console.log("[PASS] property API E2E gate contract");
