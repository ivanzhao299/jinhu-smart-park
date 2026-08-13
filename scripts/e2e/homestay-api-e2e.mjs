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
  return `homestay-api-e2e-${action}-${runId}-${sequence}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

async function request(path, { token, idempotent = false, idempotencyKey, ...options } = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = idempotencyKey ?? key(options.method ?? "request");
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
  assert(approverUsername && approverPassword, "separated approval credentials are configured");
  const approverLogin = await request("/auth/login", {
    method: "POST",
    body: { tenantId, parkId, username: approverUsername, password: approverPassword }
  });
  const approverToken = approverLogin.accessToken;
  assert(typeof approverToken === "string" && approverToken.length > 0, "authenticated a separate approval actor");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const departure = new Date(`${today}T00:00:00+08:00`);
  departure.setDate(departure.getDate() + 1);
  const tomorrow = departure.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const dayAfterTomorrowDate = new Date(departure);
  dayAfterTomorrowDate.setDate(dayAfterTomorrowDate.getDate() + 1);
  const dayAfterTomorrow = dayAfterTomorrowDate.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const units = await request("/park-units?page=1&page_size=100", { token });
  let unit;
  for (const candidate of units.items) {
    const availability = await request("/property/occupancies/availability", {
      method: "POST",
      token,
      idempotent: true,
      body: {
        unitId: candidate.id,
        startAt: `${today}T00:00:00+08:00`,
        endAt: `${tomorrow}T00:00:00+08:00`
      }
    });
    if (!availability.available) continue;
    const currentOperation = await request(`/property/units/${candidate.id}/operation`, { token });
    await request(`/property/units/${candidate.id}/operation`, {
      method: "PUT",
      token,
      idempotent: true,
      body: { version: currentOperation.version, operating_status: "enabled", remark: "Homestay real API E2E" }
    });
    const operation = await request(`/property/units/${candidate.id}/operation`, { token });
    if (operation.configuredMode === "short_stay") {
      unit = candidate;
      break;
    }
  }
  assert(Boolean(unit?.id), "selected an explicitly configured available short-stay unit");
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
  const identitySubmissionId = guest.identitySummary?.currentSubmissionId;
  assert(typeof identitySubmissionId === "string", "party creation owns a draft identity submission");
  const identityDraft = await request(`/property/identity-submissions/${identitySubmissionId}`, { token });
  const identitySubmitKey = key("identity-submit");
  const submittedIdentity = await request(`/property/identity-submissions/${identitySubmissionId}/submit`, {
    method: "POST",
    token,
    idempotent: true,
    idempotencyKey: identitySubmitKey,
    body: { clientKey: identitySubmitKey, expectedVersion: identityDraft.version }
  });
  const identityClaimKey = key("identity-claim");
  await request(`/property/identity-submissions/${identitySubmissionId}/claim`, {
    method: "POST",
    token: approverToken,
    idempotent: true,
    idempotencyKey: identityClaimKey,
    body: {
      clientKey: identityClaimKey,
      expectedVersion: submittedIdentity.version,
      expectedAssignmentVersion: submittedIdentity.assignmentVersion
    }
  });
  await request(`/property/parties/${guest.id}/verification`, {
    method: "POST",
    token: approverToken,
    idempotent: true,
    body: { verification_status: "verified", remark: "Homestay API E2E identity verification" }
  });

  await request(`/park-units/${unit.id}`, {
    method: "PUT",
    token,
    idempotent: true,
    body: { status: 0 }
  });
  let inactiveUnitBooking;
  try {
    const inactiveRoomStates = await request(
      `/homestay/availability?date_from=${today}&date_to=${tomorrow}`,
      { token }
    );
    const inactiveRoomState = inactiveRoomStates.find((item) => item.unit_id === unit.id);
    assert(
      inactiveRoomState?.room_state === "out_of_service",
      "inactive unit is classified out of service instead of available"
    );
    inactiveUnitBooking = await tryRequest("/homestay/bookings", {
      method: "POST",
      token,
      idempotent: true,
      body: {
        booking_code: `HS-INACTIVE-${runId}`.slice(0, 64),
        unit_id: unit.id,
        booker_party_id: guest.id,
        arrival_date: today,
        departure_date: tomorrow,
        source_type: "direct",
        guest_count: 1
      }
    });
  } finally {
    await request(`/park-units/${unit.id}`, {
      method: "PUT",
      token,
      idempotent: true,
      body: { status: 1 }
    });
  }
  assert(inactiveUnitBooking.status === 409, "inactive unit cannot create a homestay booking");

  await request(`/homestay/rates/${unit.id}`, {
    method: "PUT",
    token,
    idempotent: true,
    body: {
      base_daily_rate: "9999999999999999.99",
      free_cancel_before_hours: 24,
      late_cancel_fee_type: "fixed",
      late_cancel_fee_value: "0.00",
      checkout_requires_inspection: false
    }
  });
  let overflowingBooking;
  try {
    overflowingBooking = await tryRequest("/homestay/bookings", {
      method: "POST",
      token,
      idempotent: true,
      body: {
        booking_code: `HS-OVERFLOW-${runId}`.slice(0, 64),
        unit_id: unit.id,
        booker_party_id: guest.id,
        arrival_date: today,
        departure_date: dayAfterTomorrow,
        source_type: "direct",
        guest_count: 1
      }
    });
  } finally {
    await request(`/homestay/rates/${unit.id}`, {
      method: "PUT",
      token,
      idempotent: true,
      body: {
        base_daily_rate: rate.base_daily_rate,
        free_cancel_before_hours: rate.cancellation_policy.free_cancel_before_hours,
        late_cancel_fee_type: rate.cancellation_policy.late_cancel_fee_type,
        late_cancel_fee_value: rate.cancellation_policy.late_cancel_fee_value,
        checkout_requires_inspection: rate.checkout_requires_inspection
      }
    });
  }
  assert(overflowingBooking.status === 400, "nightly sum exceeding numeric(18,2) is rejected before persistence");

  const futureBooking = await request("/homestay/bookings", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      booking_code: `HS-FUTURE-${runId}`.slice(0, 64),
      unit_id: unit.id,
      booker_party_id: guest.id,
      arrival_date: tomorrow,
      departure_date: dayAfterTomorrow,
      source_type: "direct",
      guest_count: 1,
      remark: "Future no-show boundary E2E"
    }
  });
  await request(`/homestay/bookings/${futureBooking.id}/confirm`, {
    method: "POST",
    token,
    idempotent: true
  });
  const earlyNoShow = await tryRequest(`/homestay/bookings/${futureBooking.id}/no-show`, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "must be rejected before arrival" }
  });
  assert(earlyNoShow.status === 409, "future booking cannot be marked no-show before arrival");
  const futureCancellation = await request(`/homestay/bookings/${futureBooking.id}/cancel`, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "clean up future no-show boundary E2E" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: futureCancellation, label: "future booking cancellation" });

  const releasedOccupancyBooking = await request("/homestay/bookings", {
    method: "POST",
    token,
    idempotent: true,
    body: {
      booking_code: `HS-RELEASED-${runId}`.slice(0, 64),
      unit_id: unit.id,
      booker_party_id: guest.id,
      arrival_date: today,
      departure_date: tomorrow,
      source_type: "direct",
      guest_count: 1,
      remark: "Forced occupancy release E2E"
    }
  });
  await request(`/homestay/bookings/${releasedOccupancyBooking.id}/confirm`, {
    method: "POST",
    token,
    idempotent: true
  });
  await request(`/homestay/bookings/${releasedOccupancyBooking.id}/guests`, {
    method: "POST",
    token,
    idempotent: true,
    body: { party_id: guest.id, is_primary: true, verification_status: "verified" }
  });
  await request(`/property/occupancies/${releasedOccupancyBooking.occupancyId}/release`, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "Homestay forced release regression", force: true }
  });
  const releasedOccupancyReschedule = await tryRequest(
    `/homestay/bookings/${releasedOccupancyBooking.id}/reschedule`,
    {
      method: "POST",
      token,
      idempotent: true,
      body: {
        arrival_date: today,
        departure_date: tomorrow,
        reason: "force-released occupancy must not be resurrected"
      }
    }
  );
  assert(
    releasedOccupancyReschedule.status === 409,
    "force-released booking occupancy cannot be resurrected by rescheduling"
  );
  const releasedOccupancyCheckIn = await tryRequest(
    `/homestay/bookings/${releasedOccupancyBooking.id}/check-in`,
    { method: "POST", token, idempotent: true }
  );
  assert(
    releasedOccupancyCheckIn.status === 409,
    "booking cannot check in after its occupancy was force released"
  );
  const releasedOccupancyCancellation = await request(`/homestay/bookings/${releasedOccupancyBooking.id}/cancel`, {
    method: "POST",
    token,
    idempotent: true,
    body: { reason: "clean up forced occupancy release E2E" }
  });
  await approveAndWait({ request, token: approverToken, createKey: key, assert, submission: releasedOccupancyCancellation, label: "released occupancy booking cancellation" });

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
  const bookings = await request("/homestay/bookings?page=1&page_size=20", { token });
  assert(
    bookings.items.some((item) => item.id === booking.id),
    "operational booking remains on the first page ahead of historical records"
  );
  const listedBooking = bookings.items.find((item) => item.id === booking.id);
  assert(listedBooking?.unitCode === unit.unitCode, "booking list returns its own unit code");
  assert(listedBooking?.unitName === unit.unitName, "booking list returns its own unit name");
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
  const checkedInDashboard = await request("/homestay/dashboard", { token });
  const returnedCredential = await request(`/homestay/bookings/${booking.id}/credentials/${credential.id}/return`, {
    method: "POST",
    token,
    idempotent: true
  });
  const replayedCredentialReturn = await request(
    `/homestay/bookings/${booking.id}/credentials/${credential.id}/return`,
    { method: "POST", token, idempotent: true }
  );
  assert(
    replayedCredentialReturn.returnedAt === returnedCredential.returnedAt,
    "credential return replay preserves the original return timestamp"
  );
  const checkout = await request(`/homestay/bookings/${booking.id}/check-out`, {
    method: "POST",
    token,
    idempotent: true
  });
  assert(checkout.booking.status === "checked_out", "checkout completes after creating its turnover task");
  assert(checkout.turnover.status === "pending", "checkout returns the generated turnover task");
  assert(Boolean(checkout.turnover.occupancyId), "turnover task owns an active availability lock");
  await request(`/homestay/bookings/${booking.id}/ledger`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      entry_type: "payment",
      charge_type: "room_collection",
      amount: "1.00",
      payment_method: "cash",
      reason: "Post-checkout finance registration E2E"
    }
  });
  const checkedOutBookingDetail = await request(`/homestay/bookings/${booking.id}`, { token });
  assert(
    checkedOutBookingDetail.ledger_summary?.payments === "1.00",
    "checked-out booking remains readable and accepts authorized finance registration"
  );
  const checkedOutDashboard = await request("/homestay/dashboard", { token });
  assert(
    checkedOutDashboard.arrivals === checkedInDashboard.arrivals,
    "same-day checkout retains the booking in the arrival KPI"
  );
  const openTurnovers = await request("/homestay/turnovers?status=open&page=1&page_size=100", { token });
  assert(
    openTurnovers.items.some((turnover) => turnover.id === checkout.turnover.id),
    "open turnover pagination includes the checkout task"
  );
  const listedTurnover = openTurnovers.items.find((turnover) => turnover.id === checkout.turnover.id);
  assert(listedTurnover?.unitCode === unit.unitCode, "turnover list returns its own unit code");
  assert(listedTurnover?.unitName === unit.unitName, "turnover list returns its own unit name");

  await request(`/homestay/turnovers/${checkout.turnover.id}/actions/start`, {
    method: "POST",
    token,
    idempotent: true,
    body: { assignee_name: "Homestay API E2E" }
  });
  const turnoverPhoto = await uploadTurnoverPhoto(token, checkout.turnover.id);
  const exception = await request(`/homestay/turnovers/${checkout.turnover.id}/actions/exception`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      photo_file_ids: [],
      exception_description: "浴室地面发现顽固污渍，已现场复核并追加清洁",
      consumables: [{ name: "强力清洁剂", quantity: 0.5, unit: "瓶" }]
    }
  });
  assert(
    exception.exceptionDescription === "浴室地面发现顽固污渍，已现场复核并追加清洁",
    "turnover exception preserves the operator's actual field description"
  );
  assert(
    exception.consumables?.[0]?.name === "强力清洁剂"
      && exception.consumables?.[0]?.quantity === 0.5,
    "turnover exception persists consumable quantity and unit data"
  );
  const completed = await request(`/homestay/turnovers/${checkout.turnover.id}/actions/complete`, {
    method: "POST",
    token,
    idempotent: true,
    body: {
      photo_file_ids: exception.photoFileIds,
      consumables: [
        { name: "强力清洁剂", quantity: 0.5, unit: "瓶" },
        { name: "垃圾袋", quantity: 2, unit: "个" }
      ]
    }
  });
  assert(completed.status === "completed", "turnover completion releases the availability lock");
  assert(
    completed.photoFileIds.includes(turnoverPhoto.id),
    "turnover action recovers evidence uploaded before a reload"
  );
  assert(
    completed.consumables?.length === 2,
    "turnover completion preserves the submitted consumables list"
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
