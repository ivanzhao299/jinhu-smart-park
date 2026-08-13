import { randomUUID } from "node:crypto";
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
let sequence = 0;

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

function key(action) {
  sequence += 1;
  return `housing-api-e2e-${action}-${runId}-${sequence}`;
}

async function request(path, { token, idempotent = false, idempotencyKey, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = idempotencyKey ?? key(options.method ?? "request");
  if (options.body && !(options.body instanceof FormData)) {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  console.log(`[PASS] ${options.method ?? "GET"} ${path} (${response.status})`);
  return unwrap(body);
}

async function expectRequestStatus(path, expectedStatus, { token, idempotent = false, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = key(options.method ?? "request");
  if (options.body && !(options.body instanceof FormData)) {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  assert(response.status === expectedStatus, `${options.method ?? "GET"} ${path} rejects with ${expectedStatus}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

async function uploadSignature(token, leaseId) {
  const form = new FormData();
  form.append("biz_type", "housing_lease_signature");
  form.append("biz_id", leaseId);
  form.append("file", new Blob([
    Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
  ], { type: "application/pdf" }), `housing-lease-${runId}.pdf`);
  return request("/files", { method: "POST", token, idempotent: true, body: form });
}

function repairImageForm(leaseId, bizType = "housing_repair") {
  const form = new FormData();
  form.append("biz_type", bizType);
  form.append("biz_id", leaseId);
  form.append("file", new Blob([Buffer.from("housing-repair-image")], { type: "image/png" }), `repair-${runId}.png`);
  return form;
}

async function uploadRepairImage(token, leaseId, bizType = "housing_repair") {
  const form = repairImageForm(leaseId, bizType);
  return request("/files", { method: "POST", token, idempotent: true, body: form });
}

async function uploadHandoverImage(token, leaseId, handoverType) {
  const form = new FormData();
  form.append("biz_type", `housing_handover_${handoverType}`);
  form.append("biz_id", leaseId);
  form.append(
    "file",
    new Blob([Buffer.from(`housing-handover-${handoverType}`)], { type: "image/png" }),
    `handover-${handoverType}-${runId}.png`
  );
  return request("/files", { method: "POST", token, idempotent: true, body: form });
}

async function uploadPendingPurchaseReceipt(token) {
  const form = new FormData();
  form.append("biz_type", "housing_purchase");
  form.append(
    "file",
    new Blob([Buffer.from("housing-purchase-receipt")], { type: "image/png" }),
    `purchase-receipt-${runId}.png`
  );
  return request("/files", { method: "POST", token, idempotent: true, body: form });
}

async function payReceivable(token, leaseId, receivable) {
  const outstanding = Number(receivable.amount) - Number(receivable.paidAmount) - Number(receivable.waivedAmount);
  if (outstanding <= 0.005) return;
  await request(`/housing/leases/${leaseId}/ledger`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      receivable_id: receivable.id,
      entry_type: "payment",
      charge_type: receivable.chargeType,
      amount: outstanding.toFixed(2),
      payment_method: "bank_transfer",
      transaction_reference: `E2E-${runId}`,
      reason: "真实 API E2E 人工收款核销"
    }
  });
}

async function run() {
  console.log(`[INFO] Housing API E2E ${runId} against ${apiBaseUrl}`);
  const login = await request("/auth/login", {
    method: "POST",
    body: { tenantId, parkId, username, password }
  });
  const token = login.accessToken;
  assert(typeof token === "string" && token.length > 0, "authenticated through the real login API");
  assert(approverUsername && approverPassword, "separated approval credentials are configured");
  const approverLogin = await request("/auth/login", {
    method: "POST",
    body: { tenantId, parkId, username: approverUsername, password: approverPassword }
  });
  const approverToken = approverLogin.accessToken;
  assert(typeof approverToken === "string" && approverToken.length > 0, "authenticated a separate approval actor");

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  let startDate = start.toISOString().slice(0, 10);
  let endDate = end.toISOString().slice(0, 10);
  const unitList = await request("/park-units?page=1&page_size=100", { token });
  let unit = process.env.HOUSING_UNIT_ID
    ? unitList.items.find((item) => item.id === process.env.HOUSING_UNIT_ID)
    : null;
  if (!unit) {
    for (const candidate of unitList.items) {
      const candidateOperation = await request(`/property/units/${candidate.id}/operation`, { token });
      if (candidateOperation.configuredMode !== "long_rent") continue;
      for (let yearOffset = 0; yearOffset < 5; yearOffset += 1) {
        const candidateStart = new Date(start);
        candidateStart.setUTCFullYear(candidateStart.getUTCFullYear() + yearOffset);
        const candidateEnd = new Date(candidateStart);
        candidateEnd.setUTCFullYear(candidateEnd.getUTCFullYear() + 1);
        const candidateStartDate = candidateStart.toISOString().slice(0, 10);
        const candidateEndDate = candidateEnd.toISOString().slice(0, 10);
        const availability = await request("/property/occupancies/availability", {
          method: "POST",
          token,
          idempotent: true,
          body: {
            unitId: candidate.id,
            startAt: `${candidateStartDate}T00:00:00+08:00`,
            endAt: `${candidateEndDate}T23:59:59+08:00`
          }
        });
        if (availability.available) {
          unit = candidate;
          startDate = candidateStartDate;
          endDate = candidateEndDate;
          break;
        }
      }
      if (unit) break;
    }
  }
  assert(Boolean(unit?.id), "selected an actual operating unit");

  const currentOperation = await request(`/property/units/${unit.id}/operation`, { token });
  await request(`/property/units/${unit.id}/operation`, {
    method: "PUT",
    token,
    idempotent: true,
    body: { version: currentOperation.version, operating_status: "enabled", remark: "Housing real API E2E" }
  });
  const operation = await request(`/property/units/${unit.id}/operation`, { token });
  assert(operation.configuredMode === "long_rent", "selected unit retains its explicit long-rent fixture mode");

  await expectRequestStatus("/property/occupancies", 403, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      unit_id: unit.id,
      source_domain: "housing_rental",
      source_type: "housing_lease",
      source_id: crypto.randomUUID(),
      start_at: `${startDate}T00:00:00+08:00`,
      end_at: `${endDate}T00:00:00+08:00`,
      status: "active",
      remark: "generic route must not forge a housing occupancy"
    }
  });

  await expectRequestStatus("/housing/tenants", 400, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      party_type: "person",
      display_name: `非法已核验租客 ${runId}`,
      identity_document_type: "id_card",
      identity_number: `11010519900101${String(Date.now()).slice(-4)}`,
      verification_status: "verified",
      consent_status: "granted"
    }
  });

  const tenant = await request("/housing/tenants", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      party_type: "person",
      display_name: `住房租客 ${runId}`,
      mobile: `13${String(Date.now()).slice(-9)}`,
      identity_document_type: "id_card",
      identity_number: `11010519900101${String(Date.now()).slice(-4)}`,
      consent_status: "granted"
    }
  });
  const identityWithLowercaseCheckDigit = `11010519900101${String(Date.now()).slice(-3)}x`;
  const updatedTenant = await request(`/property/parties/${tenant.id}`, {
    method: "PUT",
    token,
    idempotent: true,
    body: { identity_number: identityWithLowercaseCheckDigit }
  });
  assert(updatedTenant.verificationStatus === "unverified", "identity-only update resets Party verification");
  const updatedTenantDetail = await request(`/property/parties/${tenant.id}`, { token });
  assert(
    updatedTenantDetail.identityNumber === identityWithLowercaseCheckDigit.toUpperCase(),
    "identity-only update uses the persisted type and returns the canonical ID-card value"
  );
  await expectRequestStatus(`/property/parties/${tenant.id}`, 400, {
    method: "PUT",
    token,
    idempotent: true,
    body: { identity_number: "not-an-id-card" }
  });
  await expectRequestStatus("/property/parties/roles", 400, {
    method: "POST",
    token,
    idempotent: true,
    body: { party_id: tenant.id, role_type: "   " }
  });

  const lease = await request("/housing/leases", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      lease_code: `HL-E2E-${runId}`.slice(0, 64),
      unit_id: unit.id,
      tenant_party_id: tenant.id,
      start_date: startDate,
      end_date: endDate,
      payment_cycle_months: 1,
      billing_day: 1,
      monthly_rent: "2500",
      deposit_amount: "2500",
      first_due_date: startDate,
      tail_period_rule: "prorate"
    }
  });
  const leasePage = await request("/housing/leases?page=1&page_size=100", { token });
  const listedLease = leasePage.items.find((item) => item.id === lease.id);
  assert(listedLease?.unitCode === unit.unitCode, "lease list owns its stable unit code");
  assert(listedLease?.unitName === unit.unitName, "lease list owns its stable unit name");
  assert(listedLease?.tenantDisplayName === tenant.displayName, "lease list owns its stable tenant label");

  await request(`/housing/leases/${lease.id}/submit`, { method: "POST", token, idempotent: true });
  const leaseApproval = await request(`/housing/leases/${lease.id}/approve`, {
    method: "POST",
    token,
    idempotent: true,
    body: { approval_note: "真实 API E2E 审批通过" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: leaseApproval, label: "lease approval" });
  const signature = await uploadSignature(token, lease.id);
  await request(`/housing/leases/${lease.id}/sign`, {
    method: "POST",
    token,
    idempotent: true,
    body: { signature_file_id: signature.id }
  });
  await expectRequestStatus(`/files/${signature.id}`, 409, {
    method: "DELETE",
    token,
    idempotent: true
  });
  await request(`/housing/leases/${lease.id}/activate`, { method: "POST", token, idempotent: true });
  await request(`/housing/leases/${lease.id}/occupants`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      party_id: tenant.id,
      occupant_role: "cohabitant",
      emergency_contact: false
    }
  });
  const occupantDetail = await request(`/housing/leases/${lease.id}`, { token });
  const listedOccupant = occupantDetail.occupants.find((item) => item.partyId === tenant.id);
  assert(
    listedOccupant?.partyDisplayName === tenant.displayName,
    "lease detail owns each persisted occupant display label"
  );

  const propertyChargePlan = await request(`/housing/leases/${lease.id}/charge-plans`, {
    method: "PUT",
    token,
    idempotent: true,
    body: { charge_type: "property", billing_source: "fixed", cycle_months: 1, amount: "100.00", enabled: true }
  });
  const billEnd = new Date(`${startDate}T00:00:00Z`);
  billEnd.setUTCMonth(billEnd.getUTCMonth() + 1);
  await request(`/housing/leases/${lease.id}/generate-bills`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      charge_plan_id: propertyChargePlan.id,
      period_start: startDate,
      period_end: billEnd.toISOString().slice(0, 10),
      reason: "真实 API E2E 周期账单"
    }
  });
  await expectRequestStatus(`/housing/leases/${lease.id}/generate-bills`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      charge_plan_id: propertyChargePlan.id,
      period_start: startDate,
      period_end: billEnd.toISOString().slice(0, 10),
      reason: "a new request cannot silently reuse an existing billing period"
    }
  });

  const overlappingStart = new Date(`${startDate}T00:00:00Z`);
  overlappingStart.setUTCDate(overlappingStart.getUTCDate() + 10);
  const overlappingEnd = new Date(billEnd);
  overlappingEnd.setUTCDate(overlappingEnd.getUTCDate() + 10);
  await expectRequestStatus(`/housing/leases/${lease.id}/generate-bills`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      charge_plan_id: propertyChargePlan.id,
      period_start: overlappingStart.toISOString().slice(0, 10),
      period_end: overlappingEnd.toISOString().slice(0, 10),
      reason: "overlapping billing period must be rejected"
    }
  });

  const activatedDetail = await request(`/housing/leases/${lease.id}`, { token });
  const depositReceivable = activatedDetail.receivables.find((item) => item.chargeType === "deposit");
  assert(depositReceivable, "lease activation creates a deposit receivable");
  const depositReceipt = await request(`/housing/leases/${lease.id}/ledger`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      receivable_id: depositReceivable.id,
      entry_type: "payment",
      charge_type: "deposit",
      amount: "2500.00",
      payment_method: "bank_transfer",
      reason: "真实 API E2E 押金收取"
    }
  });
  assert(
    depositReceipt.entryType === "deposit_receipt",
    "deposit receivable payment is normalized to a deposit receipt"
  );

  await expectRequestStatus("/files", 403, {
    method: "POST",
    token,
    idempotent: true,
    body: repairImageForm(randomUUID())
  });
  const wrongLeaseRepairImage = await uploadRepairImage(token, lease.id, "workorder_create");
  const repairImage = await uploadRepairImage(token, lease.id);
  const repairPayload = {
    title: `水龙头漏水 ${runId}`,
    description: "运营人员根据租客电话代录，需要维修人员上门处理。",
    priority: "medium",
    urgency: "normal",
    image_file_ids: [repairImage.id]
  };
  await expectRequestStatus(`/housing/leases/${lease.id}/repairs`, 400, {
    method: "POST",
    token,
    idempotent: true,
    body: { ...repairPayload, image_file_ids: [wrongLeaseRepairImage.id] }
  });
  const repairKey = `housing-api-e2e-repair-replay-${runId}`;
  const repairHeaders = { "x-idempotency-key": repairKey };
  const pendingRepairDetail = await request(`/housing/leases/${lease.id}`, { token });
  assert(
    pendingRepairDetail.pending_repair_files.some((file) => file.id === repairImage.id),
    "lease detail returns unconsumed repair evidence from one server snapshot"
  );
  const repair = await request(`/housing/leases/${lease.id}/repairs`, {
    method: "POST", token, headers: repairHeaders, body: repairPayload
  });
  const replay = await request(`/housing/leases/${lease.id}/repairs`, {
    method: "POST", token, headers: repairHeaders, body: repairPayload
  });
  assert(repair.id === replay.id, "repair creation replays safely with one work order");

  let detail = await request(`/housing/leases/${lease.id}`, { token });
  assert(detail.repairs.some((item) => item.id === repair.id), "lease detail exposes the linked repair work order");
  assert(
    detail.pending_repair_files.every((file) => file.id !== repairImage.id),
    "work-order-bound repair evidence is excluded from the next repair draft"
  );
  await expectRequestStatus(`/housing/leases/${lease.id}/repairs`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: { ...repairPayload, title: `重复附件 ${runId}` }
  });
  const workOrder = await request(`/work-orders/${repair.id}`, { token });
  assert(
    workOrder.sourceType === "tenant_request" && workOrder.sourceId === lease.id && workOrder.unitId === unit.id,
    "work order keeps lease source and unit linkage"
  );

  const pendingPurchaseReceipt = await uploadPendingPurchaseReceipt(token);
  const pendingPurchaseFiles = await request("/files?biz_type=housing_purchase&page=1&page_size=100", { token });
  assert(
    pendingPurchaseFiles.items.some((item) => item.id === pendingPurchaseReceipt.id && item.bizId === null),
    "purchase uploader can recover their own pending receipt"
  );

  const purchase = await request("/housing/purchases", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      unit_id: unit.id,
      vendor_name: "E2E 维修耗材供应商",
      purchase_date: startDate,
      cost_category: "repair",
      receipt_file_ids: [pendingPurchaseReceipt.id],
      items: [
        { item_name: "维修软管", quantity: "1", unit: "根", unit_price: "35" },
        { item_name: "密封耗材", quantity: "0.004", unit: "批", unit_price: "36.25" }
      ]
    }
  });
  const purchaseApproval = await request(`/housing/purchases/${purchase.id}/actions`, {
    method: "POST", token, idempotent: true, body: { action: "approve", reason: "E2E 审批" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: purchaseApproval, label: "purchase approval" });
  const purchasePayment = await request(`/housing/purchases/${purchase.id}/actions`, {
    method: "POST", token, idempotent: true, body: { action: "pay", reason: "E2E 人工付款登记" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: purchasePayment, label: "purchase payment" });
  const purchaseDetail = await request(`/housing/purchases/${purchase.id}`, { token });
  const firstTransferRequest = await request(`/housing/purchases/${purchase.id}/transfer`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      lease_id: lease.id,
      item_ids: [purchaseDetail.items[0].id],
      due_date: startDate,
      reason: "租客责任维修耗材受控转收费"
    }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: firstTransferRequest, label: "first purchase transfer" });
  let transferLeaseDetail = await request(`/housing/leases/${lease.id}`, { token });
  const firstTransferReceivable = transferLeaseDetail.receivables.find((item) => item.chargeType === "purchase_recharge");
  assert(Boolean(firstTransferReceivable), "first purchase transfer creates the tenant receivable");
  const secondTransferRequest = await request(`/housing/purchases/${purchase.id}/transfer`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      lease_id: lease.id,
      item_ids: [purchaseDetail.items[1].id],
      due_date: startDate,
      reason: "后续采购明细追加转收费"
    }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: secondTransferRequest, label: "second purchase transfer" });
  transferLeaseDetail = await request(`/housing/leases/${lease.id}`, { token });
  const secondTransferReceivable = transferLeaseDetail.receivables.find((item) => item.chargeType === "purchase_recharge");
  assert(firstTransferReceivable.id === secondTransferReceivable?.id, "partial transfers reuse one source receivable");
  assert(Number(secondTransferReceivable?.amount) === 35.15, "later transferred items accumulate into the receivable");
  const transferredPurchasePage = await request("/housing/purchases?page=1&page_size=100", { token });
  const transferredPurchase = transferredPurchasePage.items.find((item) => item.id === purchase.id);
  assert(
    transferredPurchase?.transferredItemCount === 2,
    "purchase list projects transferred item count for authoritative action gating"
  );
  assert(
    transferredPurchase?.receiptFiles?.some((file) => file.id === pendingPurchaseReceipt.id),
    "purchase list keeps bound receipt evidence visible after creation"
  );
  await expectRequestStatus(`/housing/purchases/${purchase.id}/actions`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: { action: "void", reason: "transferred purchases cannot be voided" }
  });
  await expectRequestStatus(`/housing/purchases/${purchase.id}/actions`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: { action: "refund", reason: "transferred purchases cannot be refunded" }
  });

  detail = await request(`/housing/leases/${lease.id}`, { token });
  for (const receivable of detail.receivables) await payReceivable(token, lease.id, receivable);
  const moveOutPhoto = await uploadHandoverImage(token, lease.id, "move_out");
  detail = await request(`/housing/leases/${lease.id}`, { token });
  assert(
    detail.pending_handover_files.move_out.some((file) => file.id === moveOutPhoto.id),
    "lease detail restores the pending move-out evidence under its exact handover type"
  );
  await request(`/housing/leases/${lease.id}/handovers`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      handover_type: "move_out",
      item_snapshot: [{ description: "现场物品验收完成", checked: true }],
      meter_readings: [{ type: "electricity", reading: 100 }],
      credentials: [{ type: "door_card", returned: 2 }],
      photo_file_ids: [moveOutPhoto.id],
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00",
      remark: "真实 API E2E 退租交割"
    }
  });
  detail = await request(`/housing/leases/${lease.id}`, { token });
  const completedMoveOut = detail.handovers.find((handover) => handover.handoverType === "move_out");
  assert(
    completedMoveOut?.photo_files.some((file) => file.id === moveOutPhoto.id),
    "completed handover detail exposes its immutable evidence snapshot"
  );
  assert(
    detail.pending_handover_files.move_out.every((file) => file.id !== moveOutPhoto.id),
    "completed handover evidence is excluded from the next handover draft"
  );
  await expectRequestStatus(`/housing/leases/${lease.id}/ledger`, 400, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      entry_type: "deposit_deduction",
      charge_type: "deposit",
      amount: "1.00",
      reason: "manual deposit deductions are forbidden"
    }
  });
  await expectRequestStatus(`/housing/leases/${lease.id}/checkout`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "押金尚未退还时不得完成退租" }
  });
  const depositRefundRequest = await request(`/housing/leases/${lease.id}/ledger`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      receivable_id: depositReceivable.id,
      entry_type: "refund",
      charge_type: "deposit",
      amount: "2500.00",
      payment_method: "bank_transfer",
      reason: "真实 API E2E 押金退还"
    }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: depositRefundRequest, label: "deposit refund" });
  const financePage = await request(`/housing/finance?page=1&page_size=100`, { token });
  const refundedFinance = financePage.items.find((item) => item.lease.id === lease.id);
  assert(
    Number(refundedFinance?.summary?.deposit_balance) === 0,
    "approved deposit refund clears the deposit balance without reopening the settled receivable"
  );
  const checkoutRequest = await request(`/housing/leases/${lease.id}/checkout`, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "真实 API E2E 退租结清" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: checkoutRequest, label: "lease checkout" });
  const terminated = await request(`/housing/leases/${lease.id}`, { token });
  assert(terminated.status === "terminated", "approved checkout terminates the lease");
  await expectRequestStatus(`/housing/leases/${lease.id}/ledger`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      receivable_id: depositReceivable.id,
      entry_type: "refund",
      charge_type: "deposit",
      amount: "1.00",
      reason: "terminated lease is immutable"
    }
  });
  await expectRequestStatus(`/housing/leases/${lease.id}/occupants`, 409, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      party_id: tenant.id,
      occupant_role: "cohabitant",
      emergency_contact: false
    }
  });
  await expectRequestStatus(`/housing/leases/${lease.id}/charge-plans`, 409, {
    method: "PUT",
    token,
    idempotent: true,
    body: {
      charge_type: "property",
      billing_source: "fixed",
      cycle_months: 1,
      amount: "101.00",
      enabled: true
    }
  });
  assert(terminated.status === "terminated", "tenant-to-checkout real API workflow completed");
  console.log(`[PASS] Housing rental real API E2E completed: lease=${lease.id}, workOrder=${repair.id}`);
}

run().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
