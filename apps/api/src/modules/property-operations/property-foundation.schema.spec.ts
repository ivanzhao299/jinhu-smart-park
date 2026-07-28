import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { PartyEntity } from "./entities/party.entity";
import { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from "./entities/property-operation-config.entity";

test("shared property entities map to the expected tables", () => {
  const tables = getMetadataArgsStorage().tables;
  assert.equal(tables.find((item) => item.target === PropertyOperationConfigEntity)?.name, "biz_property_operation_config");
  assert.equal(tables.find((item) => item.target === PropertyOccupancyEntity)?.name, "biz_property_occupancy");
  assert.equal(tables.find((item) => item.target === PartyEntity)?.name, "biz_party");
});

test("shared property migration enforces physical mapping and occupancy exclusion", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000176_shared_property_foundation.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS asset_unit_id uuid/);
  assert.match(migration, /FOREIGN KEY \(asset_unit_id, tenant_id, park_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_property_occupancy/);
  assert.match(migration, /tstzrange\(start_at, end_at, '\[\)'\)/);
  assert.match(migration, /EXCLUDE USING gist/);
  assert.match(migration, /status IN \('held', 'active'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /trg_property_occupancy_contract_exclusion/);
  assert.match(migration, /trg_contract_unit_property_exclusion/);
});

test("shared property migration keeps encrypted party identity fields separate from masked projection", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000176_shared_property_foundation.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /identity_number_encrypted text/);
  assert.match(migration, /identity_number_hash varchar\(80\)/);
  assert.match(migration, /identity_number_masked varchar\(64\)/);
});

test("commercial contract compatibility uses Shanghai business-day boundaries", () => {
  const migrationPath = resolve(
    __dirname,
    "../../../../../database/migrations/000179_property_contract_business_timezone.sql"
  );
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /start_date::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(migration, /\(relation\.end_date \+ 1\)::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(migration, /occupancy\.end_at > \(NEW\.start_date::timestamp AT TIME ZONE 'Asia\/Shanghai'\)/);
  assert.match(migration, /\(NEW\.end_date \+ 1\)::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
});

test("commercial contract availability queries use the same Shanghai boundaries", () => {
  const servicePath = resolve(__dirname, "property-occupancies.service.ts");
  const service = readFileSync(servicePath, "utf8");

  assert.match(service, /relation\.start_date::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
  assert.match(service, /\(relation\.end_date \+ 1\)::timestamp AT TIME ZONE 'Asia\/Shanghai'/);
});

test("mode transition blockers compare commercial expiry at the Shanghai business date", () => {
  const servicePath = resolve(__dirname, "property-operations.service.ts");
  const service = readFileSync(servicePath, "utf8");

  assert.match(service, /now\(\) AT TIME ZONE 'Asia\/Shanghai'/);
  assert.doesNotMatch(service, /> current_date/);
});

test("occupancy period replacement rechecks enabled operation and releases expired holds", () => {
  const service = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  const replacePeriod = service.slice(
    service.indexOf("async replacePeriodInTransaction"),
    service.indexOf("async activate(", service.indexOf("async replacePeriodInTransaction"))
  );
  assert.match(replacePeriod, /releaseExpiredHolds\(manager, scope, actor, entity\.unitId\)/);
  assert.match(replacePeriod, /config\?\.operatingStatus !== "enabled"/);
});

test("initial occupancy conflict checks do not null-filter commercial leases", () => {
  const service = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  assert.match(
    service,
    /\$6::text IS NOT NULL AND \$7::text IS NOT NULL\s+AND \$6::text = 'leasing_contract'/
  );
});

test("open turnover tasks remain shared availability and mode-transition blockers", () => {
  const occupancies = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  assert.match(occupancies, /'operations_task'::text AS conflict_type/);
  assert.match(occupancies, /FROM biz_homestay_turnover_task task/);
  assert.match(occupancies, /task\.status <> 'completed'/);
  assert.match(
    occupancies,
    /\$6::text = 'homestay_turnover' AND task\.id::text = \$7::text/
  );

  const operations = readFileSync(resolve(__dirname, "property-operations.service.ts"), "utf8");
  const snapshot = operations.slice(
    operations.indexOf("private async buildTransitionSnapshot"),
    operations.lastIndexOf("\n}")
  );
  assert.match(snapshot, /FROM biz_homestay_turnover_task task/);
  assert.match(snapshot, /task\.status <> 'completed'/);

  const homestay = readFileSync(resolve(__dirname, "../homestay/homestay.service.ts"), "utf8");
  const checkout = homestay.slice(
    homestay.indexOf("async checkOut"),
    homestay.indexOf("async registerLedgerEntry")
  );
  assert.match(checkout, /sourceType: "homestay_turnover"/);
  assert.match(checkout, /sourceId: task\.id/);
});

test("party document-type changes cannot retain an identity from the old document type", () => {
  const service = readFileSync(resolve(__dirname, "parties.service.ts"), "utf8");
  assert.match(service, /entity\.identityDocumentType !== previousIdentityDocumentType/);
  assert.match(service, /entity\.identityNumberEncrypted = null/);
  assert.match(service, /entity\.identityNumberHash = null/);
});
