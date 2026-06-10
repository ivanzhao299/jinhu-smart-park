import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const testRunId =
  process.env.TEST_RUN_ID ??
  `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const idempotencyKeyPrefix = process.env.IDEMPOTENCY_KEY_PREFIX ?? "first-release-regression";

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function summarizeBody(body) {
  if (body === null || body === undefined) return "<empty>";
  if (typeof body === "string") return body.slice(0, 240);
  try {
    return JSON.stringify(body).slice(0, 240);
  } catch {
    return String(body).slice(0, 240);
  }
}

function unwrapData(body) {
  if (body && typeof body === "object" && "data" in body) {
    return body.data;
  }
  return body;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { response, body };
}

function expectStatus(label, actual, expectedList, body) {
  const allowed = Array.isArray(expectedList) ? expectedList : [expectedList];
  if (!allowed.includes(actual)) {
    fail(`${label} expected ${allowed.join(" / ")}, got ${actual}; body=${summarizeBody(body)}`);
    return false;
  }
  pass(`${label} HTTP ${actual}`);
  return true;
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `first-release-leasing-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId,
      parkId,
      username,
      password
    })
  });
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-${action}-${testRunId}`;
}

function buildDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function buildNextMonthMinusOneDay() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function buildBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function buildSuffix() {
  return testRunId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function buildCodes(prefix) {
  const suffix = buildSuffix().toUpperCase();
  const randomPart = randomUUID().replace(/-/g, "").toUpperCase().slice(0, 8);
  return {
    code: `${prefix}-${suffix}-${randomPart}`.replace(/[^A-Z0-9_-]/g, "").slice(0, 64),
    suffix
  };
}

function findItemByIdOrCode(items, id, code, altCode, name) {
  return items.find(
    (item) =>
      item?.id === id ||
      item?.contractCode === code ||
      item?.contract_code === code ||
      item?.payCode === code ||
      item?.pay_code === code ||
      item?.arCode === code ||
      item?.ar_code === code ||
      item?.code === code ||
      item?.code === altCode ||
      item?.contractName === name ||
      item?.contract_name === name ||
      item?.pay_name === name ||
      item?.title === name
  );
}

function listItems(body) {
  const data = unwrapData(body);
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
    return [];
  }
  return data.items;
}

async function fetchList(path, keyword, authHeaders) {
  const result = await request(`${path}?page=1&page_size=20&keyword=${encodeURIComponent(keyword)}`, { headers: authHeaders });
  if (!expectStatus(`GET ${path}`, result.response.status, 200, result.body)) {
    return null;
  }
  return listItems(result.body);
}

async function ensureParkTenant(authHeaders) {
  const items = await fetchList("/park-tenants", testRunId, authHeaders);
  if (!items) return null;
  if (items.length === 0) {
    info("No matching park tenant found, creating a temporary tenant company");
  } else {
    info(`Found ${items.length} matching park tenant candidate(s); creating a fresh isolated tenant company`);
  }
  const codes = buildCodes("PT");
  const create = await request("/park-tenants", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-park-tenant")
    },
    body: JSON.stringify({
      parkTenantCode: codes.code,
      companyName: `First release leasing ${codes.suffix}`,
      contactName: `Tester ${codes.suffix}`,
      contactMobile: `138${String(Date.now()).slice(-8)}`,
      sourceType: "manual",
      remark: `first release leasing regression ${testRunId}`
    })
  });
  if (!expectStatus("POST /park-tenants", create.response.status, [200, 201], create.body)) {
    return null;
  }
  const created = unwrapData(create.body);
  if (!created?.id) {
    fail(`POST /park-tenants did not return id; body=${summarizeBody(create.body)}`);
    return null;
  }
  pass(`Created park tenant ${created.companyName ?? created.parkTenantCode} (${created.id})`);
  return created;
}

async function ensureBuilding(authHeaders) {
  const items = await fetchList("/buildings", testRunId, authHeaders);
  if (!items) return null;
  if (items.length === 0) {
    info("No matching building found, creating a temporary building");
  } else {
    info(`Found ${items.length} matching building candidate(s); creating a fresh isolated building`);
  }
  const codes = buildCodes("BLD");
  const create = await request("/buildings", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-building")
    },
    body: JSON.stringify({
      buildingCode: codes.code,
      buildingName: `First release building ${codes.suffix}`,
      floorCount: 1,
      buildArea: 1000,
      status: 1,
      sortNo: 1,
      remark: `first release leasing regression ${testRunId}`
    })
  });
  if (!expectStatus("POST /buildings", create.response.status, [200, 201], create.body)) {
    return null;
  }
  const created = unwrapData(create.body);
  if (!created?.id) {
    fail(`POST /buildings did not return id; body=${summarizeBody(create.body)}`);
    return null;
  }
  pass(`Created building ${created.buildingName ?? created.buildingCode} (${created.id})`);
  return created;
}

async function ensureFloor(authHeaders, buildingId) {
  const items = await fetchList("/floors", testRunId, authHeaders);
  if (!items) return null;
  if (items.length === 0) {
    info("No matching floor found, creating a temporary floor");
  } else {
    info(`Found ${items.length} matching floor candidate(s); creating a fresh isolated floor`);
  }
  const codes = buildCodes("FLR");
  const create = await request("/floors", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-floor")
    },
    body: JSON.stringify({
      buildingId,
      floorCode: codes.code,
      floorNo: 1,
      floorName: `First release floor ${codes.suffix}`,
      floorArea: 1000,
      status: 1,
      sortNo: 1,
      remark: `first release leasing regression ${testRunId}`
    })
  });
  if (!expectStatus("POST /floors", create.response.status, [200, 201], create.body)) {
    return null;
  }
  const created = unwrapData(create.body);
  if (!created?.id) {
    fail(`POST /floors did not return id; body=${summarizeBody(create.body)}`);
    return null;
  }
  pass(`Created floor ${created.floorName ?? created.floorCode} (${created.id})`);
  return created;
}

async function ensureUnit(authHeaders, buildingId, floorId) {
  const items = await fetchList("/park-units", testRunId, authHeaders);
  if (!items) return null;
  const matchedCount = items.filter((item) => Number(item?.status) === 1 && Number(item?.rentalStatus ?? item?.rental_status ?? 10) === 10).length;
  if (items.length === 0) {
    info("No matching park unit found, creating a temporary unit");
  } else {
    info(`Found ${items.length} matching park unit candidate(s), ${matchedCount} rentable; creating a fresh isolated unit`);
  }
  const codes = buildCodes("UNIT");
  const create = await request("/park-units", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-unit")
    },
    body: JSON.stringify({
      unitCode: codes.code,
      buildingId,
      floorId,
      unitName: `First release unit ${codes.suffix}`,
      usageType: 10,
      unitArea: 100,
      useArea: 90,
      rentalStatus: 10,
      fittingStatus: 10,
      refPrice: 1000,
      status: 1,
      remark: `first release leasing regression ${testRunId}`
    })
  });
  if (!expectStatus("POST /park-units", create.response.status, [200, 201], create.body)) {
    return null;
  }
  const created = unwrapData(create.body);
  if (!created?.id) {
    fail(`POST /park-units did not return id; body=${summarizeBody(create.body)}`);
    return null;
  }
  pass(`Created park unit ${created.unitName ?? created.unitCode} (${created.id})`);
  return created;
}

async function uploadContractFile(authHeaders, label) {
  const form = new FormData();
  form.append("biz_type", "leasing_contract");
  form.append("remark", `${label} ${testRunId}`);
  form.append(
    "file",
    new Blob([`%PDF-1.4\nJinHu leasing regression ${label} ${testRunId}\n%%EOF`], {
      type: "application/pdf"
    }),
    `${label}-${testRunId}.pdf`
  );
  const result = await request("/files", {
    method: "POST",
    headers: {
      ...authHeaders,
      "x-idempotency-key": buildIdempotencyKey(`upload-${label}`)
    },
    body: form
  });
  if (!expectStatus(`POST /files (${label})`, result.response.status, [200, 201], result.body)) {
    return null;
  }
  const created = unwrapData(result.body);
  const fileId = created?.id ?? created?.fileId;
  if (typeof fileId !== "string" || fileId.length === 0) {
    fail(`POST /files (${label}) did not return file id; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass(`Uploaded contract file ${label} (${fileId})`);
  return fileId;
}

async function ensureContractFiles(authHeaders) {
  const contractPdfFileId = await uploadContractFile(authHeaders, "contract-pdf");
  if (!contractPdfFileId) return null;
  const scanPdfFileId = await uploadContractFile(authHeaders, "scan-pdf");
  if (!scanPdfFileId) return null;
  return { contractPdfFileId, scanPdfFileId };
}

function buildContractPayload(parkTenantId) {
  const startDate = buildDate(0);
  const endDate = buildNextMonthMinusOneDay();
  return {
    contract_code: buildCodes("CONTRACT").code,
    contract_name: `First release leasing contract ${testRunId}`,
    contract_type: "10",
    park_tenant_id: parkTenantId,
    source_type: "manual",
    start_date: startDate,
    end_date: endDate,
    rent_unit_price: 10,
    total_area: 100,
    rent_per_month: 1000,
    total_amount: 1000,
    deposit_months: 1,
    deposit_amount: 1000,
    free_rent_months: 0,
    payment_period: "10",
    payment_advance_days: 0,
    property_fee_unit_price: 0,
    status: "10",
    remark: `first release leasing regression ${testRunId}`
  };
}

function buildGenerateReceivablesPayload(isConflict = false) {
  return {
    include_rent: true,
    include_deposit: true,
    include_property_fee: isConflict,
    force_regenerate: isConflict
  };
}

function buildPaymentPayload(parkTenantId) {
  return {
    pay_code: buildCodes("PAY").code,
    park_tenant_id: parkTenantId,
    pay_time: new Date().toISOString(),
    pay_method: "bank_transfer",
    pay_amount: 1,
    payer_name: `First release payment ${testRunId}`,
    bank_serial: `BANK-${buildSuffix().slice(0, 12)}`,
    status: "10",
    remark: `First release leasing regression ${testRunId}`
  };
}

function buildManualReceivablePayload(contract, parkTenantId, options = {}) {
  const codes = buildCodes("AR");
  const periodStart = buildDate(options.offsetDays ?? 370);
  const periodEnd = buildDate(options.offsetDays ?? 370);
  const amountDue = options.amountDue ?? 0.99;
  return {
    ar_code: codes.code,
    contract_id: contract.id,
    park_tenant_id: parkTenantId,
    fee_type: options.feeType ?? "90",
    period_start: periodStart,
    period_end: periodEnd,
    due_date: periodEnd,
    amount_due: amountDue,
    amount_paid: 0,
    amount_waived: 0,
    late_fee: 0,
    invoice_status: "10",
    source_type: "manual",
    remark: `First release manual receivable ${testRunId}`
  };
}

function buildPaymentUpdatePayload(payment, options = {}) {
  return {
    pay_amount: options.payAmount ?? 1.23,
    pay_method: options.payMethod ?? "bank_transfer",
    payer_name: payment.payerName ?? payment.payer_name ?? `First release payment ${testRunId}`,
    bank_serial: `UPD-${buildSuffix().slice(0, 12)}`,
    remark: options.remark ?? `First release payment update ${testRunId}`
  };
}

async function ensureContract(authHeaders, parkTenantId) {
  const items = await fetchList("/leasing/contracts", testRunId, authHeaders);
  if (!items) return null;
  if (items.length === 0) {
    info("No matching contract found, creating a temporary draft contract");
  } else {
    info(`Found ${items.length} matching contract candidate(s); creating a fresh isolated draft contract`);
  }
  const payload = buildContractPayload(parkTenantId);
  const missingKey = await request("/leasing/contracts", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return null;
  }

  const create = await request("/leasing/contracts", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-contract")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts", create.response.status, [200, 201], create.body)) {
    return null;
  }
  const created = unwrapData(create.body);
  if (!created?.id) {
    fail(`POST /leasing/contracts did not return contract id; body=${summarizeBody(create.body)}`);
    return null;
  }
  pass(`Created contract ${created.contractName ?? created.contractCode} (${created.id})`);

  const replay = await request("/leasing/contracts", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-contract")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts replay", replay.response.status, [200, 201], replay.body)) {
    return null;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== created.id) {
    fail(`POST /leasing/contracts replay expected same contract id, got ${replayData?.id} vs ${created.id}`);
    return null;
  }
  pass("POST /leasing/contracts replay returned cached response");

  const contractListAfterReplay = await fetchList("/leasing/contracts", testRunId, authHeaders);
  if (!contractListAfterReplay) return null;
  const contractMatches = contractListAfterReplay.filter(
    (item) => findItemByIdOrCode([item], created.id, created.contractCode, created.contractCode, created.contractName)
  );
  if (contractMatches.length !== 1) {
    fail(`POST /leasing/contracts replay created duplicate contracts; count=${contractMatches.length}`);
    return null;
  }
  pass("GET /leasing/contracts confirmed no duplicate contract for replay");

  const conflict = await request("/leasing/contracts", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-contract")
    },
    body: JSON.stringify({
      ...payload,
      contract_name: `${payload.contract_name} conflict`,
      remark: `${payload.remark} conflict`
    })
  });
  if (!expectStatus("POST /leasing/contracts conflict", conflict.response.status, 409, conflict.body)) {
    return null;
  }

  return created;
}

function buildContractUnitLinkPayload(unit) {
  return {
    unit_id: unit.id,
    area: 100,
    rent_unit_price: 10,
    start_date: buildDate(0),
    end_date: buildNextMonthMinusOneDay(),
    status: 1,
    remark: `first release leasing regression ${testRunId}`
  };
}

async function listContractUnits(authHeaders, contractId) {
  const current = await request(`/leasing/contracts/${contractId}/units`, { headers: authHeaders });
  if (!expectStatus("GET /leasing/contracts/:id/units", current.response.status, 200, current.body)) {
    return null;
  }
  return listItems(current.body);
}

async function ensureContractUnitLink(authHeaders, contractId, unit) {
  const currentItems = await listContractUnits(authHeaders, contractId);
  if (!currentItems) return null;
  const existing = currentItems.find((item) => item?.unitId === unit.id || item?.unit_id === unit.id);
  if (existing) {
    pass(`Reusing existing contract-unit link (${existing.id ?? existing.relId ?? "unknown"})`);
    return existing;
  }
  const payload = buildContractUnitLinkPayload(unit);
  const link = await request(`/leasing/contracts/${contractId}/units`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-contract-unit-link")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:contractId/units", link.response.status, [200, 201], link.body)) {
    return null;
  }
  const created = unwrapData(link.body);
  if (!created?.id) {
    fail(`POST /leasing/contracts/:contractId/units did not return id; body=${summarizeBody(link.body)}`);
    return null;
  }
  pass(`Linked contract to unit (${created.id})`);
  return created;
}

async function exerciseContractUnitLinkIdempotency(authHeaders, contractId, unit) {
  const payload = buildContractUnitLinkPayload(unit);

  const missingKey = await request(`/leasing/contracts/${contractId}/units`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:contractId/units missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return null;
  }

  const idempotencyKey = buildIdempotencyKey("create-contract-unit-link");
  const first = await request(`/leasing/contracts/${contractId}/units`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:contractId/units first request", first.response.status, [200, 201], first.body)) {
    return null;
  }

  const firstData = unwrapData(first.body);
  const firstId = firstData?.id ?? firstData?.relId;
  if (typeof firstId !== "string" || firstId.length === 0) {
    fail(`POST /leasing/contracts/:contractId/units first request did not return relation id; body=${summarizeBody(first.body)}`);
    return null;
  }
  pass(`POST /leasing/contracts/:contractId/units created relation ${firstId}`);

  const replay = await request(`/leasing/contracts/${contractId}/units`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:contractId/units replay", replay.response.status, [200, 201], replay.body)) {
    return null;
  }
  const replayData = unwrapData(replay.body);
  const replayId = replayData?.id ?? replayData?.relId;
  if (replayId !== firstId) {
    fail(`POST /leasing/contracts/:contractId/units replay expected same relation id, got ${replayId} vs ${firstId}`);
    return null;
  }
  pass("POST /leasing/contracts/:contractId/units replay returned cached response");

  const unitsAfterReplay = await listContractUnits(authHeaders, contractId);
  if (!unitsAfterReplay) return null;
  const linkedMatches = unitsAfterReplay.filter((item) => (item?.unitId ?? item?.unit_id ?? item?.unit?.id) === unit.id);
  if (linkedMatches.length !== 1) {
    fail(`POST /leasing/contracts/:contractId/units replay created duplicate links; count=${linkedMatches.length}`);
    return null;
  }
  pass("GET /leasing/contracts/:id/units confirmed no duplicate relation for replayed unit");

  const conflict = await request(`/leasing/contracts/${contractId}/units`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      ...payload,
      area: payload.area + 1
    })
  });
  if (!expectStatus("POST /leasing/contracts/:contractId/units conflict", conflict.response.status, 409, conflict.body)) {
    return null;
  }

  return firstData;
}

async function transitionContractToSigned(authHeaders, contractId, files) {
  const submit = await request(`/leasing/contracts/${contractId}/submit`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("submit-contract")
    },
    body: JSON.stringify({
      opinion: `First release leasing regression submit ${testRunId}`
    })
  });
  if (!expectStatus("POST /leasing/contracts/:id/submit", submit.response.status, [200, 201], submit.body)) return false;

  const approve = await request(`/leasing/contracts/${contractId}/approve`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("approve-contract")
    },
    body: JSON.stringify({
      opinion: `First release leasing regression approve ${testRunId}`
    })
  });
  if (!expectStatus("POST /leasing/contracts/:id/approve", approve.response.status, [200, 201], approve.body)) return false;

  const archive = await request(`/leasing/contracts/${contractId}/archive`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("archive-contract")
    },
    body: JSON.stringify({
      contract_pdf_file_id: files.contractPdfFileId,
      scan_pdf_file_id: files.scanPdfFileId,
      sign_date: buildDate(0),
      effective_date: buildDate(0),
      opinion: `First release leasing regression archive ${testRunId}`,
      remark: `First release leasing regression ${testRunId}`
    })
  });
  if (!expectStatus("POST /leasing/contracts/:id/archive", archive.response.status, [200, 201], archive.body)) return false;

  return true;
}

function buildEffectivePayload() {
  return {
    effective_date: buildDate(0),
    opinion: `First release leasing regression effective ${testRunId}`
  };
}

async function exerciseContractEffectiveIdempotency(authHeaders, contractId) {
  const payload = buildEffectivePayload();

  const missingKey = await request(`/leasing/contracts/${contractId}/effective`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:id/effective missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("effective-contract");
  const first = await request(`/leasing/contracts/${contractId}/effective`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:id/effective first request", first.response.status, [200, 201], first.body)) return false;

  const firstData = unwrapData(first.body);
  if (!firstData?.id) {
    fail(`POST /leasing/contracts/:id/effective first request did not return contract data; body=${summarizeBody(first.body)}`);
    return false;
  }

  const replay = await request(`/leasing/contracts/${contractId}/effective`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:id/effective replay", replay.response.status, [200, 201], replay.body)) return false;
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== firstData.id) {
    fail(`POST /leasing/contracts/:id/effective replay expected same contract id, got ${replayData?.id} vs ${firstData.id}`);
    return false;
  }
  pass("POST /leasing/contracts/:id/effective replay returned cached response");

  const conflict = await request(`/leasing/contracts/${contractId}/effective`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      ...payload,
      opinion: `${payload.opinion} conflict`
    })
  });
  if (!expectStatus("POST /leasing/contracts/:id/effective conflict", conflict.response.status, 409, conflict.body)) return false;

  pass("Contract moved to effective status");
  return true;
}

async function generateReceivables(authHeaders, contractId) {
  const before = await queryReceivables(authHeaders, contractId);
  if (before === null) return null;

  const payload = buildGenerateReceivablesPayload(false);
  const result = await request(`/leasing/contracts/${contractId}/generate-receivables`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-receivables")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:id/generate-receivables", result.response.status, [200, 201], result.body)) return null;
  const data = unwrapData(result.body);
  const generatedCount = data?.generated_count;
  if (typeof generatedCount !== "number") {
    fail(`generate receivables did not return generated_count; body=${summarizeBody(result.body)}`);
    return null;
  }
  if (generatedCount < 0) {
    fail(`generate receivables returned negative generated_count: ${generatedCount}`);
    return null;
  }
  pass(`Generated receivables count=${generatedCount}`);

  const replay = await request(`/leasing/contracts/${contractId}/generate-receivables`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-receivables")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/contracts/:id/generate-receivables replay", replay.response.status, [200, 201], replay.body)) {
    return null;
  }
  const replayData = unwrapData(replay.body);
  if (typeof replayData?.generated_count === "number" && replayData.generated_count !== generatedCount) {
    fail(`POST /leasing/contracts/:id/generate-receivables replay expected same generated_count, got ${replayData.generated_count} vs ${generatedCount}`);
    return null;
  }
  pass("POST /leasing/contracts/:id/generate-receivables replay returned cached response");

  const afterReplay = await queryReceivables(authHeaders, contractId);
  if (afterReplay === null) return null;
  if (afterReplay.length < before.length) {
    fail(`POST /leasing/contracts/:id/generate-receivables replay unexpectedly reduced receivable count from ${before.length} to ${afterReplay.length}`);
    return null;
  }
  if (afterReplay.length > before.length + generatedCount) {
    fail(`POST /leasing/contracts/:id/generate-receivables replay created extra receivables; before=${before.length}, after=${afterReplay.length}, generated=${generatedCount}`);
    return null;
  }
  pass("GET /leasing/receivables confirmed no duplicate receivables for replay");

  const conflict = await request(`/leasing/contracts/${contractId}/generate-receivables`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-receivables")
    },
    body: JSON.stringify(buildGenerateReceivablesPayload(true))
  });
  if (!expectStatus("POST /leasing/contracts/:id/generate-receivables conflict", conflict.response.status, 409, conflict.body)) {
    return null;
  }

  return data;
}

function validateBatchGenerationResult(label, body) {
  const data = unwrapData(body);
  if (!data || typeof data !== "object") {
    fail(`${label} did not return an object body; body=${summarizeBody(body)}`);
    return null;
  }
  for (const field of ["generated_count", "skipped_count", "failed_count"]) {
    if (typeof data[field] !== "number") {
      fail(`${label} did not return numeric ${field}; body=${summarizeBody(body)}`);
      return null;
    }
    if (data[field] < 0) {
      fail(`${label} returned negative ${field}: ${data[field]}`);
      return null;
    }
  }
  if (!Array.isArray(data.rows)) {
    fail(`${label} did not return rows array; body=${summarizeBody(body)}`);
    return null;
  }
  return data;
}

function assertNoUnexpectedBatchFailures(label, data) {
  if (data.failed_count !== 0) {
    fail(`${label} returned unexpected failed rows; body=${summarizeBody(data)}`);
    return false;
  }
  return true;
}

async function exerciseReceivableBatchGenerationDedupe(authHeaders, contractId) {
  const payload = {
    contract_ids: [contractId],
    billing_month: buildBillingMonth()
  };

  const before = await queryReceivables(authHeaders, contractId);
  if (before === null) return false;

  const first = await request("/leasing/receivables/generate-batch", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-batch-first")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/receivables/generate-batch first request", first.response.status, [200, 201], first.body)) return false;
  const firstData = validateBatchGenerationResult("POST /leasing/receivables/generate-batch first request", first.body);
  if (!firstData || !assertNoUnexpectedBatchFailures("POST /leasing/receivables/generate-batch first request", firstData)) return false;
  if (firstData.rows.length === 0 || firstData.generated_count + firstData.skipped_count === 0) {
    fail(`POST /leasing/receivables/generate-batch first request did not create or skip any rows; body=${summarizeBody(first.body)}`);
    return false;
  }
  pass(`POST /leasing/receivables/generate-batch first request generated=${firstData.generated_count}, skipped=${firstData.skipped_count}`);

  const afterFirst = await queryReceivables(authHeaders, contractId);
  if (afterFirst === null) return false;
  if (afterFirst.length > before.length + firstData.generated_count) {
    fail(`Batch generation created unexpected duplicate receivables; before=${before.length}, after=${afterFirst.length}, generated=${firstData.generated_count}`);
    return false;
  }

  const repeat = await request("/leasing/receivables/generate-batch", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-batch-repeat")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/receivables/generate-batch same payload different key", repeat.response.status, [200, 201], repeat.body)) return false;
  const repeatData = validateBatchGenerationResult("POST /leasing/receivables/generate-batch same payload different key", repeat.body);
  if (!repeatData || !assertNoUnexpectedBatchFailures("POST /leasing/receivables/generate-batch same payload different key", repeatData)) return false;
  if (repeatData.skipped_count <= 0) {
    fail(`POST /leasing/receivables/generate-batch repeat expected skipped rows, got ${repeatData.skipped_count}; body=${summarizeBody(repeat.body)}`);
    return false;
  }

  const afterRepeat = await queryReceivables(authHeaders, contractId);
  if (afterRepeat === null) return false;
  if (afterRepeat.length !== afterFirst.length) {
    fail(`Batch generation same payload different key changed receivable count from ${afterFirst.length} to ${afterRepeat.length}`);
    return false;
  }
  pass("POST /leasing/receivables/generate-batch same payload different key skipped existing receivables without duplicates");

  const quickRepeat = await request("/leasing/receivables/generate-batch", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-batch-quick-repeat")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/receivables/generate-batch quick repeat", quickRepeat.response.status, [200, 201], quickRepeat.body)) return false;
  const quickRepeatData = validateBatchGenerationResult("POST /leasing/receivables/generate-batch quick repeat", quickRepeat.body);
  if (!quickRepeatData || !assertNoUnexpectedBatchFailures("POST /leasing/receivables/generate-batch quick repeat", quickRepeatData)) return false;
  if (quickRepeatData.skipped_count <= 0) {
    fail(`POST /leasing/receivables/generate-batch quick repeat expected skipped rows, got ${quickRepeatData.skipped_count}`);
    return false;
  }
  pass("POST /leasing/receivables/generate-batch quick repeat skipped existing receivables");

  return true;
}

async function queryReceivables(authHeaders, contractId) {
  const result = await request(`/leasing/receivables?page=1&page_size=20&contract_id=${contractId}&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /leasing/receivables", result.response.status, 200, result.body)) return null;
  const items = listItems(result.body);
  if (items.length === 0) {
    info("GET /leasing/receivables returned no items for this contract yet");
  } else {
    pass(`GET /leasing/receivables returned ${items.length} item(s)`);
  }
  return items;
}

async function queryReceivablesByCode(authHeaders, contractId, arCode) {
  const result = await request(
    `/leasing/receivables?page=1&page_size=20&contract_id=${contractId}&fee_type=90&keyword=${encodeURIComponent(arCode)}`,
    { headers: authHeaders }
  );
  if (!expectStatus("GET /leasing/receivables by ar_code", result.response.status, 200, result.body)) return null;
  return listItems(result.body);
}

async function exerciseReceivableCreateIdempotency(authHeaders, contract, parkTenantId) {
  const payload = buildManualReceivablePayload(contract, parkTenantId);
  const missingKey = await request("/leasing/receivables", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/receivables missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return null;
  }

  const idempotencyKey = buildIdempotencyKey("create-receivable");
  const first = await request("/leasing/receivables", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/receivables first request", first.response.status, [200, 201], first.body)) {
    return null;
  }
  const created = unwrapData(first.body);
  if (!created?.id) {
    fail(`POST /leasing/receivables first request did not return receivable id; body=${summarizeBody(first.body)}`);
    return null;
  }
  pass(`POST /leasing/receivables created receivable ${created.arCode ?? created.ar_code ?? created.id}`);

  const replay = await request("/leasing/receivables", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/receivables replay", replay.response.status, [200, 201], replay.body)) {
    return null;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== created.id) {
    fail(`POST /leasing/receivables replay expected same receivable id, got ${replayData?.id} vs ${created.id}`);
    return null;
  }
  pass("POST /leasing/receivables replay returned cached response");

  const receivablesAfterReplay = await queryReceivablesByCode(authHeaders, contract.id, payload.ar_code);
  if (!receivablesAfterReplay) return null;
  const matches = receivablesAfterReplay.filter((item) => findItemByIdOrCode([item], created.id, created.arCode ?? created.ar_code, payload.ar_code));
  if (matches.length !== 1) {
    fail(`POST /leasing/receivables replay created duplicate receivables; count=${matches.length}`);
    return null;
  }
  pass("GET /leasing/receivables confirmed no duplicate manual receivable for replay");

  const conflict = await request("/leasing/receivables", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      ...payload,
      amount_due: payload.amount_due + 1,
      remark: `${payload.remark} conflict`
    })
  });
  if (!expectStatus("POST /leasing/receivables conflict", conflict.response.status, 409, conflict.body)) {
    return null;
  }

  return created;
}

async function getReceivableDetail(authHeaders, receivableId, label = "GET /leasing/receivables/:id") {
  const detail = await request(`/leasing/receivables/${receivableId}`, { headers: authHeaders });
  if (!expectStatus(label, detail.response.status, 200, detail.body)) return null;
  const data = unwrapData(detail.body);
  if (!data || data.id !== receivableId) {
    fail(`${label} did not return expected receivable id; body=${summarizeBody(detail.body)}`);
    return null;
  }
  return data;
}

function receivableField(receivable, camelKey, snakeKey = camelKey) {
  return receivable?.[camelKey] ?? receivable?.[snakeKey];
}

function normalizeMoney(value) {
  return Number(value ?? 0).toFixed(2);
}

async function exerciseReceivableUpdateAllowedFields(authHeaders, receivable) {
  const payload = {
    remark: `First release receivable update allowed ${testRunId}`,
    due_date: buildDate(45)
  };
  const missingKey = await request(`/leasing/receivables/${receivable.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      remark: `Missing key receivable update ${testRunId}`
    })
  });
  if (!expectStatus("PUT /leasing/receivables/:id missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("update-receivable-allowed-fields");
  const update = await request(`/leasing/receivables/${receivable.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("PUT /leasing/receivables/:id first request", update.response.status, [200, 201], update.body)) {
    return false;
  }
  const updated = unwrapData(update.body);
  if (updated?.id !== receivable.id) {
    fail(`PUT /leasing/receivables/:id first request did not return expected id; body=${summarizeBody(update.body)}`);
    return false;
  }
  if (receivableField(updated, "remark") !== payload.remark || receivableField(updated, "dueDate", "due_date") !== payload.due_date) {
    fail(`PUT /leasing/receivables/:id first request did not return updated fields; body=${summarizeBody(update.body)}`);
    return false;
  }

  const detail = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id after allowed update");
  if (!detail) return false;
  if (receivableField(detail, "remark") !== payload.remark) {
    fail(`Receivable remark was not updated; body=${summarizeBody(detail)}`);
    return false;
  }
  if (receivableField(detail, "dueDate", "due_date") !== payload.due_date) {
    fail(`Receivable due_date was not updated; body=${summarizeBody(detail)}`);
    return false;
  }
  pass("PUT /leasing/receivables/:id allowed remark and due_date update");

  const replay = await request(`/leasing/receivables/${receivable.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("PUT /leasing/receivables/:id replay", replay.response.status, [200, 201], replay.body)) {
    return false;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== receivable.id) {
    fail(`PUT /leasing/receivables/:id replay expected same receivable id, got ${replayData?.id} vs ${receivable.id}`);
    return false;
  }
  if (receivableField(replayData, "remark") !== payload.remark || receivableField(replayData, "dueDate", "due_date") !== payload.due_date) {
    fail(`PUT /leasing/receivables/:id replay did not return cached updated fields; body=${summarizeBody(replay.body)}`);
    return false;
  }
  pass("PUT /leasing/receivables/:id replay returned cached response");

  const detailAfterReplay = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id after replay");
  if (!detailAfterReplay) return false;
  if (receivableField(detailAfterReplay, "remark") !== payload.remark) {
    fail(`Receivable remark drifted after replay; body=${summarizeBody(detailAfterReplay)}`);
    return false;
  }
  if (receivableField(detailAfterReplay, "dueDate", "due_date") !== payload.due_date) {
    fail(`Receivable due_date drifted after replay; body=${summarizeBody(detailAfterReplay)}`);
    return false;
  }
  pass("GET /leasing/receivables/:id confirmed stable fields after replay");

  const conflict = await request(`/leasing/receivables/${receivable.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      remark: `${payload.remark} conflict`,
      due_date: buildDate(46)
    })
  });
  if (!expectStatus("PUT /leasing/receivables/:id conflict", conflict.response.status, 409, conflict.body)) {
    return false;
  }
  return true;
}

async function exerciseReceivableUpdateSensitiveFieldRejection(authHeaders, receivable) {
  const baseline = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id before sensitive field checks");
  if (!baseline) return false;

  const cases = [
    { field: "amount_paid", value: 0.12, camel: "amountPaid", snake: "amount_paid" },
    { field: "amount_waived", value: 0.13, camel: "amountWaived", snake: "amount_waived" },
    { field: "invoice_status", value: "20", camel: "invoiceStatus", snake: "invoice_status" },
    { field: "status", value: "50", camel: "status", snake: "status" },
    { field: "amount_due", value: 9.99, camel: "amountDue", snake: "amount_due" }
  ];

  for (const item of cases) {
    const rejected = await request(`/leasing/receivables/${receivable.id}`, {
      method: "PUT",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        "x-idempotency-key": buildIdempotencyKey(`update-receivable-reject-${item.field}`)
      },
      body: JSON.stringify({
        [item.field]: item.value
      })
    });
    if (!expectStatus(`PUT /leasing/receivables/:id reject ${item.field}`, rejected.response.status, 400, rejected.body)) {
      return false;
    }
    if (item.field === "amount_paid") {
      const retry = await request(`/leasing/receivables/${receivable.id}`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
          "x-idempotency-key": buildIdempotencyKey(`update-receivable-reject-${item.field}`)
        },
        body: JSON.stringify({
          [item.field]: item.value
        })
      });
      if (!expectStatus(`PUT /leasing/receivables/:id reject ${item.field} retry`, retry.response.status, 400, retry.body)) {
        return false;
      }
      pass(`PUT /leasing/receivables/:id rejected ${item.field} retry without successful replay`);
    }
    const after = await getReceivableDetail(authHeaders, receivable.id, `GET /leasing/receivables/:id after rejected ${item.field}`);
    if (!after) return false;
    const beforeValue = receivableField(baseline, item.camel, item.snake);
    const afterValue = receivableField(after, item.camel, item.snake);
    const stable = typeof item.value === "number"
      ? normalizeMoney(beforeValue) === normalizeMoney(afterValue)
      : beforeValue === afterValue;
    if (!stable) {
      fail(`Rejected ${item.field} update changed value from ${beforeValue} to ${afterValue}`);
      return false;
    }
    pass(`PUT /leasing/receivables/:id rejected ${item.field} without mutating data`);
  }

  return true;
}

async function exerciseReceivableUpdateStateProtection(authHeaders, receivable) {
  const before = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id before state protection");
  if (!before) return false;
  const rejected = await request(`/leasing/receivables/${receivable.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("update-receivable-state-protection")
    },
    body: JSON.stringify({
      remark: `Should not update paid receivable ${testRunId}`,
      due_date: buildDate(60)
    })
  });
  if (!expectStatus("PUT /leasing/receivables/:id state protected receivable", rejected.response.status, 400, rejected.body)) {
    return false;
  }

  const after = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id after state protection");
  if (!after) return false;
  if (receivableField(after, "remark") !== receivableField(before, "remark")) {
    fail(`State protected receivable remark changed unexpectedly; before=${summarizeBody(before)}, after=${summarizeBody(after)}`);
    return false;
  }
  if (receivableField(after, "dueDate", "due_date") !== receivableField(before, "dueDate", "due_date")) {
    fail(`State protected receivable due_date changed unexpectedly; before=${summarizeBody(before)}, after=${summarizeBody(after)}`);
    return false;
  }
  pass("PUT /leasing/receivables/:id rejected update for receivable with financial activity");
  return true;
}

async function assertReceivableNotInList(authHeaders, contractId, receivable, label) {
  const code = receivableField(receivable, "arCode", "ar_code");
  const result = await request(`/leasing/receivables?page=1&page_size=20&contract_id=${contractId}&keyword=${encodeURIComponent(code ?? testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus(label, result.response.status, 200, result.body)) return false;
  const items = listItems(result.body);
  const stillVisible = items.some((item) => item?.id === receivable.id || receivableField(item, "arCode", "ar_code") === code);
  if (stillVisible) {
    fail(`${label} still returned soft-deleted receivable ${receivable.id}`);
    return false;
  }
  pass(`${label} confirmed receivable is not visible in list`);
  return true;
}

async function exerciseReceivableSoftDeleteAllowed(authHeaders, receivable, contractId) {
  const before = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id before soft delete");
  if (!before) return false;

  const missingKey = await request(`/leasing/receivables/${receivable.id}`, {
    method: "DELETE",
    headers: authHeaders
  });
  if (!expectStatus("DELETE /leasing/receivables/:id missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("delete-receivable-allowed");
  const deleted = await request(`/leasing/receivables/${receivable.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/receivables/:id first request", deleted.response.status, [200, 204], deleted.body)) {
    return false;
  }
  const firstData = unwrapData(deleted.body);
  if (firstData?.id && firstData.id !== receivable.id) {
    fail(`DELETE /leasing/receivables/:id first request returned unexpected id; body=${summarizeBody(deleted.body)}`);
    return false;
  }

  const replay = await request(`/leasing/receivables/${receivable.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/receivables/:id replay", replay.response.status, deleted.response.status, replay.body)) {
    return false;
  }
  const replayData = unwrapData(replay.body);
  if (firstData?.id && replayData?.id !== firstData.id) {
    fail(`DELETE /leasing/receivables/:id replay expected same id, got ${replayData?.id} vs ${firstData.id}`);
    return false;
  }
  pass("DELETE /leasing/receivables/:id replay returned cached soft delete response");

  const conflict = await request(`/leasing/receivables/${receivable.id}?reason=changed`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/receivables/:id conflict", conflict.response.status, 409, conflict.body)) {
    return false;
  }

  const detailAfterDelete = await request(`/leasing/receivables/${receivable.id}`, { headers: authHeaders });
  if (![404].includes(detailAfterDelete.response.status)) {
    fail(`GET /leasing/receivables/:id after soft delete expected 404, got ${detailAfterDelete.response.status}; body=${summarizeBody(detailAfterDelete.body)}`);
    return false;
  }
  pass("GET /leasing/receivables/:id after soft delete is not visible");
  return assertReceivableNotInList(authHeaders, contractId, before, "GET /leasing/receivables after soft delete");
}

async function exerciseReceivableSoftDeleteStateProtection(authHeaders, receivable) {
  const before = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id before protected soft delete");
  if (!before) return false;
  const idempotencyKey = buildIdempotencyKey("delete-receivable-protected");
  const rejected = await request(`/leasing/receivables/${receivable.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/receivables/:id protected receivable", rejected.response.status, 400, rejected.body)) {
    return false;
  }
  const retry = await request(`/leasing/receivables/${receivable.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/receivables/:id protected receivable retry", retry.response.status, 400, retry.body)) {
    return false;
  }
  pass("DELETE /leasing/receivables/:id protected retry remained failed instead of replaying success");

  const after = await getReceivableDetail(authHeaders, receivable.id, "GET /leasing/receivables/:id after protected soft delete");
  if (!after) return false;
  if (receivableField(after, "status") === "90") {
    fail(`Protected receivable unexpectedly changed to void; body=${summarizeBody(after)}`);
    return false;
  }
  if (receivableField(after, "amountPaid", "amount_paid") !== receivableField(before, "amountPaid", "amount_paid")) {
    fail(`Protected receivable amount_paid changed unexpectedly; before=${summarizeBody(before)}, after=${summarizeBody(after)}`);
    return false;
  }
  pass("DELETE /leasing/receivables/:id rejected receivable with financial activity");
  return true;
}

async function createPayment(authHeaders, parkTenantId, action = "create-payment") {
  const payload = buildPaymentPayload(parkTenantId);
  const missingKey = await request("/leasing/payments", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/payments missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return null;
  }

  const result = await request("/leasing/payments", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey(action)
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/payments", result.response.status, [200, 201], result.body)) return null;
  const created = unwrapData(result.body);
  if (!created?.id) {
    fail(`POST /leasing/payments did not return payment id; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass(`Created payment ${created.payCode ?? created.code ?? created.id} (${created.id})`);

  const replay = await request("/leasing/payments", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey(action)
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/payments replay", replay.response.status, [200, 201], replay.body)) {
    return null;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== created.id) {
    fail(`POST /leasing/payments replay expected same payment id, got ${replayData?.id} vs ${created.id}`);
    return null;
  }
  pass("POST /leasing/payments replay returned cached response");

  const listAfterReplay = await request(`/leasing/payments?page=1&page_size=20&park_tenant_id=${parkTenantId}&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /leasing/payments after replay", listAfterReplay.response.status, 200, listAfterReplay.body)) return null;
  const itemsAfterReplay = listItems(listAfterReplay.body);
  const paymentMatches = itemsAfterReplay.filter((item) => findItemByIdOrCode([item], created.id, created.payCode, created.payCode, created.payerName));
  if (paymentMatches.length !== 1) {
    fail(`POST /leasing/payments replay created duplicate payments; count=${paymentMatches.length}`);
    return null;
  }
  pass("GET /leasing/payments confirmed no duplicate payment for replay");

  const conflict = await request("/leasing/payments", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey(action)
    },
    body: JSON.stringify({
      ...payload,
      pay_amount: payload.pay_amount + 1,
      remark: `${payload.remark} conflict`
    })
  });
  if (!expectStatus("POST /leasing/payments conflict", conflict.response.status, 409, conflict.body)) {
    return null;
  }

  return created;
}

async function exercisePaymentUpdateIdempotency(authHeaders, payment, parkTenantId) {
  const payload = buildPaymentUpdatePayload(payment);
  const missingKey = await request(`/leasing/payments/${payment.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("PUT /leasing/payments/:id missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("update-payment");
  const first = await request(`/leasing/payments/${payment.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("PUT /leasing/payments/:id first request", first.response.status, [200, 201], first.body)) {
    return false;
  }
  const firstData = unwrapData(first.body);
  if (firstData?.id !== payment.id) {
    fail(`PUT /leasing/payments/:id first request did not return expected payment id; body=${summarizeBody(first.body)}`);
    return false;
  }
  pass(`PUT /leasing/payments/:id updated payment ${payment.id}`);

  const replay = await request(`/leasing/payments/${payment.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("PUT /leasing/payments/:id replay", replay.response.status, [200, 201], replay.body)) {
    return false;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== firstData.id) {
    fail(`PUT /leasing/payments/:id replay expected same payment id, got ${replayData?.id} vs ${firstData.id}`);
    return false;
  }
  pass("PUT /leasing/payments/:id replay returned cached response");

  const detail = await request(`/leasing/payments/${payment.id}`, { headers: authHeaders });
  if (!expectStatus("GET /leasing/payments/:id after update replay", detail.response.status, 200, detail.body)) return false;
  const detailData = unwrapData(detail.body);
  if (!detailData || detailData.id !== payment.id) {
    fail(`GET /leasing/payments/:id after update replay did not return expected id; body=${summarizeBody(detail.body)}`);
    return false;
  }
  pass("GET /leasing/payments/:id confirmed payment update replay left a single stable payment");

  const list = await request(`/leasing/payments?page=1&page_size=20&park_tenant_id=${parkTenantId}&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /leasing/payments after update replay", list.response.status, 200, list.body)) return false;
  const matches = listItems(list.body).filter((item) => item?.id === payment.id || item?.payCode === firstData.payCode || item?.pay_code === firstData.payCode);
  if (matches.length !== 1) {
    fail(`PUT /leasing/payments/:id replay produced unexpected payment list match count=${matches.length}`);
    return false;
  }
  pass("GET /leasing/payments confirmed no duplicate payment side-effect for update replay");

  const conflict = await request(`/leasing/payments/${payment.id}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(buildPaymentUpdatePayload(payment, {
      payAmount: payload.pay_amount + 1,
      remark: `${payload.remark} conflict`
    }))
  });
  if (!expectStatus("PUT /leasing/payments/:id conflict", conflict.response.status, 409, conflict.body)) {
    return false;
  }

  return true;
}

async function queryPayment(authHeaders, paymentId, parkTenantId) {
  const detail = await request(`/leasing/payments/${paymentId}`, { headers: authHeaders });
  if (!expectStatus("GET /leasing/payments/:id", detail.response.status, 200, detail.body)) return false;
  const detailData = unwrapData(detail.body);
  if (!detailData || detailData.id !== paymentId) {
    fail(`GET /leasing/payments/:id did not return expected id; body=${summarizeBody(detail.body)}`);
    return false;
  }
  pass(`GET /leasing/payments/:id confirmed ${paymentId}`);

  const list = await request(`/leasing/payments?page=1&page_size=20&park_tenant_id=${parkTenantId}&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /leasing/payments", list.response.status, 200, list.body)) return false;
  const items = listItems(list.body);
  if (!items.some((item) => item?.id === paymentId || item?.payCode === detailData.payCode || item?.pay_code === detailData.payCode)) {
    fail(`Created payment not found in list; body=${summarizeBody(list.body)}`);
    return false;
  }
  pass("Created payment appears in GET /leasing/payments");
  return true;
}

async function getPaymentDetail(authHeaders, paymentId, label = "GET /leasing/payments/:id") {
  const detail = await request(`/leasing/payments/${paymentId}`, { headers: authHeaders });
  if (!expectStatus(label, detail.response.status, 200, detail.body)) return null;
  const data = unwrapData(detail.body);
  if (!data || data.id !== paymentId) {
    fail(`${label} did not return expected id; body=${summarizeBody(detail.body)}`);
    return null;
  }
  return data;
}

async function assertPaymentNotInList(authHeaders, payment, parkTenantId, label) {
  const payCode = payment.payCode ?? payment.pay_code ?? payment.code;
  const result = await request(`/leasing/payments?page=1&page_size=20&park_tenant_id=${parkTenantId}&keyword=${encodeURIComponent(payCode ?? testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus(label, result.response.status, 200, result.body)) return false;
  const items = listItems(result.body);
  const stillVisible = items.some((item) => item?.id === payment.id || item?.payCode === payCode || item?.pay_code === payCode);
  if (stillVisible) {
    fail(`${label} still returned soft-deleted payment ${payment.id}`);
    return false;
  }
  pass(`${label} confirmed payment is not visible in list`);
  return true;
}

async function exercisePaymentSoftDeleteAllowed(authHeaders, payment, parkTenantId) {
  const before = await getPaymentDetail(authHeaders, payment.id, "GET /leasing/payments/:id before soft delete");
  if (!before) return false;

  const missingKey = await request(`/leasing/payments/${payment.id}`, {
    method: "DELETE",
    headers: authHeaders
  });
  if (!expectStatus("DELETE /leasing/payments/:id missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("delete-payment-allowed");
  const deleted = await request(`/leasing/payments/${payment.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/payments/:id first request", deleted.response.status, [200, 204], deleted.body)) {
    return false;
  }
  const firstData = unwrapData(deleted.body);
  if (firstData?.id && firstData.id !== payment.id) {
    fail(`DELETE /leasing/payments/:id first request returned unexpected id; body=${summarizeBody(deleted.body)}`);
    return false;
  }

  const replay = await request(`/leasing/payments/${payment.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/payments/:id replay", replay.response.status, deleted.response.status, replay.body)) {
    return false;
  }
  const replayData = unwrapData(replay.body);
  if (firstData?.id && replayData?.id !== firstData.id) {
    fail(`DELETE /leasing/payments/:id replay expected same id, got ${replayData?.id} vs ${firstData.id}`);
    return false;
  }
  pass("DELETE /leasing/payments/:id replay returned cached soft delete response");

  const conflict = await request(`/leasing/payments/${payment.id}?reason=changed`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/payments/:id conflict", conflict.response.status, 409, conflict.body)) {
    return false;
  }

  const detailAfterDelete = await request(`/leasing/payments/${payment.id}`, { headers: authHeaders });
  if (![404].includes(detailAfterDelete.response.status)) {
    fail(`GET /leasing/payments/:id after soft delete expected 404, got ${detailAfterDelete.response.status}; body=${summarizeBody(detailAfterDelete.body)}`);
    return false;
  }
  pass("GET /leasing/payments/:id after soft delete is not visible");
  return assertPaymentNotInList(authHeaders, before, parkTenantId, "GET /leasing/payments after soft delete");
}

async function exercisePaymentSoftDeleteStateProtection(authHeaders, payment) {
  const before = await getPaymentDetail(authHeaders, payment.id, "GET /leasing/payments/:id before protected soft delete");
  if (!before) return false;
  const idempotencyKey = buildIdempotencyKey("delete-payment-protected");
  const rejected = await request(`/leasing/payments/${payment.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/payments/:id protected payment", rejected.response.status, 400, rejected.body)) {
    return false;
  }
  const retry = await request(`/leasing/payments/${payment.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
      "x-idempotency-key": idempotencyKey
    }
  });
  if (!expectStatus("DELETE /leasing/payments/:id protected payment retry", retry.response.status, 400, retry.body)) {
    return false;
  }
  pass("DELETE /leasing/payments/:id protected retry remained failed instead of replaying success");

  const after = await getPaymentDetail(authHeaders, payment.id, "GET /leasing/payments/:id after protected soft delete");
  if (!after) return false;
  if (after.status === "90") {
    fail(`Protected payment unexpectedly changed to void; body=${summarizeBody(after)}`);
    return false;
  }
  if (normalizeMoney(after.unappliedAmount ?? after.unapplied_amount) !== normalizeMoney(before.unappliedAmount ?? before.unapplied_amount)) {
    fail(`Protected payment unapplied amount changed unexpectedly; before=${summarizeBody(before)}, after=${summarizeBody(after)}`);
    return false;
  }
  pass("DELETE /leasing/payments/:id rejected payment with application activity");
  return true;
}

async function listPaymentApplications(authHeaders, paymentId) {
  const result = await request(`/leasing/payments/${paymentId}/applications`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /leasing/payments/:id/applications", result.response.status, 200, result.body)) return null;
  const items = listItems(result.body);
  pass(`GET /leasing/payments/:id/applications returned ${items.length} item(s)`);
  return items;
}

function buildPaymentApplyPayload(receivableId, appliedAmount) {
  return {
    applications: [
      {
        receivable_id: receivableId,
        applied_amount: appliedAmount
      }
    ]
  };
}

async function exercisePaymentApplyIdempotency(authHeaders, payment, receivable) {
  const receivableId = receivable?.id;
  if (typeof receivableId !== "string" || receivableId.length === 0) {
    fail("payment apply idempotency test requires a receivable id");
    return false;
  }

  const payload = buildPaymentApplyPayload(receivableId, 0.01);
  const missingKey = await request(`/leasing/payments/${payment.id}/apply`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/payments/:id/apply missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("apply-payment");
  const first = await request(`/leasing/payments/${payment.id}/apply`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/payments/:id/apply first request", first.response.status, [200, 201], first.body)) {
    return false;
  }
  const firstData = unwrapData(first.body);
  if (firstData?.id !== payment.id) {
    fail(`POST /leasing/payments/:id/apply first request did not return expected payment id; body=${summarizeBody(first.body)}`);
    return false;
  }
  pass(`POST /leasing/payments/:id/apply applied payment ${payment.id}`);

  const replay = await request(`/leasing/payments/${payment.id}/apply`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /leasing/payments/:id/apply replay", replay.response.status, [200, 201], replay.body)) {
    return false;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== firstData.id) {
    fail(`POST /leasing/payments/:id/apply replay expected same payment id, got ${replayData?.id} vs ${firstData.id}`);
    return false;
  }
  pass("POST /leasing/payments/:id/apply replay returned cached response");

  const applications = await listPaymentApplications(authHeaders, payment.id);
  if (!applications) return false;
  const matches = applications.filter((item) => (item?.receivableId ?? item?.receivable_id ?? item?.receivable?.id) === receivableId);
  if (matches.length !== 1) {
    fail(`POST /leasing/payments/:id/apply replay created duplicate application rows; count=${matches.length}`);
    return false;
  }
  pass("GET /leasing/payments/:id/applications confirmed no duplicate application for replay");

  const conflict = await request(`/leasing/payments/${payment.id}/apply`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(buildPaymentApplyPayload(receivableId, 0.02))
  });
  if (!expectStatus("POST /leasing/payments/:id/apply conflict", conflict.response.status, 409, conflict.body)) {
    return false;
  }

  return true;
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Test run: ${testRunId}`);
  info(`Tenant/Park: ${tenantId}/${parkId}`);

  const loginOk = await login(adminUsername, adminPassword);
  if (!expectStatus("POST /auth/login", loginOk.response.status, 200, loginOk.body)) return;
  const accessToken = loginOk.body?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    fail("POST /auth/login did not return accessToken");
    return;
  }
  pass("POST /auth/login returned token");

  const authHeaders = { authorization: `Bearer ${accessToken}` };

  const contractListBefore = await request(`/leasing/contracts?page=1&page_size=10&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /leasing/contracts", contractListBefore.response.status, 200, contractListBefore.body)) return;
  if (listItems(contractListBefore.body).length === 0) {
    info("No existing matching contracts found; bootstrapping a temporary leasing chain");
  }

  const parkTenant = await ensureParkTenant(authHeaders);
  if (!parkTenant?.id) return;
  const building = await ensureBuilding(authHeaders);
  if (!building?.id) return;
  const floor = await ensureFloor(authHeaders, building.id);
  if (!floor?.id) return;
  const unit = await ensureUnit(authHeaders, building.id, floor.id);
  if (!unit?.id) return;

  const contract = await ensureContract(authHeaders, parkTenant.id);
  if (!contract?.id) return;
  const contractDetailBefore = await request(`/leasing/contracts/${contract.id}`, { headers: authHeaders });
  if (!expectStatus("GET /leasing/contracts/:id", contractDetailBefore.response.status, 200, contractDetailBefore.body)) return;
  const contractBeforeData = unwrapData(contractDetailBefore.body);
  if (!contractBeforeData?.id) {
    fail(`GET /leasing/contracts/:id did not return contract data; body=${summarizeBody(contractDetailBefore.body)}`);
    return;
  }
  pass(`GET /leasing/contracts/:id confirmed ${contractBeforeData.contractName ?? contractBeforeData.contractCode ?? contract.id}`);

  const linked = await exerciseContractUnitLinkIdempotency(authHeaders, contract.id, unit);
  if (!linked) return;

  const files = await ensureContractFiles(authHeaders);
  if (!files) return;

  const signedReady = await transitionContractToSigned(authHeaders, contract.id, files);
  if (!signedReady) return;

  const effectiveReady = await exerciseContractEffectiveIdempotency(authHeaders, contract.id);
  if (!effectiveReady) return;

  const effectiveDetail = await request(`/leasing/contracts/${contract.id}`, { headers: authHeaders });
  if (!expectStatus("GET /leasing/contracts/:id after effective", effectiveDetail.response.status, 200, effectiveDetail.body)) return;
  const effectiveDetailData = unwrapData(effectiveDetail.body);
  if (!effectiveDetailData || effectiveDetailData.id !== contract.id || typeof effectiveDetailData.status === "undefined") {
    fail(`GET /leasing/contracts/:id after effective invalid body=${summarizeBody(effectiveDetail.body)}`);
    return;
  }
  pass(`Contract detail after effective confirmed ${contract.id}`);

  const receivableGeneration = await generateReceivables(authHeaders, contract.id);
  if (!receivableGeneration) return;
  const batchGenerationDedupeOk = await exerciseReceivableBatchGenerationDedupe(authHeaders, contract.id);
  if (!batchGenerationDedupeOk) return;
  const receivables = await queryReceivables(authHeaders, contract.id);
  if (!receivables) return;
  if (receivables.length === 0) {
    fail(`No receivables returned for contract ${contract.id}`);
    return;
  }

  const manualReceivable = await exerciseReceivableCreateIdempotency(authHeaders, contract, parkTenant.id);
  if (!manualReceivable?.id) return;
  const receivableAllowedUpdateOk = await exerciseReceivableUpdateAllowedFields(authHeaders, manualReceivable);
  if (!receivableAllowedUpdateOk) return;
  const receivableSensitiveRejectOk = await exerciseReceivableUpdateSensitiveFieldRejection(authHeaders, manualReceivable);
  if (!receivableSensitiveRejectOk) return;
  const receivableSoftDeleteOk = await exerciseReceivableSoftDeleteAllowed(authHeaders, manualReceivable, contract.id);
  if (!receivableSoftDeleteOk) return;

  const paymentForUpdate = await createPayment(authHeaders, parkTenant.id, "create-payment-for-update");
  if (!paymentForUpdate?.id) return;
  const paymentUpdateOk = await exercisePaymentUpdateIdempotency(authHeaders, paymentForUpdate, parkTenant.id);
  if (!paymentUpdateOk) return;
  const paymentSoftDeleteOk = await exercisePaymentSoftDeleteAllowed(authHeaders, paymentForUpdate, parkTenant.id);
  if (!paymentSoftDeleteOk) return;

  const payment = await createPayment(authHeaders, parkTenant.id);
  if (!payment?.id) return;
  const paymentApplyOk = await exercisePaymentApplyIdempotency(authHeaders, payment, receivables[0]);
  if (!paymentApplyOk) return;
  const receivableStateProtectionOk = await exerciseReceivableUpdateStateProtection(authHeaders, receivables[0]);
  if (!receivableStateProtectionOk) return;
  const receivableSoftDeleteProtectionOk = await exerciseReceivableSoftDeleteStateProtection(authHeaders, receivables[0]);
  if (!receivableSoftDeleteProtectionOk) return;
  const paymentSoftDeleteProtectionOk = await exercisePaymentSoftDeleteStateProtection(authHeaders, payment);
  if (!paymentSoftDeleteProtectionOk) return;
  const paymentOk = await queryPayment(authHeaders, payment.id, parkTenant.id);
  if (!paymentOk) return;

  console.log("[PASS] first release leasing regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
