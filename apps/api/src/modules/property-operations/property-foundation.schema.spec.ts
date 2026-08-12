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
  assert.match(replacePeriod, /unit\.status !== 1/);
  assert.match(replacePeriod, /assertPropertyOccupancyReplaceable\(entity/);
  assert.doesNotMatch(replacePeriod, /entity\.status = status/);
  assert.doesNotMatch(replacePeriod, /entity\.releasedAt = null/);
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

  const homestay = readFileSync(
    resolve(__dirname, "../homestay/homestay-stay-command.service.ts"),
    "utf8"
  );
  const checkout = homestay.slice(
    homestay.indexOf("async checkOut"),
    homestay.indexOf("private mustUnitAccess")
  );
  assert.match(checkout, /sourceType: "homestay_turnover"/);
  assert.match(checkout, /sourceId: task\.id/);
});

test("live source aggregates remain mode-transition blockers after occupancy release", () => {
  const operations = readFileSync(resolve(__dirname, "property-operations.service.ts"), "utf8");
  const snapshot = operations.slice(
    operations.indexOf("private async buildTransitionSnapshot"),
    operations.lastIndexOf("\n}")
  );

  assert.match(snapshot, /FROM biz_housing_lease lease/);
  assert.match(snapshot, /lease\.status IN \('active', 'expiring', 'checkout_pending'\)/);
  assert.match(snapshot, /counts\.housing_lease_count/);
  assert.match(snapshot, /targetMode !== "long_rent"/);
  assert.match(snapshot, /FROM biz_homestay_booking booking/);
  assert.match(snapshot, /booking\.status IN \('confirmed', 'checked_in'\)/);
  assert.match(snapshot, /counts\.homestay_booking_count/);
  assert.match(snapshot, /targetMode !== "short_stay"/);
  assert.match(snapshot, /source_domain IN \('commercial_leasing', 'housing_rental', 'apartment'\)/);
});

test("party role creation normalizes keys and recovers a concurrent winner", () => {
  const service = readFileSync(resolve(__dirname, "parties.service.ts"), "utf8");
  const addRole = service.slice(service.indexOf("async addRole"), service.indexOf("async removeRole"));

  assert.match(addRole, /const roleType = dto\.role_type\.trim\(\)/);
  assert.match(addRole, /sourceType: sourceType \?\? IsNull\(\)/);
  assert.match(addRole, /if \(!this\.isUniqueViolation\(error\)\) throw error/);
  assert.match(addRole, /const concurrent = await this\.rolesRepository\.findOne\(\{ where \}\)/);
  assert.match(addRole, /if \(concurrent\) return concurrent/);
});

test("party document-type changes clear the old number through the identity draft adapter", () => {
  const service = readFileSync(resolve(__dirname, "parties.service.ts"), "utf8");
  const update = service.slice(service.indexOf("async update("), service.indexOf("async verify("));
  assert.match(
    update,
    /identityDocumentType = dto\.identity_document_type !== undefined[\s\S]+?: entity\.identityDocumentType/
  );
  assert.match(
    update,
    /identity = dto\.identity_number !== undefined[\s\S]+?: null;/
  );
  assert.match(
    update,
    /this\.identityAdapter\.writeDraft\([\s\S]+?identityDocumentType as[\s\S]+?identity,[\s\S]+?manager/
  );

  const adapter = readFileSync(
    resolve(__dirname, "../property-identity/legacy-party-identity.adapter.ts"),
    "utf8"
  );
  assert.match(
    adapter,
    /this\.identityService\.update\([\s\S]+?documentType,[\s\S]+?identityNumber,[\s\S]+?pendingFileIds: \[\]/
  );
});

test("generic occupancy creation rejects aggregates owned by business workflows", () => {
  const service = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  const create = service.slice(service.indexOf("async create("), service.indexOf("async createInTransaction"));

  assert.match(create, /isPropertyManagedOccupancyDomain/);
  assert.match(create, /throw new ForbiddenException\("Business-owned occupancies/);
  assert.ok(create.indexOf("ForbiddenException") < create.indexOf("createInTransaction"));
});

test("business occupancy lifecycle requires an active unit and owning-domain activation", () => {
  const service = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  const createInTransaction = service.slice(
    service.indexOf("async createInTransaction"),
    service.indexOf("async releaseInTransaction")
  );
  const activateInTransaction = service.slice(
    service.indexOf("async activateInTransaction"),
    service.indexOf("async replacePeriodInTransaction")
  );
  const replaceInTransaction = service.slice(
    service.indexOf("async replacePeriodInTransaction"),
    service.indexOf("async activate(", service.indexOf("async replacePeriodInTransaction"))
  );
  const activate = service.slice(
    service.indexOf("async activate("),
    service.indexOf("async release(", service.indexOf("async activate("))
  );
  const release = service.slice(
    service.indexOf("async release("),
    service.indexOf("async executeApprovedForceRelease")
  );

  assert.match(createInTransaction, /unit\.status !== 1/);
  assert.ok(
    createInTransaction.indexOf("lock_property_unit_scope")
      < createInTransaction.indexOf('getRepository(UnitEntity).findOne'),
    "occupancy creation must acquire the advisory unit lock before the unit row lock"
  );
  assert.match(activateInTransaction, /unit\.status !== 1/);
  assert.ok(
    activateInTransaction.indexOf("lock_property_unit_scope")
      < activateInTransaction.indexOf('lock: { mode: "pessimistic_write" }'),
    "occupancy activation must acquire the advisory unit lock before any occupancy or unit row lock"
  );
  assert.ok(
    replaceInTransaction.indexOf("lock_property_unit_scope")
      < replaceInTransaction.indexOf('lock: { mode: "pessimistic_write" }'),
    "occupancy replacement must acquire the advisory unit lock before any occupancy or unit row lock"
  );
  assert.match(activate, /Business-owned occupancies must be activated by their owning domain workflow/);
  assert.match(release, /this\.dataSource\.transaction/);
  assert.match(release, /this\.releaseInTransaction/);
  assert.doesNotMatch(release, /this\.occupanciesRepository\.save/);
});

test("apartment occupancy creation follows the canonical advisory-before-unit lock order", () => {
  const service = readFileSync(resolve(__dirname, "../apartments/apartments.service.ts"), "utf8");
  const createRoom = service.slice(service.indexOf("async createRoom"), service.indexOf("async updateRoom"));

  assert.ok(createRoom.indexOf("lock_property_unit_scope") < createRoom.indexOf("FOR UPDATE"));
  assert.ok(createRoom.indexOf("FOR UPDATE") < createRoom.indexOf("INSERT INTO biz_property_occupancy"));
});
