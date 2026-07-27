import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const runId = process.env.TEST_RUN_ID ?? `${Date.now()}-${randomUUID().slice(0, 8)}`;
let sequence = 0;

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

function key(action) {
  sequence += 1;
  return `housing-api-e2e-${action}-${runId}-${sequence}`;
}

async function request(path, { token, idempotent = false, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = key(options.method ?? "request");
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
      amount: outstanding,
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

  const unitList = await request("/park-units?page=1&page_size=100", { token });
  const unit = process.env.HOUSING_UNIT_ID
    ? unitList.items.find((item) => item.id === process.env.HOUSING_UNIT_ID)
    : unitList.items[0];
  assert(Boolean(unit?.id), "selected an actual operating unit");

  await request(`/property/units/${unit.id}/operation`, {
    method: "PUT",
    token,
    idempotent: true,
    body: { operating_status: "enabled", remark: "Housing real API E2E" }
  });
  const operation = await request(`/property/units/${unit.id}/operation`, { token });
  if (operation.operating_mode !== "long_rent") {
    await request(`/property/units/${unit.id}/mode-transitions`, {
      method: "POST",
      token,
      idempotent: true,
      body: { target_mode: "long_rent", reason: "住房出租真实 API E2E" }
    });
  }

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
      verification_status: "unverified",
      consent_status: "granted"
    }
  });

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
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
      monthly_rent: 2500,
      deposit_amount: 2500,
      first_due_date: startDate,
      tail_period_rule: "prorate"
    }
  });

  await request(`/housing/leases/${lease.id}/submit`, { method: "POST", token, idempotent: true });
  await request(`/housing/leases/${lease.id}/approve`, {
    method: "POST",
    token,
    idempotent: true,
    body: { approval_note: "真实 API E2E 审批通过" }
  });
  const signature = await uploadSignature(token, lease.id);
  await request(`/housing/leases/${lease.id}/sign`, {
    method: "POST",
    token,
    idempotent: true,
    body: { signature_file_id: signature.id }
  });
  await request(`/housing/leases/${lease.id}/activate`, { method: "POST", token, idempotent: true });

  await request(`/housing/leases/${lease.id}/charge-plans`, {
    method: "PUT",
    token,
    idempotent: true,
    body: { charge_type: "property", billing_source: "fixed", cycle_months: 1, amount: 100, enabled: true }
  });
  const billEnd = new Date(start);
  billEnd.setUTCMonth(billEnd.getUTCMonth() + 1);
  await request(`/housing/leases/${lease.id}/generate-bills`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      period_start: startDate,
      period_end: billEnd.toISOString().slice(0, 10),
      reason: "真实 API E2E 周期账单"
    }
  });

  await request(`/housing/leases/${lease.id}/ledger`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      entry_type: "deposit_receipt",
      charge_type: "deposit",
      amount: 2500,
      payment_method: "bank_transfer",
      reason: "真实 API E2E 押金收取"
    }
  });

  const repairPayload = {
    title: `水龙头漏水 ${runId}`,
    description: "运营人员根据租客电话代录，需要维修人员上门处理。",
    priority: "medium",
    urgency: "normal"
  };
  const repairKey = `housing-api-e2e-repair-replay-${runId}`;
  const repairHeaders = { "x-idempotency-key": repairKey };
  const repair = await request(`/housing/leases/${lease.id}/repairs`, {
    method: "POST", token, headers: repairHeaders, body: repairPayload
  });
  const replay = await request(`/housing/leases/${lease.id}/repairs`, {
    method: "POST", token, headers: repairHeaders, body: repairPayload
  });
  assert(repair.id === replay.id, "repair creation replays safely with one work order");

  let detail = await request(`/housing/leases/${lease.id}`, { token });
  assert(detail.repairs.some((item) => item.id === repair.id), "lease detail exposes the linked repair work order");
  const workOrder = await request(`/work-orders/${repair.id}`, { token });
  assert(
    workOrder.sourceType === "tenant_request" && workOrder.sourceId === lease.id && workOrder.unitId === unit.id,
    "work order keeps lease source and unit linkage"
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
      items: [{ item_name: "维修软管", quantity: 1, unit: "根", unit_price: 35 }]
    }
  });
  await request(`/housing/purchases/${purchase.id}/actions`, {
    method: "POST", token, idempotent: true, body: { action: "approve", reason: "E2E 审批" }
  });
  await request(`/housing/purchases/${purchase.id}/actions`, {
    method: "POST", token, idempotent: true, body: { action: "pay", reason: "E2E 人工付款登记" }
  });
  const purchaseDetail = await request(`/housing/purchases/${purchase.id}`, { token });
  await request(`/housing/purchases/${purchase.id}/transfer`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      lease_id: lease.id,
      item_ids: purchaseDetail.items.map((item) => item.id),
      due_date: startDate,
      reason: "租客责任维修耗材受控转收费"
    }
  });

  detail = await request(`/housing/leases/${lease.id}`, { token });
  for (const receivable of detail.receivables) await payReceivable(token, lease.id, receivable);
  await request(`/housing/leases/${lease.id}/handovers`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      handover_type: "move_out",
      item_snapshot: [{ description: "现场物品验收完成", checked: true }],
      meter_readings: [{ type: "electricity", reading: 100 }],
      credentials: [{ type: "door_card", returned: 2 }],
      damage_amount: 0,
      unsettled_amount: 0,
      deposit_deduction_amount: 0,
      remark: "真实 API E2E 退租交割"
    }
  });
  await request(`/housing/leases/${lease.id}/ledger`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      entry_type: "deposit_refund",
      charge_type: "deposit",
      amount: 2500,
      payment_method: "bank_transfer",
      reason: "真实 API E2E 押金退还"
    }
  });
  const terminated = await request(`/housing/leases/${lease.id}/checkout`, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "真实 API E2E 退租结清" }
  });
  assert(terminated.status === "terminated", "tenant-to-checkout real API workflow completed");
  console.log(`[PASS] Housing rental real API E2E completed: lease=${lease.id}, workOrder=${repair.id}`);
}

run().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
