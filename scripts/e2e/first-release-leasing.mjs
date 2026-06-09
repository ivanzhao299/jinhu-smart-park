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

async function ensureContract(authHeaders, parkTenantId) {
  const items = await fetchList("/leasing/contracts", testRunId, authHeaders);
  if (!items) return null;
  if (items.length === 0) {
    info("No matching contract found, creating a temporary draft contract");
  } else {
    info(`Found ${items.length} matching contract candidate(s); creating a fresh isolated draft contract`);
  }
  const payload = buildContractPayload(parkTenantId);
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
  const result = await request(`/leasing/contracts/${contractId}/generate-receivables`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("generate-receivables")
    },
    body: JSON.stringify({
      include_rent: true,
      include_deposit: true,
      include_property_fee: false,
      force_regenerate: false
    })
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
  return data;
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

async function createPayment(authHeaders, parkTenantId) {
  const payload = {
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
  const result = await request("/leasing/payments", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-payment")
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
  return created;
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
  const receivables = await queryReceivables(authHeaders, contract.id);
  if (!receivables) return;
  if (receivables.length === 0) {
    fail(`No receivables returned for contract ${contract.id}`);
    return;
  }

  const payment = await createPayment(authHeaders, parkTenant.id);
  if (!payment?.id) return;
  const paymentApplyOk = await exercisePaymentApplyIdempotency(authHeaders, payment, receivables[0]);
  if (!paymentApplyOk) return;
  const paymentOk = await queryPayment(authHeaders, payment.id, parkTenant.id);
  if (!paymentOk) return;

  console.log("[PASS] first release leasing regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
