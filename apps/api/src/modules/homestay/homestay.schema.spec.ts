import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import {
  HomestayBookingEntity,
  HomestayBookingNightEntity,
  HomestayLedgerEntryEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";

test("homestay entities map core booking, nightly price, finance, and turnover tables", () => {
  const tables = getMetadataArgsStorage().tables;
  assert.equal(tables.find((item) => item.target === HomestayBookingEntity)?.name, "biz_homestay_booking");
  assert.equal(tables.find((item) => item.target === HomestayBookingNightEntity)?.name, "biz_homestay_booking_night");
  assert.equal(tables.find((item) => item.target === HomestayLedgerEntryEntity)?.name, "biz_homestay_ledger_entry");
  assert.equal(tables.find((item) => item.target === HomestayTurnoverTaskEntity)?.name, "biz_homestay_turnover_task");
});

test("homestay migration preserves nightly snapshots and checkout turnover linkage", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000177_homestay_mvp.sql"),
    "utf8"
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_homestay_booking_night/);
  assert.match(migration, /base_rate numeric\(18,2\)/);
  assert.match(migration, /override_rate numeric\(18,2\)/);
  assert.match(migration, /final_rate numeric\(18,2\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_homestay_turnover_task/);
  assert.match(migration, /occupancy_id uuid REFERENCES biz_property_occupancy/);
});

test("homestay migration keeps integrations reserved but disconnected", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000177_homestay_mvp.sql"),
    "utf8"
  );
  assert.match(migration, /external_order_no varchar\(100\)/);
  assert.match(migration, /channel_sync_status varchar\(32\)/);
  assert.match(migration, /lock_device_id varchar\(100\)/);
  assert.match(migration, /temporary_code_task_status varchar\(32\)/);
  assert.match(migration, /payment_channel varchar\(64\)/);
  assert.match(migration, /transaction_reference varchar\(100\)/);
});

test("external order uniqueness normalizes a missing channel in a forward migration", () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      "../../../../../database/migrations/000181_homestay_external_order_null_channel_uniqueness.sql"
    ),
    "utf8"
  );
  assert.match(migration, /COALESCE\(channel_name, ''\)/);
  assert.match(migration, /external_order_no IS NOT NULL/);
  assert.match(migration, /HAVING count\(\*\) > 1/);
});

test("homestay dashboard occupancy follows the requested stay date", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");

  assert.match(service, /booking\.arrival_date <= \$3::date/);
  assert.match(service, /booking\.departure_date > \$3::date/);
  assert.doesNotMatch(service, /FILTER \(WHERE booking\.status = 'checked_in'\)::int AS occupied/);
  assert.match(service, /booking\.actual_check_out_time AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(service, /booking\.status = 'checked_out'/);
  assert.match(service, /round\(COALESCE\(avg\(night\.final_rate\), 0\), 2\)::text/);
  assert.doesNotMatch(service, /Number\(rateSummary\?\.average_daily_rate/);
  assert.match(service, /booking\.status IN \('confirmed','checked_in','checked_out'\)/);
  assert.match(service, /JOIN biz_unit unit/);
  assert.match(service, /unit\.is_deleted = false/);
  assert.match(service, /unit\.status = 1/);
  assert.match(
    service,
    /ON CONFLICT \(tenant_id, park_id, unit_id, business_date\) WHERE is_deleted = false/
  );
});

test("homestay availability and check-in use current cross-domain truth", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");

  assert.match(service, /identityVerifier.*verifyForCheckIn/s);
  assert.match(service, /expectedConsent: "granted"/);
  assert.match(service, /FOR UPDATE OF guest,party/);
  assert.match(service, /identity_evidence: identityEvidence/);
  assert.match(service, /FROM rel_leasing_contract_unit lease_unit/);
  assert.match(service, /contract\.status NOT IN \('90', '91'\)/);
  assert.match(service, /lease_unit\.start_date::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(service, /assertBusinessDate\(startValue, "arrival_date"\)/);
  assert.doesNotMatch(service, /businessDateStart\(startValue\.slice\(0, 10\)\)/);
  const availability = service.slice(
    service.indexOf("async availability"),
    service.indexOf("private async calculatePricing")
  );
  assert.match(availability, /WHEN unit\.status <> 1 THEN 'out_of_service'/);

  const checkIn = service.slice(
    service.indexOf("async checkIn"),
    service.indexOf("async checkOut")
  );
  assert.match(checkIn, /assertUnitBookable\(manager, scope, booking\.unitId\)/);
  assert.match(checkIn, /assertActiveBookingOccupancy\(manager, scope, booking\)/);
  assert.match(checkIn, /ORDER BY guest\.party_id FOR UPDATE OF guest,party/);
  assert.match(checkIn, /FROM rel_homestay_booking_guest guest/);
  assert.match(checkIn, /partyIds: guestRows\.map\(\(row\) => row\.partyId\)/);
  assert.match(checkIn, /assertHomestayGuestRosterComplete\(booking\.guestCount, identityEvidence\.length\)/);

  const occupancy = service.slice(
    service.indexOf("private async assertActiveBookingOccupancy"),
    service.indexOf("private assertStatus", service.indexOf("private async assertActiveBookingOccupancy"))
  );
  assert.match(occupancy, /sourceDomain: "homestay"/);
  assert.match(occupancy, /sourceType: "homestay_booking"/);
  assert.match(occupancy, /sourceId: booking\.id/);
  assert.match(occupancy, /status: "active"/);
  assert.match(occupancy, /occupancy\.startAt\.getTime\(\) !== expectedStart/);
  assert.match(occupancy, /occupancy\.endAt\.getTime\(\) !== expectedEnd/);

  const bookable = service.slice(service.indexOf("private async assertUnitBookable"));
  assert.match(bookable, /unit\.status !== 1/);
});

test("homestay rescheduling preserves the exact live occupancy lifecycle", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const reschedule = service.slice(
    service.indexOf("async rescheduleBooking"),
    service.indexOf("async addGuest")
  );
  assert.match(reschedule, /sourceDomain: "homestay"/);
  assert.match(reschedule, /sourceType: "homestay_booking"/);
  assert.match(reschedule, /sourceId: booking\.id/);
  assert.match(reschedule, /startAt: this\.businessDateStart\(booking\.arrivalDate\)/);
  assert.match(reschedule, /endAt: this\.businessDateStart\(booking\.departureDate\)/);
  assert.match(reschedule, /status: booking\.status === "confirmed" \? "active" : "held"/);
});

test("guest registration locks the booking inside its write transaction", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const start = service.indexOf("async addGuest");
  const end = service.indexOf("async registerStay", start);
  const addGuest = service.slice(start, end);

  assert.match(addGuest, /this\.dataSource\.transaction\(async \(manager\)/);
  assert.match(addGuest, /this\.lockBooking\(manager, scope, bookingId\)/);
  assert.match(addGuest, /manager\.getRepository\(PartyEntity\)/);
  assert.match(addGuest, /\.setLock\("pessimistic_read"\)/);
  assert.match(addGuest, /manager\.getRepository\(HomestayBookingGuestEntity\)/);
  assert.match(addGuest, /const existingPrimary = await repository\.findOne/);
  assert.match(addGuest, /dto\.is_primary && !existingPrimary/);
});

test("booking cancellation freezes credentials and occupancy before atomic approved execution", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const cancelStart = service.indexOf("async cancelBooking");
  const issueStart = service.indexOf("async issueCredential");
  const cancellation = service.slice(cancelStart, issueStart);
  assert.match(cancellation, /createPendingRequest\(/);
  assert.match(cancellation, /transaction_timestamp/);
  assert.match(cancellation, /cancellationEvaluationAt/);
  assert.match(cancellation, /credentials/);
  assert.match(cancellation, /occupancy/);
  assert.match(cancellation, /ledgerContributors/);
  assert.match(cancellation, /roomWaiverAmount/);
  assert.match(cancellation, /cancellationFeeAmount/);
  assert.match(cancellation, /executeApprovedCancellation/);
  assert.match(cancellation, /UPDATE biz_homestay_stay_credential/);
  assert.match(cancellation, /UPDATE biz_property_occupancy/);
  assert.match(cancellation, /UPDATE biz_homestay_booking/);
  assert.match(cancellation, /approval_execution_key/);

  const issueEnd = service.indexOf("async returnCredential");
  const issuance = service.slice(issueStart, issueEnd);
  assert.match(issuance, /this\.dataSource\.transaction/);
  assert.match(issuance, /this\.lockBooking\(manager, scope, bookingId\)/);
});

test("no-show revokes issued credentials before releasing occupancy", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const noShow = service.slice(service.indexOf("async markNoShow"), service.indexOf("async cancelBooking"));
  assert.match(noShow, /voidIssuedCredentials\(manager, scope, actor, id\)/);
  assert.match(noShow, /assertHomestayNoShowWindow\(new Date\(\), this\.businessDateStart\(booking\.arrivalDate\)\)/);
  assert.ok(noShow.indexOf("voidIssuedCredentials") < noShow.indexOf("releaseInTransaction"));
});

test("credential return locks the row and preserves the original return timestamp on replay", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const credentialReturn = service.slice(
    service.indexOf("async returnCredential"),
    service.indexOf("async checkIn")
  );
  assert.match(credentialReturn, /this\.dataSource\.transaction/);
  assert.match(credentialReturn, /lock: \{ mode: "pessimistic_write" \}/);
  assert.match(
    credentialReturn,
    /if \(credential\.status === "returned"\) return this\.projectCredential\(credential\)/
  );
  assert.match(credentialReturn, /Only issued credentials can be returned/);
});

test("turnover evidence is locked in the same transaction that binds it", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const resolver = service.slice(
    service.indexOf("private async resolveTurnoverPhotoFileIds"),
    service.indexOf("private async voidIssuedCredentials")
  );
  assert.match(resolver, /manager\.getRepository\(FileEntity\)/);
  assert.match(resolver, /\.setLock\("pessimistic_write"\)/);
  assert.match(resolver, /file\.biz_id = :turnoverTaskId/);
  assert.match(resolver, /associatedIds/);
  assert.doesNotMatch(resolver, /if \(ids\.length === 0\) return \[\]/);
});

test("rate reads expose every persisted field edited by the operations form", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const calendar = service.slice(
    service.indexOf("async getRateCalendar"),
    service.indexOf("async upsertRate")
  );
  assert.match(calendar, /base_daily_rate: config\.baseDailyRate/);
  assert.match(calendar, /checkout_requires_inspection: config\.checkoutRequiresInspection/);
  assert.match(calendar, /cancellation_policy: this\.cancellationSnapshot\(config\)/);
});

test("homestay operational lists use authoritative candidates and bounded turnover pages", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const candidates = service.slice(
    service.indexOf("async listUnitCandidates"),
    service.indexOf("async getRateCalendar")
  );
  assert.match(candidates, /operation\.operating_mode = 'short_stay'/);
  assert.match(candidates, /operation\.operating_status = 'enabled'/);
  assert.match(candidates, /LIMIT \$3 OFFSET \$4/);
  assert.match(candidates, /unit\.id = ANY\(\$5::uuid\[\]\)/);
  assert.match(candidates, /unit\.id = ANY\(\$3::uuid\[\]\)/);

  const turnovers = service.slice(
    service.indexOf("async listTurnovers"),
    service.indexOf("async executeTurnover")
  );
  assert.match(turnovers, /statuses: \["pending", "cleaning", "inspection", "exception"\]/);
  assert.match(turnovers, /\.getManyAndCount\(\)/);
  assert.match(turnovers, /unit_code AS "unitCode", unit_name AS "unitName"/);
  assert.match(turnovers, /id = ANY\(\$3::uuid\[\]\)/);
  assert.match(turnovers, /unitCode: unitDisplay\.get\(task\.unitId\)\?\.unitCode/);
  assert.match(turnovers, /page_size: query\.page_size/);
});

test("booking pricing and list projections fit their persistence and display contracts", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const list = service.slice(
    service.indexOf("async listBookings"),
    service.indexOf("async getBooking")
  );
  assert.match(list, /unit_code AS "unitCode",\s+unit\.unit_name AS "unitName"/);
  assert.match(list, /id = ANY\(\$3::uuid\[\]\)/);
  assert.match(list, /unitCode: unitDisplay\.get\(booking\.unitId\)\?\.unitCode/);
  assert.match(list, /unitName: unitDisplay\.get\(booking\.unitId\)\?\.unitName/);
  assert.match(list, /WHEN booking\.status = 'checked_in' THEN 0/);
  assert.match(list, /WHEN booking\.status = 'confirmed' THEN 1/);
  assert.match(list, /WHEN booking\.status = 'draft' THEN 2/);
  assert.match(list, /\.orderBy\("booking_operation_rank", "ASC"\)/);

  const pricing = service.slice(
    service.indexOf("private async calculatePricing"),
    service.indexOf("private async assertActiveBookingOccupancy")
  );
  assert.match(pricing, /assertHomestayMoneyFitsNumeric/);
});

test("booking-bound writes require readable booking context plus their action permission", () => {
  const controller = readFileSync(resolve(__dirname, "homestay.controller.ts"), "utf8");
  const bookingWrites = controller.slice(
    controller.indexOf('@Post("bookings/:id/confirm")'),
    controller.indexOf('@Get("turnovers")')
  );
  for (const permission of [
    "HOMESTAY_BOOKING_CONFIRM",
    "HOMESTAY_BOOKING_CANCEL",
    "HOMESTAY_BOOKING_RESCHEDULE",
    "HOMESTAY_STAY_MANAGE"
  ]) {
    assert.match(
      bookingWrites,
      new RegExp(`@RequirePermissions\\([\\s\\S]*?HOMESTAY_BOOKING_READ,[\\s\\S]*?${permission}`)
    );
  }
  const ledger = bookingWrites.slice(
    bookingWrites.indexOf('@Post("bookings/:id/ledger")')
  );
  assert.match(ledger, /@RequirePermissions\(SYSTEM_PERMISSIONS\.HOMESTAY_BOOKING_READ\)/);
  assert.match(ledger, /@RequireAnyPermissions\([\s\S]*HOMESTAY_FINANCE_REGISTER[\s\S]*HOMESTAY_FINANCE_WAIVE/);
});
