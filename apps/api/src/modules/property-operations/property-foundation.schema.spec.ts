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

test("party key metadata migration is forward-only, scoped and auditable", () => {
  const migration = readFileSync(resolve(
    __dirname,
    "../../../../../database/migrations/000286_party_data_encryption_key_metadata.sql"
  ), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS identity_number_encryption_key_id varchar\(128\)/u);
  assert.match(migration, /SET identity_number_encryption_key_id = 'party-data-v1'/u);
  assert.match(migration, /identity_number_encryption_key_id = p_encryption_key_id/u);
  assert.match(migration, /identity_number_encryption_key_id = NULL/u);
  assert.match(migration, /party-data-key-metadata-update-draft-cas-definition-drift/u);
  assert.match(migration, /party-data-key-metadata-create-draft-cas-definition-drift/u);
  assert.match(migration, /ck_biz_party_identity_encryption_key_metadata/u);
  assert.match(migration, /ck_party_identity_snapshot_encryption_key_id_format/u);
  assert.match(migration, /ck_party_identity_submission_draft_key_id_format/u);
  assert.match(migration, /biz_party_data_key_rotation_receipt/u);
  assert.match(migration, /tenant_id varchar\(64\) NOT NULL/u);
  assert.match(migration, /park_id varchar\(64\) NOT NULL/u);
  assert.match(migration, /UNIQUE \(tenant_id, park_id, request_key\)/u);
  assert.doesNotMatch(migration, /PARTY_DATA_ENCRYPTION_KEY=/u);
});

test("production compose forwards the complete Party keyring contract", () => {
  const compose = readFileSync(resolve(
    __dirname,
    "../../../../../infra/docker/docker-compose.prod.yml"
  ), "utf8");
  assert.match(compose, /PARTY_DATA_ENCRYPTION_KEY:/u);
  assert.match(compose, /PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID:/u);
  assert.match(compose, /PARTY_DATA_ENCRYPTION_KEYRING:/u);
  assert.match(compose, /PARTY_DATA_IDENTITY_HASH_KEY:/u);
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
  assert.match(activateInTransaction, /lock_property_unit_scope/);
  assert.ok(
    activateInTransaction.indexOf("const candidate = await repository.findOne")
      < activateInTransaction.indexOf("lock_property_unit_scope"),
    "occupancy activation must read the unit id before acquiring the advisory lock"
  );
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

test("force release approval SQL pins parameter types before inserting approval-owned audit rows", () => {
  const service = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  const executeApprovedForceRelease = service.slice(
    service.indexOf("async executeApprovedForceRelease"),
    service.indexOf("private requiredUuidPayload")
  );

  assert.match(executeApprovedForceRelease, /lock_property_unit_scope\(\$1::varchar, \$2::varchar, \$3::uuid\)/);
  assert.match(executeApprovedForceRelease, /request_id=\$3::uuid/);
  assert.match(executeApprovedForceRelease, /id=\$3::uuid AND version=\$4::integer/);
  assert.match(executeApprovedForceRelease, /SELECT \$1::varchar,\$2::varchar,\$3::uuid,\$4::varchar/);
  assert.match(executeApprovedForceRelease, /request\.id=\$14::uuid/);
});

test("apartment occupancy creation follows the canonical advisory-before-unit lock order", () => {
  const service = readFileSync(resolve(__dirname, "../apartments/apartments.service.ts"), "utf8");
  const candidates = service.slice(service.indexOf("unitCandidates"), service.indexOf("availableBeds"));
  const availableBeds = service.slice(service.indexOf("availableBeds"), service.indexOf("async createRoom"));
  const createRoom = service.slice(service.indexOf("async createRoom"), service.indexOf("async updateRoom"));
  const updateRoom = service.slice(service.indexOf("async updateRoom"), service.indexOf("listApplications"));
  const allocate = service.slice(service.indexOf("async allocate"), service.indexOf("listStays"));

  assert.match(service, /UNIT_USAGE_HOUSING/);
  assert.match(candidates, /u\.usage_type=\$7/);
  assert.match(candidates, /filterParameters=\[[\s\S]*UNIT_USAGE_HOUSING\]/);
  assert.match(availableBeds, /u\.is_deleted=false AND u\.usage_type=\$5/);
  assert.match(updateRoom, /dto\.management_status\s*===\s*"enabled"/);
  assert.match(updateRoom, /loadCandidate\(manager,scope,room\.unit_id,id\)/);
  assert.match(allocate, /u\.is_deleted=false AND u\.usage_type=\$5/);
  assert.ok(createRoom.indexOf("lock_property_unit_scope") < createRoom.indexOf("FOR UPDATE"));
  assert.match(createRoom, /SELECT id,usage_type FROM biz_unit/);
  assert.match(createRoom, /Number\(unit\[0\]\.usage_type\) !== UNIT_USAGE_HOUSING/);
  assert.ok(createRoom.indexOf("FOR UPDATE") < createRoom.indexOf("UNIT_USAGE_HOUSING"));
  assert.ok(createRoom.indexOf("UNIT_USAGE_HOUSING") < createRoom.indexOf("INSERT INTO biz_apartment_room"));
  assert.ok(createRoom.indexOf("FOR UPDATE") < createRoom.indexOf("INSERT INTO biz_property_occupancy"));
});
