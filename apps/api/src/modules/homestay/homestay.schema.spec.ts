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

test("homestay dashboard occupancy follows the requested stay date", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");

  assert.match(service, /booking\.arrival_date <= \$3::date/);
  assert.match(service, /booking\.departure_date > \$3::date/);
  assert.doesNotMatch(service, /FILTER \(WHERE booking\.status = 'checked_in'\)::int AS occupied/);
  assert.match(service, /booking\.actual_check_out_time AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(service, /booking\.status = 'checked_out'/);
});

test("homestay availability and check-in use current cross-domain truth", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");

  assert.match(service, /party\.verification_status = 'verified'/);
  assert.match(service, /party\.identity_number_hash IS NOT NULL/);
  assert.match(service, /FROM rel_leasing_contract_unit lease_unit/);
  assert.match(service, /contract\.status NOT IN \('90', '91'\)/);
  assert.match(service, /lease_unit\.start_date::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(service, /assertBusinessDate\(startValue, "arrival_date"\)/);
  assert.doesNotMatch(service, /businessDateStart\(startValue\.slice\(0, 10\)\)/);
});

test("guest registration locks the booking inside its write transaction", () => {
  const service = readFileSync(resolve(__dirname, "homestay.service.ts"), "utf8");
  const start = service.indexOf("async addGuest");
  const end = service.indexOf("async registerStay", start);
  const addGuest = service.slice(start, end);

  assert.match(addGuest, /this\.dataSource\.transaction\(async \(manager\)/);
  assert.match(addGuest, /this\.lockBooking\(manager, scope, bookingId\)/);
  assert.match(addGuest, /manager\.getRepository\(HomestayBookingGuestEntity\)/);
});
