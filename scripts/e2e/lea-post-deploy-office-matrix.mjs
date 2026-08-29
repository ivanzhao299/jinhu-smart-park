#!/usr/bin/env node

import { requirePropertyApiE2eIsolation } from "./property-api-e2e-safety.mjs";

requirePropertyApiE2eIsolation();

const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:13001/api/v1";
const scope = { tenantId: process.env.TENANT_ID ?? "10000001", parkId: process.env.PARK_ID ?? "20000001" };

for (const name of ["BROWSER_UAT_USERNAME", "BROWSER_UAT_PASSWORD", "APPROVER_USERNAME", "APPROVER_PASSWORD"]) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const login = async (username, password) => {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...scope, username, password })
  });
  const body = await response.json();
  if (!body?.data?.accessToken) throw new Error(`Login failed for ${username}: ${response.status}`);
  return body.data.accessToken;
};

const request = async (token, path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": options.key ?? crypto.randomUUID()
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const raw = await response.json().catch(() => null);
  return { status: response.status, data: raw?.data, raw };
};

const adminToken = await login(process.env.BROWSER_UAT_USERNAME, process.env.BROWSER_UAT_PASSWORD);
const approverToken = await login(process.env.APPROVER_USERNAME, process.env.APPROVER_PASSWORD);
const unitList = await request(adminToken, "/park-units?page=1&page_size=100");
const sourceUnit = unitList.data?.items?.[0];
if (!sourceUnit) throw new Error("No source unit available for the isolated fixture");

const unitCode = `LEAOFFICE${Date.now()}`.slice(0, 32);
const created = await request(adminToken, "/park-units", {
  method: "POST",
  body: {
    unitCode,
    buildingId: sourceUnit.buildingId,
    floorId: sourceUnit.floorId,
    unitName: "LEA UAT 办公长租房源",
    usageType: 10,
    unitArea: 88,
    useArea: 80,
    rentalStatus: 10,
    fittingStatus: 10,
    status: 1,
    remark: "LEA UAT isolated office matrix"
  }
});
if (created.status !== 201) throw new Error(`Office unit create failed: ${created.status} ${JSON.stringify(created.raw)}`);
const unitId = created.data.id;

const operation = await request(adminToken, `/property/units/${unitId}/operation`);
if (operation.status !== 200) throw new Error(`Operation baseline failed: ${operation.status}`);
if (operation.data.operatingStatus !== "enabled") {
  const configured = await request(adminToken, `/property/units/${unitId}/operation`, {
    method: "PUT",
    body: { version: operation.data.version, operating_status: "enabled", remark: "LEA UAT office matrix" }
  });
  if (configured.status !== 200) throw new Error(`Operation configure failed: ${configured.status}`);
}

const submission = await request(adminToken, `/property/units/${unitId}/mode-transitions`, {
  method: "POST",
  body: { target_mode: "long_rent", reason: "LEA UAT office long-rent matrix" }
});
if (submission.status !== 201) throw new Error(`Long-rent transition failed: ${submission.status} ${JSON.stringify(submission.raw)}`);
const requestId = submission.data?.request?.requestId ?? submission.data?.requestId;
if (!requestId) throw new Error("Long-rent transition did not return a request ID");

let detail = await request(approverToken, `/property/approvals/${requestId}`);
const stage = detail.data?.stages?.find((candidate) => candidate.stageStatus === "pending");
if (!stage) throw new Error("Long-rent transition has no pending approval stage");
const decisionKey = crypto.randomUUID();
const decision = await request(approverToken, `/property/approvals/${requestId}/decisions`, {
  method: "POST",
  key: decisionKey,
  body: {
    clientKey: decisionKey,
    decision: "approve",
    reason: "LEA UAT office mode approval",
    stageId: stage.stageId,
    expectedStageVersion: stage.version,
    expectedRequestVersion: detail.data.request.decisionVersion
  }
});
if (decision.status !== 201) throw new Error(`Long-rent approval failed: ${decision.status}`);
for (let attempt = 0; attempt < 120; attempt += 1) {
  detail = await request(approverToken, `/property/approvals/${requestId}`);
  if (detail.data?.request?.executionStatus === "executed") break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (detail.data?.request?.executionStatus !== "executed") {
  throw new Error(`Long-rent approval execution ended as ${detail.data?.request?.executionStatus}`);
}

const candidates = await request(
  adminToken,
  `/housing/unit-candidates?usage_type=10&keyword=${encodeURIComponent(unitCode)}&page=1&page_size=100`
);
const officeCandidate = candidates.data?.items?.find((candidate) => candidate.id === unitId);
if (!officeCandidate?.eligible || officeCandidate.rental_segment !== "office") {
  throw new Error(`Office candidate assertion failed: ${JSON.stringify(officeCandidate)}`);
}
const rejected = await request(adminToken, `/property/units/${unitId}/mode-transitions`, {
  method: "POST",
  body: { target_mode: "short_stay", reason: "LEA UAT office short-stay rejection" }
});
const expectedRejectionMessage = "Unit usage is not allowed for target operating mode";
if (rejected.status !== 409 || rejected.raw?.message !== expectedRejectionMessage) {
  throw new Error(`Office short-stay rejection mismatch: ${rejected.status} ${String(rejected.raw?.message)}`);
}

console.log(JSON.stringify({
  status: "PASS",
  office_unit_id: unitId,
  create_status: created.status,
  long_rent_transition_status: submission.status,
  long_rent_execution: detail.data.request.executionStatus,
  candidate_status: candidates.status,
  candidate: {
    usage_type: officeCandidate.usage_type,
    rental_segment: officeCandidate.rental_segment,
    eligible: officeCandidate.eligible,
    ineligible_reasons: officeCandidate.ineligible_reasons
  },
  short_stay_status: rejected.status,
  short_stay_message: rejected.raw?.message,
  short_stay_reasons: rejected.raw?.data?.blocking_reasons ?? rejected.raw?.blocking_reasons ?? []
}, null, 2));
