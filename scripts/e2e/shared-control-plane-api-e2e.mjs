import { requirePropertyApiE2eIsolation } from "./property-api-e2e-safety.mjs";
import { approveAndWait } from "./property-api-e2e-approval.mjs";

requirePropertyApiE2eIsolation();

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const approverUsername = process.env.APPROVER_USERNAME;
const approverPassword = process.env.APPROVER_PASSWORD;
const runId = process.env.TEST_RUN_ID;
const requestTimeoutMs = 10000;
let sequence = 0;

const unwrap = (body) => body && typeof body === "object" && "data" in body ? body.data : body;
const key = (action) => `shared-control-${action}-${runId}-${++sequence}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
};

function createRequestSignal(externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  };
}

async function request(path, { token, expectedStatus, idempotent = false, idempotencyKey, ...options } = {}) {
  const { signal, cleanup } = createRequestSignal(options.signal);
  const headers = { ...(options.headers ?? {}) };
  try {
    if (token) headers.authorization = `Bearer ${token}`;
    if (idempotent) headers["x-idempotency-key"] = idempotencyKey ?? key(options.method ?? "request");
    if (options.body) {
      headers["content-type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers, signal });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    if (expectedStatus !== undefined) {
      assert(response.status === expectedStatus, `${options.method ?? "GET"} ${path} returns ${expectedStatus}`);
      return unwrap(body);
    }
    if (!response.ok) {
      throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
    }
    console.log(`[PASS] ${options.method ?? "GET"} ${path} (${response.status})`);
    return unwrap(body);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${options.method ?? "GET"} ${path} timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    cleanup();
  }
}

async function createOperatingUnit(token, suffix) {
  const parks = await request("/assets/parks?page=1&page_size=100", { token });
  const assetPark = parks.items.find((item) => item.parkId === parkId) ?? parks.items[0];
  assert(assetPark?.id, "resolved the scoped physical asset park");
  const building = await request("/assets/buildings", {
    method: "POST", token, idempotent: true,
    body: { assetParkId: assetPark.id, buildingCode: `M03B${suffix}`, buildingName: `M03楼栋-${suffix}`, floorCount: 1, status: "enabled" }
  });
  const floor = await request("/assets/floors", {
    method: "POST", token, idempotent: true,
    body: { buildingId: building.id, floorCode: `M03F${suffix}`, floorName: `M03楼层-${suffix}`, floorNo: 1, status: "enabled" }
  });
  const assetUnit = await request("/assets/units", {
    method: "POST", token, idempotent: true,
    body: { floorId: floor.id, unitCode: `M03U${suffix}`, unitName: `M03房源-${suffix}`, unitNo: `M03-${suffix}`, buildingArea: 60, rentableArea: 50, status: "enabled" }
  });
  await request(`/assets/buildings/${building.id}/operating-building`, {
    method: "POST", token, idempotent: true, body: { mode: "create", reason: `M-03 ${runId}` }
  });
  await request(`/assets/floors/${floor.id}/operating-floor`, {
    method: "POST", token, idempotent: true, body: { mode: "create", reason: `M-03 ${runId}` }
  });
  const operatingUnit = await request(`/assets/units/${assetUnit.id}/operating-unit`, {
    method: "POST", token, idempotent: true,
    body: { usageType: 10, rentalStatus: 10, fittingStatus: 10, reason: `M-03 ${runId}` }
  });
  return { assetUnit, operatingUnit };
}

async function rejectApproval(token, submission, label) {
  const requestId = submission?.request?.requestId ?? submission?.requestId;
  assert(typeof requestId === "string", `${label} returns a pending approval request`);
  const detail = await request(`/property/approvals/${requestId}`, { token });
  const stage = detail.stages.find((candidate) => candidate.stageStatus === "pending");
  assert(Boolean(stage), `${label} exposes a pending approval stage`);
  const clientKey = key(`reject-${label}`);
  await request(`/property/approvals/${requestId}/decisions`, {
    method: "POST", token, idempotent: true, idempotencyKey: clientKey,
    body: {
      clientKey,
      decision: "reject",
      reason: `Shared control-plane negative path: ${label}`,
      stageId: stage.stageId,
      expectedStageVersion: stage.version,
      expectedRequestVersion: detail.request.decisionVersion
    }
  });
  const rejected = await request(`/property/approvals/${requestId}`, { token });
  assert(rejected.request.decisionStatus === "rejected", `${label} remains rejected without executing its domain effect`);
  return rejected;
}

async function decideIdentity({ makerToken, checkerToken, party, decision }) {
  const submissionId = party.identitySummary?.currentSubmissionId;
  assert(typeof submissionId === "string", "Party creation owns a draft identity submission");
  const draft = await request(`/property/identity-submissions/${submissionId}`, { token: makerToken });
  const submitKey = key(`identity-submit-${decision}`);
  const submitted = await request(`/property/identity-submissions/${submissionId}/submit`, {
    method: "POST", token: makerToken, idempotent: true, idempotencyKey: submitKey,
    body: { clientKey: submitKey, expectedVersion: draft.version }
  });
  const makerClaimKey = key("identity-maker-claim");
  await request(`/property/identity-submissions/${submissionId}/claim`, {
    method: "POST", token: makerToken, idempotent: true, expectedStatus: 403,
    idempotencyKey: makerClaimKey,
    body: { clientKey: makerClaimKey, expectedVersion: submitted.version, expectedAssignmentVersion: submitted.assignmentVersion }
  });
  const claimKey = key(`identity-claim-${decision}`);
  const claimed = await request(`/property/identity-submissions/${submissionId}/claim`, {
    method: "POST", token: checkerToken, idempotent: true, idempotencyKey: claimKey,
    body: { clientKey: claimKey, expectedVersion: submitted.version, expectedAssignmentVersion: submitted.assignmentVersion }
  });
  const decisionKey = key(`identity-decision-${decision}`);
  const decided = await request(`/property/identity-submissions/${submissionId}/decisions`, {
    method: "POST", token: checkerToken, idempotent: true, idempotencyKey: decisionKey,
    body: {
      clientKey: decisionKey,
      decision,
      expectedVersion: claimed.version,
      expectedAssignmentVersion: claimed.assignmentVersion,
      reason: `Shared control-plane identity ${decision} path`
    }
  });
  assert(decided.status === decision, `identity submission reaches ${decision}`);
  return decided;
}

async function run() {
  console.log(`[INFO] Shared control-plane API E2E ${runId} against ${apiBaseUrl}`);
  const login = await request("/auth/login", { method: "POST", body: { tenantId, parkId, username, password } });
  const token = login.accessToken;
  assert(typeof token === "string" && token.length > 0, "authenticated the shared-control-plane maker");
  assert(approverUsername && approverPassword, "separated approval credentials are configured");
  const approverLogin = await request("/auth/login", {
    method: "POST", body: { tenantId, parkId, username: approverUsername, password: approverPassword }
  });
  const approverToken = approverLogin.accessToken;
  assert(typeof approverToken === "string" && approverToken.length > 0, "authenticated a separate checker/approver");

  const suffix = String(runId).replaceAll(/[^a-zA-Z0-9]/g, "").slice(-18);
  const { operatingUnit } = await createOperatingUnit(token, suffix);
  const operation = await request(`/property/units/${operatingUnit.id}/operation`, { token });
  assert(operation.configuredMode === "none", "new operating projection starts outside downstream business modes");

  const startAt = new Date(Date.now() + 60_000).toISOString();
  const endAt = new Date(Date.now() + 3_600_000).toISOString();
  const holdExpiresAt = new Date(Date.now() + 1_800_000).toISOString();
  const occupancy = await request("/property/occupancies", {
    method: "POST", token, idempotent: true,
    body: {
      unit_id: operatingUnit.id,
      source_domain: "operations",
      source_type: "shared_control_plane_e2e",
      source_id: `m03-${suffix}`,
      start_at: startAt,
      end_at: endAt,
      status: "held",
      hold_expires_at: holdExpiresAt,
      remark: `M-03 ${runId}`
    }
  });
  assert(occupancy.status === "held", "direct shared occupancy creates a bounded hold");
  await request("/property/occupancies", {
    method: "POST", token, idempotent: true, expectedStatus: 409,
    body: {
      unit_id: operatingUnit.id,
      source_domain: "maintenance",
      source_type: "shared_control_plane_overlap",
      source_id: `m03-overlap-${suffix}`,
      start_at: startAt,
      end_at: endAt,
      status: "active"
    }
  });
  const activeOccupancy = await request(`/property/occupancies/${occupancy.id}/activate`, {
    method: "POST", token, idempotent: true
  });
  assert(activeOccupancy.status === "active", "shared occupancy hold activates through its direct endpoint");
  await request(`/property/units/${operatingUnit.id}/mode-transitions`, {
    method: "POST", token, idempotent: true, expectedStatus: 409,
    body: { target_mode: "long_rent", reason: "active operations occupancy must block mode transition" }
  });
  const released = await request(`/property/occupancies/${occupancy.id}/release`, {
    method: "POST", token, idempotent: true, body: { reason: "M-03 direct release", force: false }
  });
  assert(released.status === "released", "shared occupancy releases through its direct lifecycle endpoint");
  await request(`/property/occupancies/${occupancy.id}/activate`, {
    method: "POST", token, idempotent: true, expectedStatus: 409
  });

  const rejectedTransition = await request(`/property/units/${operatingUnit.id}/mode-transitions`, {
    method: "POST", token, idempotent: true,
    body: { target_mode: "long_rent", reason: "M-03 rejection path" }
  });
  const makerDecisionDetail = await request(`/property/approvals/${rejectedTransition.request.requestId}`, { token });
  const makerDecisionStage = makerDecisionDetail.stages.find((candidate) => candidate.stageStatus === "pending");
  assert(Boolean(makerDecisionStage), "mode transition exposes a real pending stage for maker-checker rejection");
  const makerDecisionKey = key("maker-approval-decision");
  await request(`/property/approvals/${rejectedTransition.request.requestId}/decisions`, {
    method: "POST", token, idempotent: true, expectedStatus: 403,
    idempotencyKey: makerDecisionKey,
    body: {
      clientKey: makerDecisionKey,
      decision: "reject",
      reason: "maker cannot decide",
      stageId: makerDecisionStage.stageId,
      expectedStageVersion: makerDecisionStage.version,
      expectedRequestVersion: makerDecisionDetail.request.decisionVersion
    }
  });
  await rejectApproval(approverToken, rejectedTransition, "mode transition rejection");
  const afterRejection = await request(`/property/units/${operatingUnit.id}/operation`, { token });
  assert(afterRejection.configuredMode === "none", "rejected approval does not mutate operating mode");

  const approvedTransition = await request(`/property/units/${operatingUnit.id}/mode-transitions`, {
    method: "POST", token, idempotent: true,
    body: { target_mode: "long_rent", reason: "M-03 approval path" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: approvedTransition, label: "shared mode transition" });
  const afterApproval = await request(`/property/units/${operatingUnit.id}/operation`, { token });
  assert(afterApproval.configuredMode === "long_rent", "approved runtime request executes the shared mode transition");

  const rejectedParty = await request("/property/parties", {
    method: "POST", token, idempotent: true,
    body: { party_type: "person", display_name: `M03 rejected identity ${runId}`, identity_document_type: "passport", identity_number: `R${suffix}`.slice(0, 20), source_domain: "operations" }
  });
  await decideIdentity({ makerToken: token, checkerToken: approverToken, party: rejectedParty, decision: "rejected" });
  const verifiedParty = await request("/property/parties", {
    method: "POST", token, idempotent: true,
    body: { party_type: "person", display_name: `M03 verified identity ${runId}`, identity_document_type: "passport", identity_number: `V${suffix}`.slice(0, 20), source_domain: "operations" }
  });
  await decideIdentity({ makerToken: token, checkerToken: approverToken, party: verifiedParty, decision: "verified" });
  const verifiedDetail = await request(`/property/parties/${verifiedParty.id}`, { token });
  assert(verifiedDetail.verificationStatus === "verified", "verified identity decision projects onto the Party");

  console.log(`[PASS] Shared control-plane API E2E ${runId}`);
}

await run();
