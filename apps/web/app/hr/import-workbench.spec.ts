import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SYSTEM_PERMISSIONS, HR_PERMISSIONS, YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE, YUZHOU_INSURANCE_POLICY_KINDS, YUZHOU_INSURANCE_POLICY_FACTOR_FIELDS, YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, YUZHOU_INITIAL_CANONICALIZATION, type UserContext } from "@jinhu/shared";
import { validateLocalJsonFile, parseLocalJson } from "../../components/files/local-json-file";
import { canEnterImport, createImportWorkbench, DOMAIN_MANAGE, IMPORT_FILE_POLICY, importContextKey, missingImportPermissions, normalizeImportOperation, normalizePreparedProfileCatalog, parseImportPackage } from "./import-workbench";

const id = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
test("server package metadata shares commit recovery and keeps interrupted preview key without local raw JSON",async()=>{
  const selection={batchId:"a".repeat(64),index:0,kind:"baseline" as const,itemCount:1,fields:[]};
  const keys:string[]=[];let first=true,commits=0;
  const store=createImportWorkbench({user,isCurrent:()=>true,transport:{key:action=>`${action}-${keys.length}`,
    preview:async()=>{throw Error("local path must not run")},
    previewPrepared:async(received,key)=>{assert.deepEqual(received,selection);keys.push(key);if(first){first=false;throw Error("interrupted")}return preview()},
    commit:async()=>{commits++;throw Error("uncertain")},status:async()=>terminal()}});
  store.selectPrepared(selection);assert.equal(store.getSnapshot().summary?.fileName,"服务器数据包 1 · 来源基线");
  await store.preview();assert.equal(store.getSnapshot().previewRetryAvailable,true);
  await store.preview(true);assert.equal(keys[0],keys[1]);assert.equal(store.getSnapshot().canCommit,true);
  await store.commit();assert.equal(store.getSnapshot().uncertain,true);
  store.selectPrepared({...selection,index:1});await store.commit();assert.equal(commits,1);
  await store.query(id);assert.equal(store.getSnapshot().operation?.status,"committed");assert.equal(store.getSnapshot().uncertain,false);
});
test("prepared catalog strips source extras and rejects invalid counters, scope-independent IDs and ordering",()=>{
  const input=[{id:"a".repeat(64),sourceProfiles:1,aliasProfiles:1,privateRows:["secret-row"],packages:[
    {index:0,kind:"baseline",itemCount:1,fields:[],canPreview:true,status:"ready",operationId:null,sourceKey:"secret-key"},
    {index:1,kind:"alias",itemCount:1,fields:["nativePlace"],canPreview:false,status:"ready",operationId:null}]}];
  assert.doesNotMatch(JSON.stringify(normalizePreparedProfileCatalog(input)),/secret|privateRows|sourceKey/);
  for(const mutate of [(v:typeof input)=>{v[0]!.id="../unsafe"},(v:typeof input)=>{v[0]!.sourceProfiles=0},
    (v:typeof input)=>{v[0]!.packages.reverse()},(v:typeof input)=>{v[0]!.packages[1]!.fields=["idNumber"]}]){
    const invalid=structuredClone(input);mutate(invalid);assert.throws(()=>normalizePreparedProfileCatalog(invalid));
  }
});
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
test("insurance nested package summary hides source facts and requires all three manage permissions", () => {
  const fields = { name: "private policy", scopeDescription: "private scope", items: YUZHOU_INSURANCE_POLICY_KINDS.map(kind => ({ kind, variant: 1, ...Object.fromEntries(YUZHOU_INSURANCE_POLICY_FACTOR_FIELDS.map(field => [field, field.endsWith("Rate") ? "0.125" : null])) })) };
  const value = { ...item("insurance_policy", fields), sourceTable: "dbo.insure_method" };
  const parsed = parseImportPackage(text([value]), "policy.json");
  assert.equal(parsed.summary.domains[0]!.fields.length, 50);
  assert.equal(JSON.stringify(parsed.summary).includes("private policy"), false); assert.equal(JSON.stringify(parsed.summary).includes("private scope"), false); assert.equal(JSON.stringify(parsed.summary).includes("0.125"), false);
  const permitted = { ...user, permissions: [...YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE] };
  assert.equal(canEnterImport(permitted), true); assert.deepEqual(missingImportPermissions(permitted, parsed.summary), []);
  for (const omitted of YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE) assert.deepEqual(missingImportPermissions({ ...permitted, permissions: permitted.permissions.filter(p => p !== omitted) }, parsed.summary), ["保险政策"]);
  for (const bad of [{ ...fields, items: fields.items.slice(1) }, { ...fields, items: [fields.items[0], ...fields.items.slice(0, 5)] }, { ...fields, items: fields.items.map((factor,i) => i ? factor : { ...factor, baseRate: 0.125 }) }]) assert.throws(() => parseImportPackage(text([{ ...value, fields: bad }]), "policy.json"), /保险政策字段格式无效/u);
});
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }
function fixture(actor = user) {
  let current = true;
  const calls: { action: string; id?: string; key?: string }[] = [];
  let nextPreview: (key: string) => Promise<unknown> = async () => preview();
  let nextCommit: () => Promise<unknown> = async () => terminal();
  let nextStatus: () => Promise<unknown> = async () => terminal();
  let keys = 0;
  const store = createImportWorkbench({ user: actor, isCurrent: () => current, transport: {
    key: action => `${action}:${++keys}`,
    preview: async (_pkg, key) => { calls.push({ action: "preview", key }); return nextPreview(key); },
    commit: async (operationId, key) => { calls.push({ action: "commit", id: operationId, key }); return nextCommit(); },
    status: async operationId => { calls.push({ action: "status", id: operationId }); return nextStatus(); }
  } });
  return { store, calls, invalidate: () => { current = false; }, preview: (work: typeof nextPreview) => { nextPreview = work; },
    commit: (work: typeof nextCommit) => { nextCommit = work; }, status: (work: typeof nextStatus) => { nextStatus = work; } };
}

test("training import summaries hide source values and require all three management permissions", () => {
  const parsed=parseImportPackage(text([{...item("training_history",{courseName:"private course",memo:"private memo",score:"84.50",hours:"8",startDate:"2020-02-29",endDate:"2020-03-01"}),sourceTable:"dbo.trainhis"}]),"training.json");
  assert.equal(parsed.summary.domains[0]!.domain,"training_history");
  assert.ok(parsed.summary.domains[0]!.fields.includes("培训备注"));
  assert.doesNotMatch(JSON.stringify(parsed.summary),/private memo|84\.50/);
  assert.ok(parsed.summary.domains[0]!.fields.includes("培训成绩"));
  assert.ok(parsed.summary.domains[0]!.fields.includes("课程名称"));
  assert.ok(!JSON.stringify(parsed.summary).includes("private course"));
  const permissions=[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE,HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE];
  assert.deepEqual(missingImportPermissions({...user,permissions},parsed.summary),[]);
  for(const missing of permissions)assert.deepEqual(missingImportPermissions({...user,permissions:permissions.filter(p=>p!==missing)},parsed.summary),["培训历史"]);
  const reader={...user,permissions:[HR_PERMISSIONS.HR_TRAINING_READ]};
  assert.equal(canEnterImport(reader),true);assert.deepEqual(missingImportPermissions(reader,parsed.summary),["培训历史"]);
});

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

test("family imports use normal record management and family read entry permissions", () => {
  const family={...item("family",{employeeSourceKey:`sha256:${"c".repeat(64)}`,employeeSourceTable:"dbo.person",relationship:"子女",fullName:"private family text"}),sourceTable:"dbo.family"};
  const summary=parseImportPackage(text([family]),"family.json").summary;
  const manager={...user,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE]};
  assert.equal(canEnterImport(manager),true);
  assert.deepEqual(missingImportPermissions(manager,summary),[]);
  const reader={...user,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ]};
  assert.equal(canEnterImport(reader),true);
  assert.deepEqual(missingImportPermissions(reader,summary),["家庭成员"]);
  assert.ok(!JSON.stringify(summary).includes("private family text"));
});

test("skill and credential packages use record management; summaries omit private facts", () => {
  for(const domain of ["skill","credential"] as const){
    const row={...item(domain,{employeeSourceKey:`sha256:${"c".repeat(64)}`,employeeSourceTable:"dbo.person",...(domain==="skill"?{skillName:"private skill value",legacyGrade:"private grade"}:{credentialType:"synthetic",credentialName:"private credential value",credentialNumber:"private credential number"})}),sourceTable:domain==="skill"?"dbo.knowhow":"dbo.ticket"};
    const summary=parseImportPackage(text([row]),`${domain}.json`).summary;
    const manager={...user,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE]};
    assert.deepEqual(missingImportPermissions(manager,summary),[]);
    const reader={...user,permissions:[domain==="skill"?HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ:HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_READ]};
    assert.equal(canEnterImport(reader),true);assert.deepEqual(missingImportPermissions(reader,summary),[domain==="skill"?"技能":"证照"]);
    assert.equal(JSON.stringify(summary).includes("private"),false);
  }
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
  f.preview(async () => terminal());
  await f.store.preview(); await f.store.commit();
  assert.equal(f.store.getSnapshot().operation?.status, "committed");
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

test("fresh explicit preview bypasses an interceptor's old cached response while package identity remains one operation", async () => {
  const f = fixture(), cache = new Map<string, unknown>();
  let serverCommitted = false;
  f.preview(async key => {
    if (!cache.has(key)) cache.set(key, serverCommitted ? terminal() : preview());
    return cache.get(key);
  });
  f.commit(async () => { serverCommitted = true; return terminal(); });
  await f.store.select(file()); await f.store.preview(); await f.store.commit(); await f.store.preview();
  const previews = f.calls.filter(call => call.action === "preview");
  assert.notEqual(previews[0]!.key, previews[1]!.key);
  assert.equal(f.store.getSnapshot().operation?.id, id);
  assert.equal(f.store.getSnapshot().operation?.status, "committed");
  assert.equal(cache.size, 2);
  await f.store.commit();
  assert.equal(f.calls.filter(call => call.action === "commit").length, 1);
});

test("an interrupted preview transport retry reuses its key, while starting a new preview after failure gets a fresh key", async () => {
  const f = fixture(), interruptedKeys = new Set<string>();
  f.preview(async key => {
    if (!interruptedKeys.has(key)) { interruptedKeys.add(key); throw new Error("response lost after server preview"); }
    return preview();
  });
  await f.store.select(file()); await f.store.preview();
  assert.equal(f.store.getSnapshot().previewRetryAvailable, true);
  await f.store.preview(true);
  assert.equal(f.calls[0]!.key, f.calls[1]!.key);
  assert.equal(f.store.getSnapshot().canCommit, true);
  assert.equal(f.store.getSnapshot().previewRetryAvailable, false);
  await f.store.preview();
  assert.notEqual(f.calls[1]!.key, f.calls[2]!.key);
  assert.equal(f.store.getSnapshot().previewRetryAvailable, true);
  await f.store.select(file(text([item("contract", {})]))); await f.store.preview(true);
  assert.equal(f.calls.length, 3, "file replacement invalidates transport retry ownership");
});

for (const status of ["committed", "conflicted"] as const) test(`known ${status} outcome cannot regress when reselected-file preview or status returns a stale preview snapshot`, async () => {
  const f = fixture(); f.status(async () => terminal(status));
  await f.store.query(id);
  await f.store.select(file());
  f.preview(async () => preview());
  await f.store.preview();
  assert.equal(f.store.getSnapshot().operation?.status, status);
  assert.equal(f.store.getSnapshot().canCommit, false);
  f.status(async () => ({ id, status: "previewed", itemCount: 1 }));
  await f.store.query(id); await f.store.commit();
  assert.equal(f.store.getSnapshot().operation?.status, status);
  assert.deepEqual(f.store.getSnapshot().operation?.results, status === "committed" ? { applied: 0, unchanged: 1, conflicts: 0 } : { applied: 0, unchanged: 0, conflicts: 1 });
  assert.equal(f.calls.filter(call => call.action === "commit").length, 0);
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


test("organization/position summary admits numeric mapped fields and keeps domain authority separate",()=>{
  const summary=parseImportPackage(text([item("organization",{orgName:"private organization",plannedHeadcount:12,sortOrder:0}),item("position",{positionName:"private position",headcountLimit:3}),item("employee",{orgSourceKey:`sha256:${"a".repeat(64)}`})]),"synthetic.json").summary;
  assert.deepEqual(summary.domains.map(row=>row.domain),["organization","position","employee"]);
  assert.ok(summary.domains[0]!.fields.includes("组织编制"));assert.ok(!JSON.stringify(summary).includes("private"));
  assert.deepEqual(missingImportPermissions({...user,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE]},summary),["组织","岗位"]);
  assert.deepEqual(missingImportPermissions({...user,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,HR_PERMISSIONS.HR_POSITION_MANAGE,SYSTEM_PERMISSIONS.ORG_UPDATE]},summary),[]);
  assert.throws(()=>parseImportPackage(text([item("organization",{plannedHeadcount:1.5})]),"synthetic.json"));
});
