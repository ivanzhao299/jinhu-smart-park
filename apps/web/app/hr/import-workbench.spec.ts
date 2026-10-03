import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HR_PERMISSIONS, YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, YUZHOU_INITIAL_CANONICALIZATION, type UserContext } from "@jinhu/shared";
import { validateLocalJsonFile, parseLocalJson } from "../../components/files/local-json-file";
import { canEnterImport, createImportWorkbench, DOMAIN_MANAGE, IMPORT_FILE_POLICY, importContextKey, missingImportPermissions, normalizeImportOperation, parseImportPackage } from "./import-workbench";

const id = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const user = { id: "actor", tenant_id: "tenant", park_id: "park", org_id: "org", data_scope: "tenant", is_super: false,
  permissions: Object.values(DOMAIN_MANAGE), enabled_modules: [{ module_code: "hr", enabled: true }], roles: [] } as unknown as UserContext;
const item = (domain = "employee", fields: Record<string, unknown> = { fullName: "private source text" }, identity = "a") => ({
  domain, sourceTable: "dbo.person", sourceKey: `sha256:${identity.repeat(64)}`, rowDigest: "b".repeat(64), fields
});
const packageValue = (items = [item()]) => ({ version: 1, sourceSystem: "yuzhou-v10", manifestId: "batch", extractedAt: "2026-10-04T00:00:00Z", items });
const text = (items = [item()]) => JSON.stringify(packageValue(items));
const file = (contents = text(), name = "source.json") => ({ name, type: "application/json", size: Buffer.byteLength(contents), text: async () => contents });
const preview = (operationId = id) => ({ id: operationId, status: "previewed", itemCount: 1, plan: [{ ...item(), action: "unchanged", conflictFields: [] }] });
const terminal = (status = "committed", operationId = id) => ({ id: operationId, status, itemCount: 1, appliedCount: 0, unchangedCount: status === "committed" ? 1 : 0, conflictCount: status === "committed" ? 0 : 1, revisions: [] });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }
function fixture(actor = user) {
  let current = true;
  const calls: { action: string; id?: string; key?: string }[] = [];
  let nextPreview: () => Promise<unknown> = async () => preview();
  let nextCommit: () => Promise<unknown> = async () => terminal();
  let nextStatus: () => Promise<unknown> = async () => terminal();
  let keys = 0;
  const store = createImportWorkbench({ user: actor, isCurrent: () => current, transport: {
    key: action => `${action}:${++keys}`,
    preview: async (_pkg, key) => { calls.push({ action: "preview", key }); return nextPreview(); },
    commit: async (operationId, key) => { calls.push({ action: "commit", id: operationId, key }); return nextCommit(); },
    status: async operationId => { calls.push({ action: "status", id: operationId }); return nextStatus(); }
  } });
  return { store, calls, invalidate: () => { current = false; }, preview: (work: typeof nextPreview) => { nextPreview = work; },
    commit: (work: typeof nextCommit) => { nextCommit = work; }, status: (work: typeof nextStatus) => { nextStatus = work; } };
}

test("local JSON selection enforces extension/MIME/bytes and redacts native parser errors", () => {
  validateLocalJsonFile({ name: "SOURCE.JSON", type: "", size: 1 }, IMPORT_FILE_POLICY);
  validateLocalJsonFile({ name: "source.json", type: "application/json", size: YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES }, IMPORT_FILE_POLICY);
  for (const candidate of [{ name: "x.csv", type: "application/json", size: 1 }, { name: "x.json", type: "image/png", size: 1 },
    { name: "x.json", type: "", size: 0 }, { name: "x.json", type: "", size: YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES + 1 }]) {
    assert.throws(() => validateLocalJsonFile(candidate, IMPORT_FILE_POLICY));
  }
  assert.throws(() => parseLocalJson('{"private-person-name": PRIVATE_SOURCE}', IMPORT_FILE_POLICY), error =>
    error instanceof Error && !error.message.includes("PRIVATE_SOURCE") && !error.message.includes("private-person-name"));
  assert.throws(() => parseLocalJson(JSON.stringify("玉".repeat(30)), { maxBytes: 50 }));
});

test("package summary retains allowed field labels and domains without source values/witness projections", () => {
  const original = { ...item("employee", {}), initialBaselineWitness: { version: 1, operationId: "yzprod-import-20261004T000000Z-aaaaaaaaaaaa", phase: "T0",
    canonicalizationVersion: YUZHOU_INITIAL_CANONICALIZATION, targetId: id, projection: { full_name: "private witness name" } } };
  const parsed = parseImportPackage(text([original, item("profile", { idNumber: "private identity" }), item("contract", { contractNo: "private contract" })]), "source.json");
  assert.equal(parsed.summary.itemCount, 3);
  assert.deepEqual(parsed.summary.domains.map(row => [row.domain, row.count]), [["employee", 1], ["profile", 1], ["contract", 1]]);
  assert.deepEqual(parsed.summary.domains[1]!.fields, ["证件号"]);
  assert.equal(parsed.pkg.items[0]!.initialBaselineWitness?.projection.full_name, "private witness name");
  assert.ok(!JSON.stringify(parsed.summary).includes("private"));
  const malformedWitness = { ...original, initialBaselineWitness: { ...original.initialBaselineWitness, projection: "private witness" } };
  assert.throws(() => parseImportPackage(text([malformedWitness]), "source.json"));
});

test("package parsing rejects unsupported domains/fields/types/duplicates and bounds item counts", () => {
  for (const rows of [[], [item("payroll")], [item("employee", { privateUnknownField: "private data" })], [item("employee", { fullName: 123 })], [item(), item()]]) {
    assert.throws(() => parseImportPackage(text(rows), "source.json"), error => error instanceof Error && !error.message.includes("private"));
  }
  const rows = Array.from({ length: YUZHOU_INCREMENTAL_MAX_ITEMS }, (_, index) => ({ ...item(), sourceKey: `sha256:${index.toString(16).padStart(64, "0")}` }));
  assert.equal(parseImportPackage(text(rows), "source.json").summary.itemCount, YUZHOU_INCREMENTAL_MAX_ITEMS);
  assert.throws(() => parseImportPackage(text([...rows, item()]), "source.json"));
});

test("entry ANY capability never grants a mixed package's missing domain permissions; super still needs HR module", async () => {
  const narrow = { ...user, permissions: [HR_PERMISSIONS.HR_EMPLOYEE_MANAGE] };
  assert.equal(canEnterImport(narrow), true);
  const summary = parseImportPackage(text([item(), item("profile", {})]), "source.json").summary;
  assert.deepEqual(missingImportPermissions(narrow, summary), ["个人资料"]);
  const f = fixture(narrow);
  await f.store.select(file(text([item(), item("profile", {})])));
  await f.store.preview(); await f.store.commit();
  assert.equal(f.calls.length, 0);
  assert.equal(canEnterImport({ ...user, is_super: true, enabled_modules: [] }), false);
  assert.equal(canEnterImport({ ...user, permissions: [HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ] }), false);
  assert.equal(canEnterImport({ ...user, permissions: [HR_PERMISSIONS.HR_CONTRACT_READ] }), true);
});

test("API variants normalize aggregates only; terminal status requires complete result counts", () => {
  assert.deepEqual(normalizeImportOperation(preview()).actions, { create: 0, update: 0, unchanged: 1, conflict: 0 });
  const replay = normalizeImportOperation({ id, status: "previewed", itemCount: 1, appliedCount: 0, unchangedCount: 0, conflictCount: 0, revisions: [] });
  assert.equal(replay.actions, null);
  assert.equal(replay.results, null);
  assert.equal(normalizeImportOperation(terminal("conflicted")).results?.conflicts, 1);
  assert.ok(!JSON.stringify(normalizeImportOperation(preview())).includes("private"));
  assert.throws(() => normalizeImportOperation({ ...preview(), plan: [] }));
  assert.throws(() => normalizeImportOperation({ ...terminal(), appliedCount: undefined }));
  assert.throws(() => normalizeImportOperation({ ...terminal(), unchangedCount: 0 }));
});

test("operation response counts stay within package bounds and bound commit/status counts match the selected package", async () => {
  for (const itemCount of [0, YUZHOU_INCREMENTAL_MAX_ITEMS + 1]) {
    assert.throws(() => normalizeImportOperation({ id, status: "previewed", itemCount }));
  }
  const f = fixture();
  await f.store.select(file()); await f.store.preview();
  f.commit(async () => ({ ...terminal(), itemCount: 2, unchangedCount: 2 }));
  await f.store.commit();
  assert.equal(f.store.getSnapshot().uncertain, true);
  assert.equal(f.store.getSnapshot().operation?.itemCount, 1);
  f.status(async () => ({ id, status: "previewed", itemCount: 2 }));
  await f.store.query(id); await f.store.commit();
  assert.equal(f.store.getSnapshot().uncertain, true);
  assert.equal(f.store.getSnapshot().canCommit, false);
  assert.equal(f.calls.filter(row => row.action === "commit").length, 1);
  f.status(async () => ({ id, status: "previewed", itemCount: 1 }));
  await f.store.query(id);
  assert.equal(f.store.getSnapshot().uncertain, false);
  assert.equal(f.store.getSnapshot().canCommit, true);
});

test("selection and preview never auto-submit; duplicate clicks lock synchronously; terminal replay cannot commit", async () => {
  const f = fixture(), work = deferred<unknown>();
  await f.store.select(file());
  assert.equal(f.calls.length, 0);
  f.preview(() => work.promise);
  const first = f.store.preview(); await f.store.preview();
  assert.equal(f.calls.length, 1);
  work.resolve(preview()); await first;
  assert.equal(f.store.getSnapshot().canCommit, true);
  assert.deepEqual(f.calls.map(row => row.action), ["preview"]);
  const commit = deferred<unknown>(); f.commit(() => commit.promise);
  const pending = f.store.commit(); await f.store.commit();
  assert.deepEqual(f.calls.map(row => row.action), ["preview", "commit"]);
  commit.resolve(terminal()); await pending; await f.store.commit();
  assert.equal(f.calls.length, 2);
  f.preview(async () => terminal("conflicted"));
  await f.store.preview(); await f.store.commit();
  assert.equal(f.store.getSnapshot().operation?.status, "conflicted");
  assert.equal(f.calls.length, 3);
});

test("same-package preview status without plan is bound; status-only recovery cannot submit an unrelated operation", async () => {
  const f = fixture(); f.preview(async () => ({ id, status: "previewed", itemCount: 1 }));
  await f.store.select(file()); await f.store.preview();
  assert.equal(f.store.getSnapshot().canCommit, true);
  assert.equal(f.store.getSnapshot().operation?.actions, null);
  f.status(async () => ({ id: otherId, status: "previewed", itemCount: 1 }));
  await f.store.query(otherId); await f.store.commit();
  assert.equal(f.store.getSnapshot().summary, null);
  assert.equal(f.store.getSnapshot().canCommit, false);
  assert.deepEqual(f.calls.map(row => row.action), ["preview", "status"]);
});

test("uncertain commit keeps operation/key and requires successful status before explicit retry", async () => {
  const f = fixture();
  await f.store.select(file()); await f.store.preview();
  f.commit(async () => { throw new Error("private server error"); });
  await f.store.commit(); await f.store.commit(); await f.store.preview(); await f.store.query(otherId);
  await f.store.select(null);
  assert.equal(f.store.getSnapshot().operation?.id, id);
  assert.equal(f.store.getSnapshot().uncertain, true);
  assert.equal(f.calls.length, 2);
  f.status(async () => { throw new Error("private query error"); });
  await f.store.query(id); await f.store.commit();
  assert.equal(f.store.getSnapshot().uncertain, true);
  f.status(async () => ({ id, status: "previewed", itemCount: 1 }));
  await f.store.query(id);
  assert.equal(f.store.getSnapshot().canCommit, true);
  f.commit(async () => terminal()); await f.store.commit();
  const commits = f.calls.filter(row => row.action === "commit");
  assert.equal(commits.length, 2); assert.equal(commits[0]!.key, commits[1]!.key);
  assert.equal(f.store.getSnapshot().uncertain, false);
  assert.ok(!JSON.stringify(f.store.getSnapshot()).includes("private"));
});

test("uncertain commit found terminal by status never retries", async () => {
  const f = fixture(); await f.store.select(file()); await f.store.preview();
  f.commit(async () => { throw new Error("timeout"); });
  await f.store.commit(); await f.store.query(id); await f.store.commit();
  assert.equal(f.store.getSnapshot().operation?.status, "committed");
  assert.deepEqual(f.calls.map(row => row.action), ["preview", "commit", "status"]);
});

test("file change drops operation binding and ignores older parse and preview responses", async () => {
  const f = fixture(), read = deferred<string>();
  const firstRead = f.store.select({ ...file(), text: () => read.promise });
  await f.store.select(file(text([item("contract", {})]), "contract.json"));
  read.resolve(text()); await firstRead;
  assert.equal(f.store.getSnapshot().summary?.fileName, "contract.json");
  const work = deferred<unknown>(); f.preview(() => work.promise);
  const firstPreview = f.store.preview();
  await f.store.select(file());
  work.resolve(preview()); await firstPreview; await f.store.commit();
  assert.equal(f.store.getSnapshot().operation, null);
  assert.equal(f.store.getSnapshot().canCommit, false);
  assert.equal(f.calls.length, 1);
});

for (const action of ["preview", "commit", "status"] as const) test(`scope/permissions change during ${action} drops stale result and prevents later writes`, async () => {
  const f = fixture(), work = deferred<unknown>();
  await f.store.select(file());
  if (action !== "preview") await f.store.preview();
  f[action](() => work.promise);
  const pending = action === "status" ? f.store.query(id) : f.store[action]();
  f.invalidate(); f.store.cancel();
  work.resolve(action === "preview" ? preview() : terminal()); await pending;
  const before = f.calls.length;
  await f.store.preview(); await f.store.commit(); await f.store.query(id);
  assert.equal(f.calls.length, before);
  assert.notEqual(f.store.getSnapshot().operation?.status, "committed");
});

test("context fingerprint covers identity, park, organization, permissions and enabled module changes", () => {
  for (const change of [{ id: "other" }, { park_id: "other" }, { org_id: "other" }, { data_scope: "self" }, { data_scopes: [] }, { permissions: [] }, { enabled_modules: [] }, { roles: [{ role_code: "other" }] }]) {
    assert.notEqual(importContextKey(user), importContextKey({ ...user, ...change } as UserContext));
  }
});

test("route uses inherited authenticated layout, visible denial, safe selector and existing API client", () => {
  const page = readFileSync("app/hr/imports/HrImportsClient.tsx", "utf8");
  const layout = readFileSync("app/hr/layout.tsx", "utf8");
  const picker = readFileSync("components/files/LocalJsonFilePicker.tsx", "utf8");
  assert.match(layout, /DashboardLayout/);
  assert.match(page, /PermissionGuard module="hr"/);
  assert.match(page, /ForbiddenState variant="page"/);
  assert.match(page, /apiRequest<unknown>/);
  assert.match(page, /idempotencyKey: key/);
  assert.match(picker, /className="sr-only" type="file"/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\.|package_encrypted|\.projection/);
});
