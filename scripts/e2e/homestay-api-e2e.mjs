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
  return `homestay-api-e2e-${action}-${runId}-${sequence}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

async function request(path, { token, idempotent = false, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = key(options.method ?? "request");
  if (options.body) {
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

async function tryRequest(path, { token, idempotent = false, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = key(options.method ?? "request");
  if (options.body) {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body: unwrap(body) };
}

async function uploadTurnoverPhoto(token, turnoverId) {
  const form = new FormData();
  form.append("biz_type", "homestay_turnover");
  form.append("biz_id", turnoverId);
  form.append(
    "file",
    new Blob([Buffer.from("homestay-turnover-evidence")], { type: "image/png" }),
    `turnover-${runId}.png`
  );
  const response = await fetch(`${apiBaseUrl}/files`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": key("turnover-photo")
    },
    body: form
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`POST /files -> ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  console.log(`[PASS] POST /files (${response.status})`);
  return unwrap(body);
}

async function run() {
  console.log(`[INFO] Homestay API E2E ${runId} against ${apiBaseUrl}`);
  const login = await request("/auth/login", {
    method: "POST",
    body: { tenantId, parkId, username, password }
  });
  const token = login.accessToken;
  assert(typeof token === "string" && token.length > 0, "authenticated through the real login API");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const departure = new Date(`${today}T00:00:00+08:00`);
  departure.setDate(departure.getDate() + 1);
  const tomorrow = departure.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const units = await request("/park-units?page=1&page_size=100", { token });
  let unit;
  for (const candidate of units.items) {
    const availability = await request("/property/occupancies/availability", {
      method: "POST",
      token,
      idempotent: true,
      body: {
        unit_id: candidate.id,
        start_at: `${today}T00:00:00+08:00`,
        end_at: `${tomorrow}T00:00:00+08:00`
      }
    });
    if (!availability.available) continue;
    await request(`/property/units/${candidate.id}/operation`, {
      method: "PUT",
      token,
      idempotent: true,
      body: { operating_status: "enabled", remark: "Homestay real API E2E" }
    });
    const operation = await request(`/property/units/${candidate.id}/operation`, { token });
    if (operation.operating_mode === "short_stay") {
      unit = candidate;
      break;
    }
    const transition = await tryRequest(`/property/units/${candidate.id}/mode-transitions`, {
      method: "POST",
      token,
      idempotent: true,
      body: { target_mode: "short_stay", reason: "Homestay real API E2E" }
    });
    if (transition.ok) {
      console.log(`[PASS] POST /property/units/${candidate.id}/mode-transitions (${transition.status})`);
      unit = candidate;
      break;
    }
  }
  assert(Boolean(unit?.id), "selected an available whole-unit property that can enter short-stay mode");
  const candidates = await request("/homestay/unit-candidates?page=1&page_size=100", { token });
  assert(candidates.items.some((candidate) => candidate.id === unit.id), "candidate API includes the enabled short-stay unit");

  const rateBodies = [
    {
      base_daily_rate: "301.00",
      free_cancel_before_hours: 24,
      late_cancel_fee_type: "fixed",
      late_cancel_fee_value: "20.00",
      checkout_requires_inspection: false
    },
    {
      base_daily_rate: "302.00",
      free_cancel_before_hours: 12,
      late_cancel_fee_type: "percentage",
      late_cancel_fee_value: "10.00",
      checkout_requires_inspection: false
    }
  ];
  const rateResults = await Promise.all(rateBodies.map((body) =>
    request(`/homestay/rates/${unit.id}`, { method: "PUT", token, idempotent: true, body })
  ));
  assert(rateResults.length === 2, "concurrent homestay rate writes both succeed");
  const rate = await request(
    `/homestay/rates/${unit.id}?date_from=${today}&date_to=${tomorrow}`,
    { token }
  );
  assert(["301.00", "302.00"].includes(rate.base_daily_rate), "persisted rate is one complete concurrent write");

  const identitySuffix = String(Date.now()).slice(-4);
  const guest = await request("/property/parties", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      party_type: "person",
      display_name: `Homestay guest ${runId}`,
      mobile: `13${String(Date.now()).slice(-9)}`,
      identity_document_type: "id_card",
      identity_number: `11010519900101${identitySuffix}`,
      source_domain: "homestay",
      consent_status: "granted"
    }
  });
  await request(`/property/parties/${guest.id}/verification`, {
    method: "POST",
    token,
    idempotent: true,
    body: { verification_status: "verified", remark: "Homestay API E2E identity verification" }
  });

  const booking = await request("/homestay/bookings", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      booking_code: `HS-E2E-${runId}`.slice(0, 64),
      unit_id: unit.id,
      booker_party_id: guest.id,
      arrival_date: today,
      departure_date: tomorrow,
      source_type: "direct",
      guest_count: 1,
      remark: "Homestay real API E2E"
    }
  });
  await request(`/homestay/bookings/${booking.id}/confirm`, {
    method: "POST",
    token,
    idempotent: true
  });
  await request(`/homestay/bookings/${booking.id}/guests`, {
    method: "POST",
    token,
    idempotent: true,
    body: { party_id: guest.id, is_primary: true, verification_status: "verified" }
  });
  const credential = await request(`/homestay/bookings/${booking.id}/credentials`, {
    method: "POST",
    token,
    idempotent: true,
    body: { credential_type: "card", credential_label: `E2E-${runId}`.slice(0, 100) }
  });
  await request(`/homestay/bookings/${booking.id}/check-in`, {
    method: "POST",
    token,
    idempotent: true
  });
  await request(`/homestay/bookings/${booking.id}/credentials/${credential.id}/return`, {
    method: "POST",
    token,
    idempotent: true
  });
  const checkout = await request(`/homestay/bookings/${booking.id}/check-out`, {
    method: "POST",
    token,
    idempotent: true
  });
  assert(checkout.booking.status === "checked_out", "checkout completes after creating its turnover task");
  assert(checkout.turnover.status === "pending", "checkout returns the generated turnover task");
  assert(Boolean(checkout.turnover.occupancyId), "turnover task owns an active availability lock");
  const openTurnovers = await request("/homestay/turnovers?status=open&page=1&page_size=100", { token });
  assert(
    openTurnovers.items.some((turnover) => turnover.id === checkout.turnover.id),
    "open turnover pagination includes the checkout task"
  );

  await request(`/homestay/turnovers/${checkout.turnover.id}/actions/start`, {
    method: "POST",
    token,
    idempotent: true,
    body: { assignee_name: "Homestay API E2E" }
  });
  const turnoverPhoto = await uploadTurnoverPhoto(token, checkout.turnover.id);
  const completed = await request(`/homestay/turnovers/${checkout.turnover.id}/actions/complete`, {
    method: "POST",
    token,
    idempotent: true,
    body: { photo_file_ids: [] }
  });
  assert(completed.status === "completed", "turnover completion releases the availability lock");
  assert(
    completed.photoFileIds.includes(turnoverPhoto.id),
    "turnover action recovers evidence uploaded before a reload"
  );
  const completedTurnovers = await request(
    "/homestay/turnovers?status=completed&page=1&page_size=100",
    { token }
  );
  assert(
    completedTurnovers.items.some((turnover) => turnover.id === checkout.turnover.id),
    "completed turnover history remains available through bounded pagination"
  );
  console.log(`[PASS] Homestay real API E2E completed: booking=${booking.id}, turnover=${checkout.turnover.id}`);
}

run().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
