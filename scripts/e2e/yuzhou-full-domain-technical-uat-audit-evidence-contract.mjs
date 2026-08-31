import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const runner = readFileSync(resolve(root, "scripts/hr-cutover/run-full-domain-technical-uat.mjs"), "utf8");

test("legacy role evidence derives audit rows from all isolated UAT actors instead of one item target", () => {
  assert.match(runner, /after=auditFacts\(item\.legacyId,allAuditRows\(config,vars\)\)/u);
  assert.doesNotMatch(runner, /auditTargets=new Map/u);
  assert.match(runner, /actorByUsername\.get\(row\.username\)/u);
  assert.match(runner, /routeMatches\(candidate\.routeTemplate,row\.path\)/u);
  assert.match(runner, /expectedAuditBizIdByOperationKey=new Map\(\)/u);
  assert.match(runner, /if\(!auditBizIdSha256\)continue/u);
  assert.match(runner, /expectedAuditBizIdByOperationKey\.get\(operationKeySha256\)!==bizIdSha256/u);
  assert.doesNotMatch(runner, /TECHNICAL_UAT_AUDIT_EVIDENCE_INCOMPLETE/u);
});
