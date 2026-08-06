import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { canonicalize } from "./canonical.mjs";
import { decodeJsonFile, validateSchema } from "./strict-decoder.mjs";
import { uuidV5 } from "./uuid-v5.mjs";

export const PROFILE_PATH = resolve(
  "scripts/e2e/property-remediation/profiles/a-base-v1.json"
);
export const PROFILE_SCHEMA_PATH = resolve(
  "scripts/e2e/property-remediation/contracts/a-base-contract.schema.json"
);

export const TABLE_ORDER = [
  "park",
  "building",
  "floor",
  "unit",
  "party",
  "property_occupancy",
  "booking",
  "booking_night",
  "turnover",
  "lease",
  "charge_plan",
  "housing_receivable",
  "purchase",
  "purchase_item",
  "handover",
  "work_order",
  "sys_file"
];

export const VALID_TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

export function loadProfile() {
  const profile = decodeJsonFile(PROFILE_PATH);
  const schema = decodeJsonFile(PROFILE_SCHEMA_PATH);
  validateSchema(profile, schema, PROFILE_PATH);
  if (profile.park_distribution.reduce((sum, value) => sum + value, 0) !== 100) {
    throw new Error("park distribution must total 100");
  }
  return Object.freeze(profile);
}

function id(profile, kind, index) {
  return uuidV5(`${profile.seed}:${kind}:${index}`, profile.uuid_namespace);
}

export function scopeForProfile(profile) {
  return {
    tenantId: id(profile, "tenant", 0),
    parkIds: [0, 1, 2].map((index) => id(profile, "park-scope", index))
  };
}

function parkIndexFor(index, total) {
  const position = index % total;
  const first = Math.floor(total * 0.6);
  const second = Math.floor(total * 0.9);
  if (position < first) return 0;
  if (position < second) return 1;
  return 2;
}

function countFor(profile, table) {
  const count = profile.expected_counts[table];
  if (!Number.isInteger(count)) throw new Error(`unknown profile table ${table}`);
  return count;
}

export function* rowsForTable(profile, table) {
  const { tenantId, parkIds } = scopeForProfile(profile);
  const clock = profile.business_clock;
  const count = countFor(profile, table);
  for (let index = 0; index < count; index += 1) {
    const parkIndex = table === "park" || table === "building" || table === "floor"
      ? index
      : parkIndexFor(index, count);
    const parkId = parkIds[parkIndex];
    const unitIndexWithinPark =
      index % profile.park_distribution[parkIndex];
    const unitGlobalOffset = [0, 60, 90][parkIndex] + unitIndexWithinPark;
    const base = {
      id: id(profile, table, index),
      tenant_id: tenantId,
      park_id: parkId,
      create_time: clock,
      update_time: clock,
      is_deleted: false,
      version: 1,
      remark: profile.scope_marker
    };
    if (table === "park") {
      yield {
        ...base,
        park_code: `PR192-A-P${index + 1}`,
        park_name: `PR192 A-base Test Park ${index + 1}`,
        status: 1
      };
    } else if (table === "building") {
      yield {
        ...base,
        building_code: `PR192-A-B${index + 1}`,
        building_name: `PR192 A-base Building ${index + 1}`,
        floor_count: 1,
        status: 1,
        sort_no: index + 1
      };
    } else if (table === "floor") {
      yield {
        ...base,
        building_id: id(profile, "building", index),
        floor_code: `PR192-A-F${index + 1}`,
        floor_no: 1,
        floor_name: "1F",
        status: 1,
        sort_no: 1
      };
    } else if (table === "unit") {
      yield {
        ...base,
        building_id: id(profile, "building", parkIndex),
        floor_id: id(profile, "floor", parkIndex),
        unit_code: `PR192-A-U${String(index + 1).padStart(3, "0")}`,
        unit_name: `A-base Unit ${index + 1}`,
        usage_type: 1,
        unit_area: "45.00",
        use_area: "42.00",
        rental_status: 10,
        fitting_status: 20,
        status: 1
      };
    } else if (table === "party") {
      yield {
        ...base,
        party_type: "person",
        display_name: `A-base Party ${index + 1}`,
        source_domain: index < 2000 ? "homestay" : "housing_rental",
        verification_status: "unverified",
        consent_status: "pending"
      };
    } else if (table === "property_occupancy") {
      const slot = Math.floor(index / 100);
      yield {
        ...base,
        unit_id: id(profile, "unit", unitGlobalOffset),
        source_domain: slot % 2 === 0 ? "homestay" : "housing_rental",
        source_type: "a_base_fixture",
        source_id: id(profile, "occupancy-source", index),
        start_at: `2024-${String((slot % 12) + 1).padStart(2, "0")}-01T00:00:00Z`,
        end_at: `2024-${String((slot % 12) + 1).padStart(2, "0")}-02T00:00:00Z`,
        status: "completed"
      };
    } else if (table === "booking") {
      yield {
        ...base,
        booking_code: `AB${String(index + 1).padStart(10, "0")}`,
        unit_id: id(profile, "unit", unitGlobalOffset),
        booker_party_id: id(profile, "party", index % 2000),
        status: "checked_out",
        arrival_date: "2025-01-01",
        departure_date: "2025-01-03",
        source_type: "manual",
        guest_count: 1,
        currency: "CNY",
        room_amount: "400.00",
        adjustment_amount: "0.00",
        total_amount: "400.00",
        cancellation_policy_snapshot: {}
      };
    } else if (table === "booking_night") {
      const bookingIndex = Math.floor(index / 2);
      yield {
        ...base,
        booking_id: id(profile, "booking", bookingIndex),
        business_date: index % 2 === 0 ? "2025-01-01" : "2025-01-02",
        base_rate: "200.00",
        final_rate: "200.00",
        price_source: "base"
      };
    } else if (table === "turnover") {
      yield {
        ...base,
        booking_id: id(profile, "booking", index),
        unit_id: id(profile, "unit", unitGlobalOffset),
        status: "completed",
        completed_at: clock,
        photo_file_ids: [],
        consumables: []
      };
    } else if (table === "lease") {
      yield {
        ...base,
        lease_code: `AL${String(index + 1).padStart(10, "0")}`,
        unit_id: id(profile, "unit", unitGlobalOffset),
        tenant_party_id: id(profile, "party", 2000 + index),
        status: "active",
        start_date: "2025-01-01",
        end_date: "2026-01-01",
        payment_cycle_months: 1,
        billing_day: 1,
        monthly_rent: "3000.00",
        deposit_amount: "3000.00",
        first_due_date: "2025-01-01",
        tail_period_rule: "prorate"
      };
    } else if (table === "charge_plan") {
      yield {
        ...base,
        lease_id: id(profile, "lease", index),
        charge_type: "rent",
        billing_source: "fixed",
        cycle_months: 1,
        amount: "3000.00",
        enabled: true
      };
    } else if (table === "housing_receivable") {
      const leaseIndex = index % 2000;
      const period = Math.floor(index / 2000);
      yield {
        ...base,
        lease_id: id(profile, "lease", leaseIndex),
        charge_plan_id: id(profile, "charge_plan", leaseIndex),
        source_type: "charge_plan",
        source_id: id(profile, "charge_plan", leaseIndex),
        charge_type: "rent",
        period_start: `2025-${String(period + 1).padStart(2, "0")}-01`,
        period_end: `2025-${String(period + 2).padStart(2, "0")}-01`,
        due_date: `2025-${String(period + 1).padStart(2, "0")}-05`,
        amount: "3000.00",
        paid_amount: "0.00",
        waived_amount: "0.00",
        status: "unpaid"
      };
    } else if (table === "purchase") {
      yield {
        ...base,
        purchase_code: `AP${String(index + 1).padStart(10, "0")}`,
        unit_id: id(profile, "unit", unitGlobalOffset),
        vendor_name: "A-base Test Vendor",
        purchase_date: "2025-01-01",
        cost_category: "supplies",
        total_amount: "20.00",
        approval_status: "approved",
        payment_status: "unpaid",
        receipt_file_ids: []
      };
    } else if (table === "purchase_item") {
      yield {
        ...base,
        purchase_id: id(profile, "purchase", Math.floor(index / 2)),
        item_name: `A-base Item ${(index % 2) + 1}`,
        quantity: "1.000",
        unit: "piece",
        unit_price: "10.00",
        amount: "10.00"
      };
    } else if (table === "handover") {
      yield {
        ...base,
        lease_id: id(profile, "lease", index),
        handover_type: "move_in",
        status: "completed",
        handover_at: clock,
        item_snapshot: [],
        meter_readings: [],
        credentials: [],
        photo_file_ids: [],
        damage_amount: "0.00",
        unsettled_amount: "0.00",
        deposit_deduction_amount: "0.00"
      };
    } else if (table === "work_order") {
      yield {
        ...base,
        wo_code: `AW${String(index + 1).padStart(10, "0")}`,
        title: `A-base Work Order ${index + 1}`,
        wo_type: "repair",
        priority: "normal",
        status: "10",
        source_type: "housing",
        source_id: id(profile, "lease", index),
        unit_id: id(profile, "unit", unitGlobalOffset),
        description: "PR192 A-base isolated fixture"
      };
    } else if (table === "sys_file") {
      const handoverBase = [0, 600, 900][parkIndex];
      const handoverCount = [600, 300, 100][parkIndex];
      const fileParkStart = [0, 1200, 1800][parkIndex];
      const targetIndex =
        handoverBase + ((index - fileParkStart) % handoverCount);
      yield {
        ...base,
        file_code: `AF${String(index + 1).padStart(10, "0")}`,
        original_name: `a-base-${index + 1}.png`,
        stored_name: `${id(profile, "sys_file", index)}.png`,
        file_url: `/property-remediation/a-base/${id(profile, "sys_file", index)}.png`,
        file_size: VALID_TEST_PNG.length,
        mime_type: "image/png",
        md5: "e44e7ecfec99356632c13cd3eaa3e250",
        biz_type: "housing_handover",
        biz_id: id(profile, "handover", targetIndex),
        storage_type: "local",
        storage_path: `property-remediation/a-base/${id(profile, "sys_file", index)}.png`,
        is_encrypted: false,
        status: 1
      };
    } else {
      throw new Error(`unsupported profile table ${table}`);
    }
  }
}

export function computeProfileChecksum(profile) {
  const hash = createHash("sha256");
  hash.update(
    canonicalize({
      schema_version: profile.schema_version,
      profile: profile.profile,
      profile_version: profile.profile_version,
      generator_version: profile.generator_version,
      seed: profile.seed,
      business_clock: profile.business_clock,
      timezone: profile.timezone,
      uuid_namespace: profile.uuid_namespace,
      expected_counts: profile.expected_counts,
      park_distribution: profile.park_distribution,
      track_b_tables: profile.track_b_tables
    })
  );
  for (const table of TABLE_ORDER) {
    hash.update(`\n${table}\n`);
    let actual = 0;
    for (const row of rowsForTable(profile, table)) {
      hash.update(canonicalize(row));
      hash.update("\n");
      actual += 1;
    }
    if (actual !== profile.expected_counts[table]) {
      throw new Error(`${table}: expected ${profile.expected_counts[table]}, got ${actual}`);
    }
  }
  return hash.digest("hex");
}

export function collectDistribution(profile, table) {
  const { parkIds } = scopeForProfile(profile);
  const counts = new Map(parkIds.map((parkId) => [parkId, 0]));
  for (const row of rowsForTable(profile, table)) {
    counts.set(row.park_id, (counts.get(row.park_id) ?? 0) + 1);
  }
  return parkIds.map((parkId) => counts.get(parkId));
}
