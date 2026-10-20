/* global fetch, console, process */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, statSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URLSearchParams } from "node:url";
import { execFileSync } from "node:child_process";
import { buildYuzhouPayrollSourcePackageFromPreparedStreaming } from "../hr-cutover/build-yuzhou-payroll-source-package.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
const read = path => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => {
  try { chmodSync(path, 0o600); } catch (error) { if (error.code !== "ENOENT") throw error; }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};

/** Real retained July values, synthetic isolated identities, normal JWT/API flows. Never production. */
export async function runJulyPayrollSourceJourney(configPath) {
  assert.equal(statSync(configPath).mode & 0o077, 0, "private config required");
  const config = read(configPath), owned = read(config.ownedRuntimeReceipt);
  assert.equal(config.allowSyntheticWrites, true);
  assert.equal(config.syntheticOnly, true);
  assert.equal(config.apiBase, `http://127.0.0.1:${owned.httpRuntime.apiPort}/api/v1`);
  assert.equal(config.apiPid, owned.httpRuntime.apiPid);
  assert.match(owned.validationDatabase, /^jinhu_hr_migration_lab_core_payrollupgrade$/u);
  const container = JSON.parse(execFileSync("docker", ["inspect", owned.container], { encoding: "utf8" }))[0];
  assert.equal(container.Id, owned.containerId); assert.equal(container.State.Running, true);
  process.kill(config.apiPid, 0);
  const output = resolve(config.outputDir); mkdirSync(output, { recursive: true, mode: 0o700 });
  assert.equal(statSync(output).mode & 0o077, 0, "private output required");
  const statePath = resolve(output, "state.json");
  let state;
  try { state = read(statePath); } catch (error) { if (error.code !== "ENOENT") throw error; state = { tag: randomUUID().slice(0, 8), keys: {}, books: {}, trace: [] }; }
  const checkpoint = () => save(statePath, state);
  const call = async (identity, method, path, body, label, expected = method === "POST" ? 201 : 200) => {
    const fingerprint = sha(canonical({ method, path, body: body ?? null }));
    const key = state.keys[`${label}:${fingerprint}`] ??= randomUUID(); checkpoint();
    const response = await fetch(config.apiBase + path, { method,
      headers: { "content-type": "application/json", "x-idempotency-key": key, ...(identity ? { authorization: `Bearer ${identity.accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    state.trace.push({ label, method, path, status: response.status }); checkpoint();
    if (response.status !== expected) { save(resolve(output, "last-error.json"), { label, status: response.status, result }); throw new Error(`JULY_JOURNEY_HTTP_FAILED_${label}_${response.status}`); }
    return result.data ?? result;
  };
  const login = (identity, label) => call(null, "POST", "/auth/login", { username: identity.username, password: identity.password }, label, 200);
  await call(null, "GET", "/ready", undefined, "ready");
  const admin = await login(config.admin, "provisioner-login");
  const authorCodes = ["hr", "hr:payroll", "hr:employees", "hr:employee:read", "hr:employee:manage",
    "hr:payroll:read", "hr:payroll:manage", "hr:payroll_detail:read", "hr:payroll_rule:read",
    "hr:payroll_history:read", "hr:payroll_reconciliation:review", "hr:payroll_reconciliation:calculate",
    "hr:attendance:read", "hr:attendance:payroll_input_read", "hr:insurance:read", "hr:insurance_amount:read"];
  const reviewerCodes = ["hr", "hr:payroll", "hr:employee:read", "hr:payroll:read", "hr:payroll_detail:read",
    "hr:payroll_rule:read", "hr:payroll_formula:review", "hr:payroll:review"];
  if (!state.actors?.reviewer) {
    const permissions = [];
    for (let page = 1; page <= 100; page++) {
      const result = await call(admin, "GET", `/permissions?page=${page}&page_size=100`, undefined, `permissions-${page}`);
      permissions.push(...result.items);
      if (permissions.length >= result.total) break;
      assert.ok(result.items.length, "permission pagination incomplete");
    }
    state.actors ??= {};
    state.actorIdentities ??= {};
    for (const [name, codes] of [["author", authorCodes], ["reviewer", reviewerCodes]]) {
      if (state.actors[name]) continue;
      const selected = permissions.filter(p => codes.includes(p.code));
      assert.deepEqual(selected.map(p => p.code).sort(), [...codes].sort(), "exact narrow permissions must exist");
      const role = await call(admin, "POST", "/roles", { code: `JULY_${state.tag}_${name}`, name: `诊断候选 ${name}`, roleScope: "park", dataScope: "park" }, `role-${name}`);
      await call(admin, "POST", `/roles/${role.id}/permissions`, { permissionIds: selected.map(p => p.id) }, `role-grants-${name}`);
      const identity = state.actorIdentities[name] ??= { username: `july_${name}_${state.tag}`, password: `Synthetic-only-${randomUUID()}`, displayName: `诊断候选 ${name}` }; checkpoint();
      const user = await call(admin, "POST", "/users", identity, `user-${name}`);
      await call(admin, "POST", `/users/${user.id}/roles`, { roleIds: [role.id] }, `user-role-${name}`);
      state.actors[name] = { ...identity, id: user.id, roleId: role.id }; checkpoint();
    }
  }
  const author = await login(state.actors.author, "author-login"), reviewer = await login(state.actors.reviewer, "reviewer-login");
  assert.notEqual(state.actors.author.id, state.actors.reviewer.id);
  const employeeInput = read(config.employeeInputPath);
  if (!state.employeeImport) {
    const preview = await call(author, "POST", "/hr/imports/yuzhou/incremental/preview", employeeInput, "employee-preview");
    const committed = await call(author, "POST", `/hr/imports/yuzhou/incremental/${preview.id}/commit`, {}, "employee-commit");
    assert.equal(committed.status, "committed"); assert.equal(committed.appliedCount, 64);
    state.employeeImport = committed; checkpoint();
  }
  const employees = await call(author, "GET", "/hr/employees?page=1&page_size=100", undefined, "employee-map");
  assert.equal(employees.total, 64);
  const byCode = new Map(employees.items.map(e => [e.employeeCode, e])); assert.equal(byCode.size, 64);
  const mapping = { formatVersion: 1, scope: config.scope, entries: employeeInput.items.map(item => {
    const employee = byCode.get(item.fields.employeeCode); assert.ok(employee, "exact source person mapping required");
    return { sourcePerson: item.fields.employeeCode, employeeMappingId: employee.id };
  }) };
  mapping.artifactSha256 = sha(canonical(mapping));
  const mappingPath = resolve(output, "employee-map.json"); save(mappingPath, mapping);
  const packagePath = resolve(output, "package.json");
  if (!state.source) {
    const built = await buildYuzhouPayrollSourcePackageFromPreparedStreaming({ preparedRoot: config.preparedRoot,
      manifestPath: resolve(config.preparedRoot, "manifest.json"), mappingPath, month: "2026-07", sourceInstance: "yuzhou-v10-july-diagnostic" });
    assert.equal(built.receipt.recordCount, 93); assert.equal(built.receipt.employeeCount, 64); assert.equal(built.receipt.valueCount, 2295);
    save(packagePath, built.packageDto);
    await call(reviewer, "POST", "/hr/imports/yuzhou/payroll/preview", { package: built.packageDto }, "reviewer-source-denied", 403);
    const preview = await call(author, "POST", "/hr/imports/yuzhou/payroll/preview", { package: built.packageDto }, "payroll-source-preview");
    state.source = await call(author, "POST", `/hr/imports/yuzhou/payroll/${preview.id}/commit`, {}, "payroll-source-commit"); checkpoint();
    assert.equal(state.source.status, "committed"); assert.ok(state.source.legacyBatchId);
    assert.equal((await call(author, "POST", `/hr/imports/yuzhou/payroll/${preview.id}/commit`, {}, "payroll-source-commit")).id, preview.id);
  }
  const pkg = read(packagePath), candidates = read(config.candidatePath);
  const manifest = read(resolve(config.preparedRoot, "manifest.json"));
  assert.equal(candidates.sourceBackupSha256, manifest.sourceBackupSha256);
  for (const [file, hash] of Object.entries(candidates.candidateSourceHashes))
    assert.equal(sha(readFileSync(resolve(config.workspace, file))), hash, "candidate calculation/binding code changed");
  for (const [name, binding] of Object.entries(candidates.sourceFiles))
    assert.equal(binding.fileSha256, manifest.outputFiles[`${name}.jsonl`].fileSha256, "candidate source file changed");
  if (!state.period) { state.period = await call(author, "POST", "/hr/payroll/periods", { periodMonth: "2026-07-01", startDate: "2026-07-01", endDate: "2026-07-31" }, "period-create"); checkpoint(); }
  const options = await call(author, "GET", `/hr/payroll/trial-comparisons/options?legacyBatchId=${state.source.legacyBatchId}&month=2026-07`, undefined, "initial-trial-options");
  assert.equal(options.recordCount, 93); assert.equal(options.employeeCount, 64); assert.equal(options.books.length, 2);
  let nullZeroCount = 0;
  for (const sourceBook of pkg.books) {
    const scheme = sourceBook.scheme, book = options.books.find(b => b.scheme === scheme), candidate = candidates.explicitPreGrossRoleKernelCandidate.find(c => c.scheme === scheme);
    assert.ok(book && candidate); assert.equal(book.recordCount, scheme === 34 ? 54 : 39);
    const progress = state.books[scheme] ??= {}; checkpoint();
    if (!progress.frozen) {
      const selection = new URLSearchParams({ legacyBatchId: state.source.legacyBatchId, bookId: book.bookId, periodMonth: "2026-07-01" });
      const preview = await call(author, "GET", `/hr/payroll/reconciliation-sources/preview?${selection}`, undefined, `freeze-preview-${scheme}`);
      const payload = Object.fromEntries(["legacyBatchId", "bookId", "periodMonth", "bindingSha256", "sourceSha256", "snapshotCount", "itemCount"].map(field => [field, preview[field]]));
      progress.frozen = await call(author, "POST", "/hr/payroll/reconciliation-sources", { ...payload, reason: "诊断候选来源冻结，未获业务确认" }, `freeze-${scheme}`); checkpoint();
    }
    if (!progress.ruleSet) { progress.ruleSet = await call(author, "POST", "/hr/payroll/rules", { ruleCode: `JULY_${state.tag}_${scheme}`, displayName: `诊断候选，未获业务确认 ${scheme}`, sourceBookId: book.bookId }, `rule-set-${scheme}`); checkpoint(); }
    if (!progress.ruleVersion) { progress.ruleVersion = await call(author, "POST", `/hr/payroll/rules/${progress.ruleSet.id}/versions`, { expectedHeadRevision: 0, definition: candidate.definition, reason: "诊断候选：NULL视零、扣补及公积金归类尚未获业务确认" }, `rule-version-${scheme}`); checkpoint(); }
    if (!progress.ruleApproved) {
      const submitted = await call(author, "POST", `/hr/payroll/rules/versions/${progress.ruleVersion.id}/submit`, { expectedVersion: progress.ruleVersion.version }, `rule-submit-${scheme}`);
      progress.ruleApproved = await call(reviewer, "POST", `/hr/payroll/rules/versions/${progress.ruleVersion.id}/review`, { expectedVersion: submitted.version, decision: "approve", effectiveFrom: "2026-07", reason: "隔离技术演练的独立候选复核，不构成吴恩国业务确认" }, `rule-review-${scheme}`); checkpoint();
    }
    const prepared = [];
    for (let page = 1; page <= 3; page++) {
      const query = new URLSearchParams({ periodId: state.period.id, ruleSetId: progress.ruleSet.id, reconciliationSourceId: progress.frozen.id,
        includeSourceValues: "true", page: String(page), pageSize: "50" });
      const result = await call(author, "GET", `/hr/payroll/inputs/preparation?${query}`, undefined, `preparation-${scheme}-${page}`);
      prepared.push(...result.items);
      if (prepared.length >= result.total) break;
      assert.ok(result.items.length, "complete source input pagination required");
    }
    assert.equal(prepared.length, sourceBook.records.length);
    const directCodes = candidate.definition.items.filter(item => item.expression === null).map(item => item.code);
    const employees = prepared.map(employee => {
      const directItems = { ...employee.sourceValues.values };
      for (const issue of employee.sourceValues.issues) {
        assert.equal(issue.reason, "source_null", "only explicitly unapproved NULL-zero diagnostic assumption is allowed");
        assert.ok(directCodes.includes(issue.code)); directItems[issue.code] = "0.0000"; nullZeroCount++;
      }
      assert.deepEqual(Object.keys(directItems).sort(), [...directCodes].sort());
      return { employeeId: employee.employeeId, expectedEmployeeVersion: employee.expectedEmployeeVersion, directItems,
        settlementStart: "2026-07-01", settlementEnd: "2026-07-31", eligibilityReason: "隔离技术演练结算窗口，不推断真实入离职日期，未获业务确认" };
    });
    if (!progress.input) { progress.input = await call(author, "POST", "/hr/payroll/inputs", { periodId: state.period.id, ruleSetId: progress.ruleSet.id,
      ruleVersionId: progress.ruleVersion.id, expectedHeadRevision: 0, employees, reason: "诊断候选输入，源NULL视零仅为技术假设，未获业务确认" }, `input-create-${scheme}`); checkpoint(); }
    if (!progress.confirmedInput) { progress.confirmedInput = await call(reviewer, "POST", `/hr/payroll/inputs/${progress.input.id}/confirm`, { expectedVersion: progress.input.version }, `input-confirm-${scheme}`); checkpoint(); }
    progress.bookId = book.bookId; progress.nullZeroCount = employees.reduce((count, employee) => count + Object.values(employee.directItems).filter(v => v === "0.0000").length, 0); checkpoint();
  }
  const finalOptions = await call(author, "GET", `/hr/payroll/trial-comparisons/options?legacyBatchId=${state.source.legacyBatchId}&month=2026-07`, undefined, "complete-trial-options");
  const selection = { legacyBatchId: state.source.legacyBatchId, month: "2026-07", books: finalOptions.books.map(book => {
    const progress = state.books[book.scheme], definition = candidates.explicitPreGrossRoleKernelCandidate.find(c => c.scheme === book.scheme).definition;
    return { bookId: book.bookId, reconciliationSourceId: progress.frozen.id, inputId: progress.input.id,
      expectedInputVersion: progress.confirmedInput.version, mappings: definition.items.map(item => {
        const versions = book.items.filter(v => v.code === item.code); assert.equal(versions.length, 1, "unambiguous exact source item version required");
        return { modernCode: item.code, sourceItemVersionId: versions[0].id };
      }) };
  }) };
  save(resolve(output, "trial-selection.json"), selection);
  const trialLabel = config.validationRevision ? `all-books-trial-${config.validationRevision}` : "all-books-trial";
  const result = await call(author, "POST", "/hr/payroll/trial-comparisons", selection, trialLabel);
  save(resolve(output, "trial-result.json"), result);
  assert.equal(result.kind, "calculate_only"); assert.equal(result.complete, true);
  assert.equal(result.recordCount, 93); assert.equal(result.employeeCount, 64); assert.equal(result.bookCount, 2);
  const netEqual = result.records.filter(record => record.net.status === "equal").length;
  const grossEqual = result.records.filter(record => record.lines.filter(line => line.role === "gross").length === 1 && record.lines.some(line => line.role === "gross" && line.status === "equal")).length;
  const formal = await call(author, "GET", "/hr/payroll/formal-runs?page=1&pageSize=100", undefined, "no-formal-run");
  assert.equal(formal.total, 0);
  const receipt = { status: netEqual === 93 && grossEqual === 93 && result.differentLineCount === 0 ? "PASS_REAL93_NORMAL_JWT_HTTP_DIAGNOSTIC_TRIAL" : "REAL93_NORMAL_HTTP_TRIAL_WITH_DIFFERENCES",
    recordCount: result.recordCount, employeeCount: result.employeeCount, bookCount: result.bookCount, netEqualCount: netEqual, grossEqualCount: grossEqual,
    differentLineCount: result.differentLineCount, nullZeroDiagnosticCount: nullZeroCount, formalRuns: formal.total,
    sourceHash: state.source.packageSha256, selectionHash: result.selectionHash, resultHash: result.resultHash,
    ordinaryPasswordLogin: true, narrowAuthorAndIndependentReviewer: true, businessAcceptance: "UNVERIFIED",
    validationRevision: config.validationRevision ?? null, calculatedAt: result.calculatedAt,
    productionWrites: 0, paymentExecuted: false, productionRoleUat: "NOT_EXECUTED", fullGoalComplete: false };
  save(resolve(output, "receipt.json"), receipt); state.status = receipt.status; checkpoint();
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--config") throw new Error("JULY_JOURNEY_ARGUMENTS_INVALID");
    console.log(JSON.stringify(await runJulyPayrollSourceJourney(resolve(process.argv[3]))));
  } catch (error) {
    try {
      const config = read(resolve(process.argv[3]));
      if ((statSync(config.outputDir).mode & 0o077) === 0) save(resolve(config.outputDir, "failure.json"), { message: error.message, stack: error.stack });
    } catch { /* No output is written when config/output privacy is unverified. */ }
    // Full private responses remain in the guarded output directory only.
    console.error(/^JULY_JOURNEY_/.test(error.message) ? error.message : "JULY_JOURNEY_VALIDATION_FAILED"); process.exitCode = 1;
  }
}
