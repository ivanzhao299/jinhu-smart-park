import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const blueprintPath = process.env.PROPERTY_CANONICAL_BLUEPRINT_PATH
  ?? "docs/architecture/property-canonical-domain-blueprint.md";
const blueprint = readFileSync(resolve(root, blueprintPath), "utf8");

function marker(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = blueprint.match(new RegExp(`<!-- canonical:${escaped} (.+) -->`));
  assert.ok(match, `missing canonical blueprint marker: ${name}`);
  return JSON.parse(match[1]);
}

function stringArray(source, constantName) {
  const match = source.match(new RegExp(`export const ${constantName} = \\[([\\s\\S]*?)\\] as const`));
  assert.ok(match, `missing shared string-array constant: ${constantName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function constantValues(source, prefix) {
  return [...source.matchAll(new RegExp(`const ${prefix}_[A-Z_]+ = "([^"]+)";`, "g"))].map((item) => item[1]);
}

function unique(values) {
  return [...new Set(values)];
}

const shared = read("packages/shared/src/index.ts");
assert.deepEqual(marker("property.operating_modes"), stringArray(shared, "PROPERTY_OPERATING_MODES"));
assert.deepEqual(marker("property.operating_statuses"), stringArray(shared, "PROPERTY_OPERATING_STATUSES"));
assert.deepEqual(marker("property.occupancy_statuses"), stringArray(shared, "PROPERTY_OCCUPANCY_STATUSES"));
assert.deepEqual(marker("property.occupancy_domains"), stringArray(shared, "PROPERTY_OCCUPANCY_DOMAINS"));
assert.deepEqual(marker("housing.lease_statuses"), stringArray(shared, "HOUSING_LEASE_STATUSES"));
assert.ok(!marker("housing.lease_statuses").includes("signed"), "signed must not become a persisted housing status");
assert.ok(!marker("housing.lease_statuses").includes("renewed"), "renewed must not become a persisted housing status");

const leadService = read("apps/api/src/modules/leasing-leads/leasing-leads.service.ts");
const leadTransitionsSource = leadService.match(/const ALLOWED_LEAD_STATUS_TRANSITIONS = new Map<string, string\[]>\(\[([\s\S]*?)\]\);/);
assert.ok(leadTransitionsSource, "missing leasing lead transition map");
const leadTransitions = Object.fromEntries(
  [...leadTransitionsSource[1].matchAll(/\["([^"]+)", \[([^\]]*)\]\]/g)].map((entry) => [
    entry[1],
    [...entry[2].matchAll(/"([^"]+)"/g)].map((item) => item[1])
  ])
);
assert.deepEqual(marker("leasing.lead_transitions"), leadTransitions);

const leasingStatusSources = {
  "leasing.contract_statuses": ["apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts", "CONTRACT_STATUS", ["40"]],
  "leasing.receivable_statuses": ["apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts", "RECEIVABLE_STATUS", []],
  "leasing.payment_statuses": ["apps/api/src/modules/leasing-payments/leasing-payments.service.ts", "PAYMENT_STATUS", []],
  "leasing.invoice_statuses": ["apps/api/src/modules/leasing-invoices/leasing-invoices.service.ts", "INVOICE_STATUS", []],
  "leasing.waiver_statuses": ["apps/api/src/modules/leasing-waivers/leasing-waivers.service.ts", "WAIVER_STATUS", []],
  "leasing.checkout_statuses": ["apps/api/src/modules/leasing-checkouts/leasing-checkouts.service.ts", "CHECKOUT_STATUS", []]
};
for (const [name, [path, prefix, historicalLiterals]] of Object.entries(leasingStatusSources)) {
  const source = read(path);
  const actual = unique([...constantValues(source, prefix), ...historicalLiterals]).sort();
  assert.deepEqual([...marker(name)].sort(), actual, `${name} drifted from service constants`);
}

const endpoints = marker("endpoints");
const endpointKeys = new Set();
for (const endpoint of endpoints) {
  const key = `${endpoint.method} /api/v1/${endpoint.controller}/${endpoint.path}`;
  assert.ok(!endpointKeys.has(key), `duplicate canonical endpoint: ${key}`);
  endpointKeys.add(key);
  const controller = read(endpoint.file);
  assert.match(controller, new RegExp(`@Controller\\("${endpoint.controller.replaceAll("/", "\\/")} "?\\)`.replace(" ", "")), `${key} controller drifted`);
  assert.ok(controller.includes(`@${endpoint.method}("${endpoint.path}")`), `${key} decorator drifted`);
}

const endpointManifest = read("packages/shared/src/property-business/track-b-endpoint-permissions.ts");
assert.match(endpointManifest, /validatePropertyTrackBEndpointPermissionManifest/);
assert.match(endpointManifest, /PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST_SHA256/);
const accessManifest = read("packages/shared/src/property-business/access-manifest.ts");
assert.match(accessManifest, /validatePropertyAccessManifest/);
const require = createRequire(import.meta.url);
const sharedRuntime = require(resolve(root, "packages/shared/dist/index.js"));
assert.deepEqual(sharedRuntime.validatePropertyTrackBEndpointPermissionManifest(), []);
const accessValidation = sharedRuntime.validatePropertyAccessManifest();
assert.equal(accessValidation.valid, true, accessValidation.issues?.join("\n"));

const migrations = [
  "database/migrations/000038_s3b_leasing_lead_profile.sql",
  "database/migrations/000044_s3c_leasing_contract_core.sql",
  "database/migrations/000045_s3c_contract_unit_links.sql",
  "database/migrations/000052_s3d_leasing_receivable_core.sql",
  "database/migrations/000054_s3d_leasing_payments.sql",
  "database/migrations/000055_s3d_leasing_waivers.sql",
  "database/migrations/000056_s3d_leasing_invoices.sql",
  "database/migrations/000062_s3e_checkout_applications.sql",
  "database/migrations/000063_s3e_checkout_settlement_refund.sql",
  "database/migrations/000176_shared_property_foundation.sql",
  "database/migrations/000178_housing_rental_mvp.sql",
  "database/migrations/000187_property_b_event_notification_schema.sql",
  "database/migrations/000287_party_consent_retention_rights_foundation.sql"
].map(read).join("\n");
for (const table of marker("schema_tables")) {
  const tableBlock = migrations.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? (?:public\\.)?${table}\\b([\\s\\S]*?\\n\\);)`));
  assert.ok(tableBlock, `missing canonical schema table: ${table}`);
  for (const scopeColumn of ["tenant_id varchar(64) NOT NULL", "park_id varchar(64) NOT NULL"]) {
    assert.ok(tableBlock[1].includes(scopeColumn), `${table} missing canonical scope column: ${scopeColumn}`);
  }
}
assert.match(migrations, /ck_property_occupancy_status[\s\S]*'held'[\s\S]*'active'[\s\S]*'released'[\s\S]*'completed'[\s\S]*'cancelled'/);
assert.match(migrations, /ck_housing_lease_status[\s\S]*'pending_signature'[\s\S]*'expiring'[\s\S]*'checkout_pending'/);
assert.match(migrations, /ck_biz_leasing_checkout_status CHECK \(status IN \('10', '30', '40', '50', '60', '70', '91'\)\)/);
assert.deepEqual(marker("leasing.checkout_schema_statuses"), ["10", "30", "40", "50", "60", "70", "91"]);

const occupancyService = read("apps/api/src/modules/property-operations/property-occupancies.service.ts");
assert.match(occupancyService, /Business-owned occupancies must be created by their owning domain workflow/);
assert.match(occupancyService, /Business-owned occupancy must be released by its source workflow or force released/);
assert.match(occupancyService, /status = "active"/);
const rentalProjection = read("apps/api/src/modules/property-operations/rental-status-projection.service.ts");
assert.match(rentalProjection, /class RentalStatusProjectionService/);
assert.match(rentalProjection, /UnitStatusLogEntity/);
const eventContracts = read("apps/api/src/modules/property-approvals/outbox/property-event-runtime.contracts.ts");
for (const token of ["PropertyEventEnvelope", "PropertyEventPublisherPort", "InboxConsumeInput", "PropertyEventRuntimeStore", "prepareEventReplay"]) {
  assert.ok(eventContracts.includes(token), `missing property event runtime contract: ${token}`);
}
const housingTaskAdapter = read("apps/api/src/modules/housing/housing-task.adapter.ts");
assert.match(housingTaskAdapter, /PropertyTask/);
assert.match(blueprint, /append-only consent fact/);
assert.match(blueprint, /soft delete \+ `status=void`/);
assert.match(blueprint, /housing 与 traditional leasing 维持两个 bounded context/);

console.log(`property canonical domain blueprint contract passed: ${endpoints.length} owner endpoints, ${marker("schema_tables").length} schema tables`);
