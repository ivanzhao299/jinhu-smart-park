import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrations = resolve(root, "database/migrations");
const fixturePath = resolve(root, "scripts/e2e/property-remediation/fixtures/b2c-000197-r0-two-scope-fixture-v1.sql");
const migration197Path = resolve(migrations, "000197_property_approval_active_source_index_forward_fix.sql");
const apiRoot = resolve(root, "apps/api");
const approvalCliPath = resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-cli.ts");
const approvalSpecPath = resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg.spec.ts");
const approvalGateLibPath = resolve(root, "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs");
const prefix = "b2c-000197-v11-v6-direct-pg-regression-v29";
const fixed = Object.freeze({
  candidate: resolve(research, `${prefix}-candidate-authority-20260803.json`),
  manifest: resolve(research, `${prefix}-candidate-manifest-20260803.json`),
  registry: resolve(research, `${prefix}-resource-registry-20260803.json`),
  staticRecord: resolve(research, `${prefix}-static-test-record-20260803.json`),
  node22Tap: resolve(research, `${prefix}-node22.tap`),
  node24Tap: resolve(research, `${prefix}-node24.tap`),
  databaseReview: resolve(research, `${prefix}-independent-database-review-20260803.json`),
  qaReview: resolve(research, `${prefix}-independent-qa-review-20260803.json`),
  securityReview: resolve(research, `${prefix}-independent-security-review-20260803.json`),
  drainReview: resolve(research, `${prefix}-independent-old-writer-drain-review-20260803.json`),
  provisionAuthority: resolve(research, `${prefix}-provision-authority-20260803.json`),
  observation: resolve(research, `${prefix}-resource-observation-20260803.json`),
  executionAuthority: resolve(research, `${prefix}-execution-authority-20260803.json`),
  evidence: resolve(research, `${prefix}-evidence-20260803`),
  runner: fileURLToPath(import.meta.url),
  spec: resolve(root, "scripts/e2e/property-remediation/tests/b2c-000197-v11-v6-direct-pg-regression-v29.spec.mjs"),
});
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hex64 = /^[0-9a-f]{64}$/u;
const runIdPattern = /^b2c197_v11v6_direct_v29_[a-z0-9_]{8,40}$/u;
const containerPattern = /^jinhu-b2c197-v11v6-direct-v29-[a-z0-9-]{8,40}$/u;
const databasePattern = /^jinhu_b2c197_v11v6_direct_v29_[a-z0-9_]{4,30}$/u;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const stage = (value) => String(value).toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
const FIXTURE_SHA256 = "d23be07fe89347fa9e46ce08b3ddb64e62ad2e5d95670ad9408fe5af11e94523";
const BASELINE_MANIFEST_SHA256 = "0bf2e884ab0e7f21695f66e78a71459847cd6ed306f273a393ef45ef097fbc20";
const MIGRATION_000197_SHA256 = "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059";
const FORMAL_SOURCE_COUNT = 108;
const FORMAL_SOURCE_MANIFEST_SHA256 = "4700d218bc312e44c713ef6a1c0332bf21863b12061226d35c4fa6b6573fb79b";
const OLD_INDEX_SHA = "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584";
const OLD_PREDICATE_SHA = "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37";
const NEW_INDEX_SHA = "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c";
const NEW_PREDICATE_SHA = "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda";
const lateNames = Object.freeze(["000183_property_business_granular_rbac.sql", "000184_property_workbench_read_permissions.sql", "000185_property_b_identity_schema_expand.sql", "000186_property_b_approval_runtime_schema.sql", "000187_property_b_event_notification_schema.sql", "000188_property_b_task_runtime_schema.sql", "000189_property_b_module_rbac_definitions.sql", "000200_property_b_migration_compatibility_control.sql", "000193_property_b_runtime_integrity_forward_fix.sql", "000194_property_task_projection_contract_correction.sql", "000195_property_mutation_receipt_contract_v2.sql"]);
const reviewOrder = Object.freeze(["databaseReview", "qaReview", "securityReview", "drainReview"]);
const runtimeDependencySeeds = Object.freeze(["@nestjs/common", "pg", "reflect-metadata", "ts-node", "typeorm", "typescript"]);

export function compareCanonicalPathV29(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactObject(value, keys, code) {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error(code);
  return value;
}
function exactBoolean(value, expected, code) { if (typeof value !== "boolean" || value !== expected) throw new Error(code); }
function exactString(value, expected, code) { if (typeof value !== "string" || value !== expected) throw new Error(code); }
function exactZero(value, code) { if (typeof value !== "number" || !Number.isInteger(value) || !Object.is(value, 0)) throw new Error(code); }
function sealed(path) {
  if (!path.startsWith(`${research}${sep}`) && path !== fixed.runner && path !== fixed.spec) throw new Error("b2c-v29-fixed-path");
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error("b2c-v29-sealed-input");
  let descriptor;
  try { descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); const metadata = fstatSync(descriptor); if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o444) throw new Error("b2c-v29-sealed-input"); return readFileSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function sealedJson(path, keys, code) { const raw = sealed(path); let value; try { value = JSON.parse(raw); } catch { throw new Error(code); } return { raw, value: exactObject(value, keys, code), rawSha256: sha(raw) }; }
function assertHash(value, code) { if (typeof value !== "string" || !hex64.test(value)) throw new Error(code); }

function recursiveFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("b2c-v29-formal-source-symlink");
    if (entry.isDirectory()) files.push(...recursiveFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
function failureEvidenceEntries(directory, base = directory) {
  const entries = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name), filename = path.slice(base.length + 1).split(sep).join("/"), metadata = lstatSync(path), mode = (metadata.mode & 0o777).toString(8).padStart(4, "0");
    if (item.isSymbolicLink()) entries.push({ filename, type: "symlink", bytes: metadata.size, mode, raw_sha256: null, link_target_raw_sha256: sha(readlinkSync(path)) });
    else if (item.isDirectory()) { try { entries.push(...failureEvidenceEntries(path, base)); } catch { entries.push({ filename, type: "unreadable-directory", bytes: metadata.size, mode, raw_sha256: null, link_target_raw_sha256: null }); } }
    else if (item.isFile()) { let rawSha = null; try { rawSha = sha(readFileSync(path)); } catch { /* hostile evidence is recorded without following or masking */ } entries.push({ filename, type: "file", bytes: metadata.size, mode, raw_sha256: rawSha, link_target_raw_sha256: null }); }
    else entries.push({ filename, type: "other", bytes: metadata.size, mode, raw_sha256: null, link_target_raw_sha256: null });
  }
  return entries;
}
function formalSourcePlan() {
  const paths = [migration197Path, approvalGateLibPath, resolve(root, "package.json"), resolve(root, "pnpm-lock.yaml"), resolve(root, "pnpm-workspace.yaml"), resolve(root, "tsconfig.base.json"), resolve(apiRoot, "package.json"), resolve(apiRoot, "tsconfig.json"), resolve(root, "packages/shared/package.json"), ...recursiveFiles(resolve(root, "packages/config")),
    ...recursiveFiles(resolve(apiRoot, "src/modules/property-approvals")), ...recursiveFiles(resolve(root, "packages/shared/src")), ...recursiveFiles(resolve(root, "packages/shared/dist"))];
  const plan = [...new Set(paths)].sort(compareCanonicalPathV29).map((path) => {
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) throw new Error("b2c-v29-formal-source-path");
    return Object.freeze({ path, relative: path.slice(root.length + 1).split(sep).join("/"), raw_sha256: sha(readFileSync(path)) });
  });
  const manifest = plan.map(({ relative: path, raw_sha256 }) => ({ path, raw_sha256 }));
  if (plan.length !== FORMAL_SOURCE_COUNT || sha(JSON.stringify(manifest)) !== FORMAL_SOURCE_MANIFEST_SHA256) throw new Error("b2c-v29-formal-source-manifest-drift");
  const migration197 = plan.find(({ path }) => path === migration197Path);
  if (!migration197 || migration197.raw_sha256 !== MIGRATION_000197_SHA256) throw new Error("b2c-v29-migration-000197-drift");
  return Object.freeze({ plan: Object.freeze(plan), manifestSha: FORMAL_SOURCE_MANIFEST_SHA256, migration197 });
}
function verifyFormalSources(frozen) {
  for (const entry of frozen.plan) if (sha(readFileSync(entry.path)) !== entry.raw_sha256) throw new Error(`b2c-v29-formal-source-toctou:${entry.relative}`);
}

function packageRootFromEntry(entry, expectedName) {
  let current = lstatSync(entry).isDirectory() ? entry : dirname(entry);
  while (current.startsWith(`${root}${sep}`)) {
    const packageJson = resolve(current, "package.json");
    if (existsSync(packageJson) && !lstatSync(packageJson).isSymbolicLink()) {
      try { const value = JSON.parse(readFileSync(packageJson, "utf8")); if (typeof value.name === "string" && value.name) return realpathSync(current); } catch { /* keep walking */ }
    }
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
  throw new Error(`b2c-v29-runtime-package-root:${expectedName}`);
}
function resolveRuntimePackage(name, fromPackageJson) {
  const resolver = createRequire(fromPackageJson); let entry;
  try { entry = resolver.resolve(name); } catch { try { entry = resolver.resolve(`${name}/package.json`); } catch { throw new Error(`b2c-v29-runtime-package-missing:${name}`); } }
  if (!isAbsolute(entry)) return null;
  const realEntry = realpathSync(entry), packageRoot = packageRootFromEntry(realEntry, name);
  return { packageRoot, entry: realEntry.slice(packageRoot.length + 1).split(sep).join("/") };
}
function runtimePackageEntries(packageRoot) {
  const entries = [];
  const walk = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (directory === packageRoot && item.name === "node_modules") continue;
      const path = resolve(directory, item.name), relative = path.slice(root.length + 1).split(sep).join("/");
      if (!path.startsWith(`${root}${sep}`)) throw new Error("b2c-v29-runtime-path-escape");
      if (item.isSymbolicLink()) { const target = realpathSync(path); if (!target.startsWith(`${packageRoot}${sep}`)) throw new Error("b2c-v29-runtime-symlink-escape"); entries.push({ kind: "symlink", path: relative, target: target.slice(root.length + 1).split(sep).join("/") }); }
      else if (item.isDirectory()) walk(path);
      else if (item.isFile()) { const metadata = statSync(path); entries.push({ kind: "file", path: relative, bytes: metadata.size, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), raw_sha256: sha(readFileSync(path)) }); }
    }
  };
  walk(packageRoot); return entries;
}
function runtimeDependencyPlan() {
  const packages = new Map(), topology = [], queue = runtimeDependencySeeds.map((name) => ({ name, from: resolve(apiRoot, "package.json"), requestedBy: "apps/api/package.json", required: true }));
  while (queue.length) {
    const request = queue.shift(); let resolvedPackage; try { resolvedPackage = resolveRuntimePackage(request.name, request.from); } catch (error) { if (request.required) throw error; continue; }
    if (resolvedPackage === null) { topology.push({ kind: "builtin", request: request.name, requested_by: request.requestedBy }); continue; }
    const { packageRoot, entry } = resolvedPackage;
    const packageJsonPath = resolve(packageRoot, "package.json"), packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")), relativeRoot = packageRoot.slice(root.length + 1).split(sep).join("/");
    topology.push({ kind: "resolution", request: request.name, requested_by: request.requestedBy, target: relativeRoot, entry });
    if (packages.has(packageRoot)) continue;
    packages.set(packageRoot, true);
    const required = Object.keys(packageJson.dependencies ?? {}).sort().map((name) => ({ name, required: true }));
    const optional = [...new Set([...Object.keys(packageJson.optionalDependencies ?? {}), ...Object.keys(packageJson.peerDependencies ?? {})])].sort().map((name) => ({ name, required: false }));
    for (const dependency of [...required, ...optional]) queue.push({ ...dependency, from: packageJsonPath, requestedBy: `${relativeRoot}/package.json` });
  }
  const executable = /^\/tmp\/b2c-v29-test-[^/]+$/u.test(root) ? resolve(root, "runtime-node-fixture") : realpathSync(process.execPath), executableMetadata = statSync(executable);
  const entries = [
    { kind: "runtime", path: "@runtime/node", realpath: executable, version: process.version, bytes: executableMetadata.size, mode: (executableMetadata.mode & 0o777).toString(8).padStart(4, "0"), device: executableMetadata.dev, inode: executableMetadata.ino, mtime_ms: executableMetadata.mtimeMs, raw_sha256: sha(sealedSource(executable)) },
    ...[...packages.keys()].sort(compareCanonicalPathV29).flatMap(runtimePackageEntries),
    ...topology.sort((left, right) => compareCanonicalPathV29(JSON.stringify(left), JSON.stringify(right))),
  ];
  return Object.freeze({ entries: Object.freeze(entries.map(Object.freeze)), manifestSha: sha(JSON.stringify(entries)), executable });
}
function verifyRuntimeDependencies(frozen) {
  const live = runtimeDependencyPlan(); if (live.manifestSha !== frozen.manifestSha || !same(live.entries, frozen.entries)) throw new Error("b2c-v29-runtime-dependency-drift");
}

function writeSnapshotFile(snapshotRoot, relative, raw) {
  const path = resolve(snapshotRoot, relative);
  if (!path.startsWith(`${snapshotRoot}${sep}`) || existsSync(path)) throw new Error("b2c-v29-formal-snapshot-path");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, raw, { flag: "wx", mode: 0o444 });
  chmodSync(path, 0o444);
}
function sealSnapshotDirectories(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("b2c-v29-formal-snapshot-symlink");
    if (entry.isDirectory()) sealSnapshotDirectories(resolve(directory, entry.name));
  }
  chmodSync(directory, 0o555);
}
function runtimeSnapshotLayout(snapshotRoot, runtime) {
  const topology = runtime.entries.filter(({ kind }) => kind === "resolution"), targets = [...new Set(topology.map(({ target }) => target))].sort(compareCanonicalPathV29), targetDirectories = new Map(targets.map((target) => [target, resolve(snapshotRoot, "runtime-dependencies", sha(target).slice(0, 32))])), map = {};
  for (const entry of topology) {
    const from = entry.requested_by === "apps/api/package.json" ? resolve(snapshotRoot, "apps/api") : targetDirectories.get(entry.requested_by.replace(/\/package\.json$/u, ""));
    const target = targetDirectories.get(entry.target); if (!from || !target || typeof entry.entry !== "string" || entry.entry === "") throw new Error("b2c-v29-runtime-resolution-topology"); map[`${from}\0${entry.request}`] = { root: target, entry: resolve(target, entry.entry) };
  }
  const guard = `"use strict";\nconst Module=require("node:module"),path=require("node:path");\nconst original=Module._resolveFilename,snapshotRoot=${JSON.stringify(snapshotRoot)},mapping=${JSON.stringify(map)},issuers=${JSON.stringify([...new Set(Object.keys(map).map((key)=>key.split("\0")[0]))].sort((a,b)=>b.length-a.length))};\nconst builtins=new Set(Module.builtinModules.flatMap((name)=>[name,\`node:\${name}\`]));\nconst base=(request)=>request.startsWith("@")?request.split("/").slice(0,2).join("/"):request.split("/")[0];\nModule._resolveFilename=function(request,parent,isMain,options){if(builtins.has(request))return original.call(this,request,parent,isMain,options);const issuer=issuers.find((root)=>parent?.filename===root||parent?.filename?.startsWith(root+path.sep));const packageName=base(request),target=issuer?mapping[issuer+"\\0"+packageName]:undefined,subpath=target?request.slice(packageName.length).replace(/^\\//,""):"",candidate=target?(subpath?path.join(target.root,subpath):target.entry):request,resolved=original.call(this,candidate,parent,isMain,options);if(typeof resolved!=="string"||(!resolved.startsWith(snapshotRoot+path.sep)&&resolved!==snapshotRoot))throw new Error("b2c-v29-runtime-resolution-escape");return resolved;};\n`;
  return { topology, targets, targetDirectories, guard, guardSha: sha(guard) };
}
function expectedFormalSnapshot(frozen, runtime, snapshotRoot) {
  const layout = runtimeSnapshotLayout(snapshotRoot, runtime), entries = [];
  for (const entry of frozen.plan) entries.push({ path: entry.relative, bytes: statSync(entry.path).size, mode: "0444", raw_sha256: entry.raw_sha256 });
  for (const entry of frozen.plan.filter(({ relative }) => relative === "packages/shared/package.json" || relative.startsWith("packages/shared/dist/"))) entries.push({ path: entry.relative.replace(/^packages\/shared\//u, "node_modules/@jinhu/shared/"), bytes: statSync(entry.path).size, mode: "0444", raw_sha256: entry.raw_sha256 });
  for (const entry of runtime.entries.filter(({ kind }) => kind === "file")) { const target = layout.targets.filter((candidate) => entry.path === candidate || entry.path.startsWith(`${candidate}/`)).sort((left, right) => right.length - left.length)[0]; if (!target) throw new Error("b2c-v29-runtime-entry-owner"); entries.push({ path: `${layout.targetDirectories.get(target).slice(snapshotRoot.length + 1)}/${entry.path.slice(target.length + 1)}`, bytes: entry.bytes, mode: "0444", raw_sha256: entry.raw_sha256 }); }
  entries.push({ path: "resolution-guard.cjs", bytes: Buffer.byteLength(layout.guard), mode: "0444", raw_sha256: layout.guardSha }); entries.sort((left, right) => compareCanonicalPathV29(left.path, right.path));
  return { ...layout, entries, combinedSnapshotSha256: sha(JSON.stringify(entries)) };
}
function materializeFormalSnapshot(evidence, frozen, runtime) {
  const snapshotRoot = resolve(evidence.path, "formal-source-snapshot");
  const expected = expectedFormalSnapshot(frozen, runtime, snapshotRoot);
  mkdirSync(snapshotRoot, { recursive: false, mode: 0o700 });
  const entries = [];
  for (const entry of frozen.plan) {
    const raw = sealedSource(entry.path);
    if (sha(raw) !== entry.raw_sha256) throw new Error(`b2c-v29-formal-source-toctou:${entry.relative}`);
    writeSnapshotFile(snapshotRoot, entry.relative, raw);
    entries.push({ path: entry.relative, raw_sha256: entry.raw_sha256 });
  }
  for (const entry of frozen.plan.filter(({ relative }) => relative === "packages/shared/package.json" || relative.startsWith("packages/shared/dist/"))) {
    const mirrored = entry.relative.replace(/^packages\/shared\//u, "node_modules/@jinhu/shared/");
    writeSnapshotFile(snapshotRoot, mirrored, readFileSync(resolve(snapshotRoot, entry.relative)));
  }
  for (const entry of runtime.entries.filter(({ kind }) => kind === "file")) {
    const target = expected.targets.filter((candidate) => entry.path === candidate || entry.path.startsWith(`${candidate}/`)).sort((left, right) => right.length - left.length)[0];
    if (!target) throw new Error("b2c-v29-runtime-entry-owner"); const raw = sealedSource(resolve(root, entry.path));
    if (raw.length !== entry.bytes || sha(raw) !== entry.raw_sha256) throw new Error("b2c-v29-runtime-dependency-drift");
    writeSnapshotFile(snapshotRoot, `${expected.targetDirectories.get(target).slice(snapshotRoot.length + 1)}/${entry.path.slice(target.length + 1)}`, raw);
  }
  writeSnapshotFile(snapshotRoot, "resolution-guard.cjs", expected.guard);
  sealSnapshotDirectories(snapshotRoot);
  const snapshotEntries = recursiveFiles(snapshotRoot).sort(compareCanonicalPathV29).map((path) => { const metadata = statSync(path); return { path: path.slice(snapshotRoot.length + 1).split(sep).join("/"), bytes: metadata.size, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), raw_sha256: sha(readFileSync(path)) }; }); if (!same(snapshotEntries, expected.entries)) throw new Error("b2c-v29-formal-snapshot-materialization-drift");
  const manifest = { schema_version: "b2c-v29-formal-source-snapshot-v1", formal_source_manifest_raw_sha256: frozen.manifestSha, entries, snapshot_entries: snapshotEntries };
  evidence.write("formal-source-snapshot-manifest.json", manifest);
  return Object.freeze({
    root: snapshotRoot,
    apiRoot: resolve(snapshotRoot, "apps/api"),
    approvalCliPath: resolve(snapshotRoot, "apps/api/src/modules/property-approvals/property-approval.port.pg-cli.ts"),
    approvalSpecPath: resolve(snapshotRoot, "apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts"),
    approvalGateLibPath: resolve(snapshotRoot, "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs"),
    resolutionGuardPath: resolve(snapshotRoot, "resolution-guard.cjs"),
    tsNodeRegisterPath: (() => { const live = realpathSync(createRequire(resolve(apiRoot, "package.json")).resolve("ts-node/register")), target = expected.topology.find(({ request, requested_by }) => request === "ts-node" && requested_by === "apps/api/package.json")?.target; if (!target) throw new Error("b2c-v29-ts-node-topology"); return resolve(expected.targetDirectories.get(target), live.slice(resolve(root, target).length + 1)); })(),
    manifestRawSha256: sha(`${JSON.stringify(manifest, null, 2)}\n`),
    snapshotEntries: Object.freeze(snapshotEntries.map(Object.freeze)),
    combinedSnapshotSha256: expected.combinedSnapshotSha256,
    resolutionGuardSha256: expected.guardSha,
  });
}
function verifyFormalSnapshot(snapshot) {
  const live = recursiveFiles(snapshot.root).sort(compareCanonicalPathV29).map((path) => { const metadata = statSync(path); return { path: path.slice(snapshot.root.length + 1).split(sep).join("/"), bytes: metadata.size, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), raw_sha256: sha(readFileSync(path)) }; });
  if (!same(live, snapshot.snapshotEntries) || sha(JSON.stringify(live)) !== snapshot.combinedSnapshotSha256) throw new Error("b2c-v29-formal-snapshot-drift");
}

function baselinePlan() {
  const initial = readdirSync(migrations).filter((filename) => { const match = filename.match(/^(\d{6})_.*\.sql$/u); return match && Number(match[1]) <= 182 && Number(match[1]) !== 175; }).sort();
  const [migration183, migration184, ...remainingLate] = lateNames;
  const sources = [...initial.map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) })), { kind: "seed", filename: "000001_s1_production_core.sql", path: resolve(root, "database/seeds/000001_s1_production_core.sql") }, ...[migration183, migration184].map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) })), { kind: "fixture", filename: "000184a_b2c_000197_r0_two_scope_fixture_v1.sql", path: fixturePath }, ...remainingLate.map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) }))];
  const plan = sources.map((entry) => ({ ...entry, raw_sha256: sha(sealedSource(entry.path)) }));
  const fixture = plan.find(({ kind }) => kind === "fixture");
  if (!fixture || fixture.raw_sha256 !== FIXTURE_SHA256) throw new Error("b2c-v29-fixture-drift");
  const manifest = plan.map(({ kind, filename, raw_sha256 }) => ({ kind, filename, raw_sha256 }));
  if (plan.length !== 195 || sha(JSON.stringify(manifest)) !== BASELINE_MANIFEST_SHA256) throw new Error("b2c-v29-baseline-manifest-drift");
  return Object.freeze(plan.map(Object.freeze));
}
function sealedSource(path) { if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error("b2c-v29-migration-path-drift"); let descriptor; try { descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); const metadata = fstatSync(descriptor); if (!metadata.isFile()) throw new Error("b2c-v29-migration-path-drift"); return readFileSync(descriptor); } finally { if (descriptor !== undefined) closeSync(descriptor); } }
function migrationBytesImmediatelyBeforeExecution(entry) { const raw = sealedSource(entry.path); if (sha(raw) !== entry.raw_sha256) throw new Error(`b2c-v29-migration-byte-drift:${entry.filename}`); return raw.toString("utf8"); }

function validateRegistry(value) {
  exactObject(value, ["schema_version", "resources"], "b2c-v29-registry-schema"); exactString(value.schema_version, "b2c-v29-resource-registry-v1", "b2c-v29-registry-schema");
  if (!Array.isArray(value.resources) || value.resources.length !== 21) throw new Error("b2c-v29-registry-count");
  const labels = new Set(), identities = new Set();
  for (const entry of value.resources) { exactObject(entry, ["label", "run_id", "container", "container_id", "database", "volume"], "b2c-v29-registry-entry"); if (!/^(A|B|C|D|E|F|G|H|v4|v15|v17|v18|v19|v20|v21|v22|v23|v25|v26|v27|v28)$/u.test(entry.label) || labels.has(entry.label)) throw new Error("b2c-v29-registry-label"); labels.add(entry.label); for (const key of ["run_id", "container", "container_id", "database", "volume"]) { if (typeof entry[key] !== "string" || entry[key].trim() === "") throw new Error("b2c-v29-registry-identity"); identities.add(entry[key]); } }
  if (labels.size !== 21) throw new Error("b2c-v29-registry-labels"); return identities;
}
function staticIntake() {
  const candidateKeys = ["schema_version", "status", "execution_authorized", "container_create_authorized", "container_execute_authorized", "formal_go", "docker_or_database_command_executed", "runner_raw_sha256", "runner_spec_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256", "migration_000197_raw_sha256", "formal_source_manifest_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256"];
  const candidate = sealedJson(fixed.candidate, candidateKeys, "b2c-v29-candidate-schema"); exactString(candidate.value.schema_version, "b2c-v29-candidate-authority-v1", "b2c-v29-candidate-schema"); exactString(candidate.value.status, "PENDING_REVIEW", "b2c-v29-candidate-status");
  for (const key of ["execution_authorized", "container_create_authorized", "container_execute_authorized", "formal_go", "docker_or_database_command_executed"]) exactBoolean(candidate.value[key], false, `b2c-v29-candidate-flag:${key}`);
  for (const key of ["runner_raw_sha256", "runner_spec_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256", "migration_000197_raw_sha256", "formal_source_manifest_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256"]) assertHash(candidate.value[key], `b2c-v29-candidate-hash:${key}`);
  const formal = formalSourcePlan(), runtime = runtimeDependencyPlan(), snapshot = expectedFormalSnapshot(formal, runtime, resolve(fixed.evidence, "formal-source-snapshot"));
  const live = { runner_raw_sha256: sha(sealed(fixed.runner)), runner_spec_raw_sha256: sha(sealed(fixed.spec)), registry_raw_sha256: sha(sealed(fixed.registry)), static_test_record_raw_sha256: sha(sealed(fixed.staticRecord)), node22_tap_raw_sha256: sha(sealed(fixed.node22Tap)), node24_tap_raw_sha256: sha(sealed(fixed.node24Tap)), migration_000197_raw_sha256: formal.migration197.raw_sha256, formal_source_manifest_raw_sha256: formal.manifestSha, runtime_dependency_manifest_raw_sha256: runtime.manifestSha, combined_snapshot_raw_sha256: snapshot.combinedSnapshotSha256, resolution_guard_raw_sha256: snapshot.guardSha };
  for (const [key, value] of Object.entries(live)) if (candidate.value[key] !== value) throw new Error(`b2c-v29-live-byte-drift:${key}`);
  const manifestKeys = ["schema_version", "status", "candidate_flags", "candidate_authority_raw_sha256", "runner_raw_sha256", "runner_spec_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256", "migration_000197_raw_sha256", "formal_source_manifest_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256", "review_chain", "canonical_paths", "trust_root"];
  const manifest = sealedJson(fixed.manifest, manifestKeys, "b2c-v29-manifest-schema"); exactString(manifest.value.schema_version, "b2c-v29-candidate-manifest-v1", "b2c-v29-manifest-schema"); exactString(manifest.value.status, "PENDING_REVIEW", "b2c-v29-manifest-status");
  exactObject(manifest.value.candidate_flags, ["container_create_authorized", "container_execute_authorized", "execution_authorized", "formal_go"], "b2c-v29-manifest-flags"); for (const value of Object.values(manifest.value.candidate_flags)) exactBoolean(value, false, "b2c-v29-manifest-flags");
  const expectedHashes = { candidate_authority_raw_sha256: candidate.rawSha256, ...live }; for (const [key, value] of Object.entries(expectedHashes)) if (manifest.value[key] !== value) throw new Error(`b2c-v29-manifest-binding:${key}`);
  if (!same(manifest.value.review_chain, ["candidate", "database", "qa", "security", "drain", "provision_authority", "resource_observation", "execution_authority"])) throw new Error("b2c-v29-review-chain");
  exactObject(manifest.value.canonical_paths, Object.keys(fixed).filter((key) => !["runner", "spec", "evidence"].includes(key)), "b2c-v29-canonical-paths"); for (const key of Object.keys(manifest.value.canonical_paths)) exactString(manifest.value.canonical_paths[key], fixed[key].slice(root.length + 1), `b2c-v29-canonical-path:${key}`);
  exactString(manifest.value.trust_root, "repository-fixed-path-procedural-root-v1", "b2c-v29-trust-root");
  const record = sealedJson(fixed.staticRecord, ["schema_version", "runner_raw_sha256", "test_raw_sha256", "node22", "node24", "docker_or_database_command_executed", "coverage"], "b2c-v29-static-record-schema"); exactString(record.value.schema_version, "b2c-v29-static-test-record-v1", "b2c-v29-static-record-schema"); exactBoolean(record.value.docker_or_database_command_executed, false, "b2c-v29-static-record-command");
  if (record.value.runner_raw_sha256 !== live.runner_raw_sha256 || record.value.test_raw_sha256 !== live.runner_spec_raw_sha256) throw new Error("b2c-v29-static-record-binding");
  for (const [key, tapKey] of [["node22", "node22_tap_raw_sha256"], ["node24", "node24_tap_raw_sha256"]]) { exactObject(record.value[key], ["binary", "result", "raw_tap_sha256"], "b2c-v29-static-record-node"); if (typeof record.value[key].binary !== "string" || record.value[key].result !== "pass" || record.value[key].raw_tap_sha256 !== live[tapKey]) throw new Error("b2c-v29-static-record-node"); }
  if (!Array.isArray(record.value.coverage) || record.value.coverage.some((item) => typeof item !== "string")) throw new Error("b2c-v29-static-record-coverage");
  const registry = sealedJson(fixed.registry, ["schema_version", "resources"], "b2c-v29-registry-schema"); const prohibited = validateRegistry(registry.value);
  return Object.freeze({ candidateSha: candidate.rawSha256, manifestSha: manifest.rawSha256, registrySha: registry.rawSha256, staticRecordSha: record.rawSha256, tap22Sha: live.node22_tap_raw_sha256, tap24Sha: live.node24_tap_raw_sha256, migration197Sha: live.migration_000197_raw_sha256, formalSourceManifestSha: live.formal_source_manifest_raw_sha256, runtimeDependencyManifestSha: live.runtime_dependency_manifest_raw_sha256, combinedSnapshotSha: live.combined_snapshot_raw_sha256, resolutionGuardSha: live.resolution_guard_raw_sha256, formal, runtime, prohibited });
}
function reviewIntake(base) {
  const hashes = {}; let prior = {};
  const schema = { databaseReview: "b2c-v29-independent-database-review-v1", qaReview: "b2c-v29-independent-qa-review-v1", securityReview: "b2c-v29-independent-security-review-v1", drainReview: "b2c-v29-independent-old-writer-drain-review-v1" };
  for (const key of reviewOrder) {
    const priorKeys = Object.keys(prior); const keys = ["schema_version", "decision", "review_approved", "open_p0", "open_p1", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256", "migration_000197_raw_sha256", "formal_source_manifest_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256", ...priorKeys];
    const review = sealedJson(fixed[key], keys, `b2c-v29-${key}-schema`); exactString(review.value.schema_version, schema[key], `b2c-v29-${key}-schema`); exactString(review.value.decision, "GO", `b2c-v29-${key}-decision`); exactBoolean(review.value.review_approved, true, `b2c-v29-${key}-approved`); exactZero(review.value.open_p0, `b2c-v29-${key}-p0`); exactZero(review.value.open_p1, `b2c-v29-${key}-p1`);
    const expected = { candidate_authority_raw_sha256: base.candidateSha, candidate_manifest_raw_sha256: base.manifestSha, registry_raw_sha256: base.registrySha, static_test_record_raw_sha256: base.staticRecordSha, node22_tap_raw_sha256: base.tap22Sha, node24_tap_raw_sha256: base.tap24Sha, migration_000197_raw_sha256: base.migration197Sha, formal_source_manifest_raw_sha256: base.formalSourceManifestSha, runtime_dependency_manifest_raw_sha256: base.runtimeDependencyManifestSha, combined_snapshot_raw_sha256: base.combinedSnapshotSha, resolution_guard_raw_sha256: base.resolutionGuardSha, ...prior };
    for (const [field, value] of Object.entries(expected)) if (review.value[field] !== value) throw new Error(`b2c-v29-${key}-binding:${field}`);
    hashes[key] = review.rawSha256; prior = { ...prior, [`${key.replace("Review", "_review")}_raw_sha256`]: review.rawSha256 };
  }
  return Object.freeze(hashes);
}
function provisionIntake() {
  const base = staticIntake(), reviews = reviewIntake(base);
  const keys = ["schema_version", "status", "container_create_authorized", "container_execute_authorized", "execution_authorized", "formal_go", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "database_review_raw_sha256", "qa_review_raw_sha256", "security_review_raw_sha256", "drain_review_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256", "run_id", "container", "database", "image_reference", "host_port_bindings", "anonymous_volume", "mount_type", "mount_rw", "mount_destination"];
  const authority = sealedJson(fixed.provisionAuthority, keys, "b2c-v29-provision-schema"); exactString(authority.value.schema_version, "b2c-v29-provision-authority-v1", "b2c-v29-provision-schema"); exactString(authority.value.status, "AUTHORIZED", "b2c-v29-provision-status"); exactBoolean(authority.value.container_create_authorized, true, "b2c-v29-provision-create"); for (const key of ["container_execute_authorized", "execution_authorized", "formal_go"]) exactBoolean(authority.value[key], false, `b2c-v29-provision-flag:${key}`);
  const bindings = { candidate_authority_raw_sha256: base.candidateSha, candidate_manifest_raw_sha256: base.manifestSha, database_review_raw_sha256: reviews.databaseReview, qa_review_raw_sha256: reviews.qaReview, security_review_raw_sha256: reviews.securityReview, drain_review_raw_sha256: reviews.drainReview, runtime_dependency_manifest_raw_sha256: base.runtimeDependencyManifestSha, combined_snapshot_raw_sha256: base.combinedSnapshotSha, resolution_guard_raw_sha256: base.resolutionGuardSha }; for (const [key, value] of Object.entries(bindings)) if (authority.value[key] !== value) throw new Error(`b2c-v29-provision-binding:${key}`);
  if (!runIdPattern.test(authority.value.run_id) || !containerPattern.test(authority.value.container) || !databasePattern.test(authority.value.database)) throw new Error("b2c-v29-provision-identity"); exactString(authority.value.image_reference, "postgres:16-alpine", "b2c-v29-provision-image"); exactZero(authority.value.host_port_bindings, "b2c-v29-provision-ports"); exactBoolean(authority.value.anonymous_volume, true, "b2c-v29-provision-volume"); exactString(authority.value.mount_type, "volume", "b2c-v29-provision-mount"); exactBoolean(authority.value.mount_rw, true, "b2c-v29-provision-mount"); exactString(authority.value.mount_destination, "/var/lib/postgresql/data", "b2c-v29-provision-mount");
  for (const identity of [authority.value.run_id, authority.value.container, authority.value.database, authority.value.image_reference]) if (base.prohibited.has(identity)) throw new Error("b2c-v29-prohibited-resource-reuse");
  return Object.freeze({ base, reviews, authority: authority.value, authoritySha: authority.rawSha256 });
}
function inspect(command, target, runCommand, expectedLabels) {
  const result = runCommand("/usr/bin/docker", ["inspect", "--format", "{{.Id}}\n{{.State.Running}}\n{{.Image}}\n{{json .HostConfig.PortBindings}}\n{{json .Mounts}}\n{{json .Config.Labels}}", target.container], { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input: "", encoding: "utf8" });
  if (result.error || result.signal || result.status !== 0) throw new Error(`b2c-v29-${command}-inspect-child`); const rows = String(result.stdout ?? "").trim().split("\n"), mounts = JSON.parse(rows[4] ?? "null");
  const labels = JSON.parse(rows[5] ?? "null");
  if (rows.length !== 6 || !hex64.test(rows[0] ?? "") || rows[1] !== "true" || !/^sha256:[0-9a-f]{64}$/u.test(rows[2] ?? "") || !same(JSON.parse(rows[3] ?? "null"), {}) || !Array.isArray(mounts) || mounts.length !== 1 || mounts[0]?.Type !== "volume" || !hex64.test(mounts[0]?.Name ?? "") || mounts[0]?.RW !== true || mounts[0]?.Destination !== "/var/lib/postgresql/data") throw new Error(`b2c-v29-${command}-identity-drift`);
  const authorityKeys = ["jinhu.b2c.run_id", "jinhu.b2c.provision_authority_sha256"], inheritedKey = "desktop.docker.io/wsl-distro", keys = Object.keys(labels ?? {}).sort(); if (!same(keys, authorityKeys.sort()) && !same(keys, [...authorityKeys, inheritedKey].sort())) throw new Error(`b2c-v29-${command}-labels`); if (labels["jinhu.b2c.run_id"] !== expectedLabels.run_id || labels["jinhu.b2c.provision_authority_sha256"] !== expectedLabels.provision_authority_sha256) throw new Error(`b2c-v29-${command}-labels`);
  const inherited_labels = {}; if (Object.hasOwn(labels, inheritedKey)) { if (typeof labels[inheritedKey] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(labels[inheritedKey])) throw new Error(`b2c-v29-${command}-inherited-label`); inherited_labels[inheritedKey] = labels[inheritedKey]; } if (expectedLabels.inherited_labels !== undefined && !same(inherited_labels, expectedLabels.inherited_labels)) throw new Error(`b2c-v29-${command}-inherited-label-drift`);
  return { container_id: rows[0], image_id: rows[2].slice(7), volume_id: mounts[0].Name, inherited_labels };
}
function writeSealed(path, value) { if (!path.startsWith(`${research}${sep}`) || existsSync(path) || lstatSync(dirname(path)).isSymbolicLink() || realpathSync(dirname(path)) !== dirname(path)) throw new Error("b2c-v29-output-path"); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o444 }); chmodSync(path, 0o444); }

function provisionWithV29(runCommand) {
  const intake = provisionIntake(), intent = intake.authority;
  let createdId = "";
  try {
    const created = runCommand("/usr/bin/docker", ["run", "--detach", "--name", intent.container, "--label", `jinhu.b2c.run_id=${intent.run_id}`, "--label", `jinhu.b2c.provision_authority_sha256=${intake.authoritySha}`, "--mount", "type=volume,destination=/var/lib/postgresql/data", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", `POSTGRES_DB=${intent.database}`, intent.image_reference], { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input: "", encoding: "utf8" });
    createdId = String(created.stdout ?? "").trim(); if (created.error || created.signal || created.status !== 0 || !hex64.test(createdId)) throw new Error("b2c-v29-provision-child");
    const labels = { run_id: intent.run_id, provision_authority_sha256: intake.authoritySha }; const actual = inspect("provision", { container: intent.container }, runCommand, labels); if (actual.container_id !== createdId) throw new Error("b2c-v29-provision-container-id");
    const observation = { schema_version: "b2c-v29-resource-observation-v1", status: "OBSERVED", execution_authorized: false, formal_go: false, provision_authority_raw_sha256: intake.authoritySha, candidate_authority_raw_sha256: intake.base.candidateSha, candidate_manifest_raw_sha256: intake.base.manifestSha, runtime_dependency_manifest_raw_sha256: intake.base.runtimeDependencyManifestSha, combined_snapshot_raw_sha256: intake.base.combinedSnapshotSha, resolution_guard_raw_sha256: intake.base.resolutionGuardSha, run_id: intent.run_id, container: intent.container, container_id: actual.container_id, database: intent.database, volume_id: actual.volume_id, image_id: actual.image_id, image_reference: intent.image_reference, host_port_bindings: 0, anonymous_volume: true, mount_type: "volume", mount_rw: true, mount_destination: "/var/lib/postgresql/data", labels, inherited_labels: actual.inherited_labels };
    writeSealed(fixed.observation, observation); return Object.freeze({ observation, observation_raw_sha256: sha(sealed(fixed.observation)) });
  } catch (error) {
    if (createdId && !existsSync(fixed.observation)) writeSealed(fixed.observation, { schema_version: "b2c-v29-provision-failure-v1", status: "PROVISION_FAILED", run_id: intent.run_id, container: intent.container, database: intent.database, container_id: createdId, provision_authority_raw_sha256: intake.authoritySha, run_id_reusable: false, cleanup_attempted: false, failure: { code: "B2C_V29_PROVISION_OBSERVATION_FAILED", stage: "post-create-observation", name: "ProvisionObservationError" } });
    throw error;
  }
}

/** Formal phase one API: no caller-controlled command, path, hash, target, run ID, or evidence option. */
export function provisionV29() { return provisionWithV29(spawnSync); }

function executionIntake() {
  const intake = provisionIntake();
  const observationKeys = ["schema_version", "status", "execution_authorized", "formal_go", "provision_authority_raw_sha256", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256", "run_id", "container", "container_id", "database", "volume_id", "image_id", "image_reference", "host_port_bindings", "anonymous_volume", "mount_type", "mount_rw", "mount_destination", "labels", "inherited_labels"];
  const observation = sealedJson(fixed.observation, observationKeys, "b2c-v29-observation-schema"); exactString(observation.value.schema_version, "b2c-v29-resource-observation-v1", "b2c-v29-observation-schema"); exactString(observation.value.status, "OBSERVED", "b2c-v29-observation-status"); exactBoolean(observation.value.execution_authorized, false, "b2c-v29-observation-execute"); exactBoolean(observation.value.formal_go, false, "b2c-v29-observation-formal");
  const expectedObservation = { provision_authority_raw_sha256: intake.authoritySha, candidate_authority_raw_sha256: intake.base.candidateSha, candidate_manifest_raw_sha256: intake.base.manifestSha, runtime_dependency_manifest_raw_sha256: intake.base.runtimeDependencyManifestSha, combined_snapshot_raw_sha256: intake.base.combinedSnapshotSha, resolution_guard_raw_sha256: intake.base.resolutionGuardSha, run_id: intake.authority.run_id, container: intake.authority.container, database: intake.authority.database, image_reference: "postgres:16-alpine", host_port_bindings: 0, anonymous_volume: true, mount_type: "volume", mount_rw: true, mount_destination: "/var/lib/postgresql/data" }; for (const [key, value] of Object.entries(expectedObservation)) if (!Object.is(observation.value[key], value)) throw new Error(`b2c-v29-observation-binding:${key}`); exactObject(observation.value.labels, ["run_id", "provision_authority_sha256"], "b2c-v29-observation-labels"); if (observation.value.labels.run_id !== observation.value.run_id || observation.value.labels.provision_authority_sha256 !== intake.authoritySha) throw new Error("b2c-v29-observation-labels"); exactObject(observation.value.inherited_labels, Object.keys(observation.value.inherited_labels), "b2c-v29-observation-inherited-labels"); const inheritedKeys = Object.keys(observation.value.inherited_labels); if (inheritedKeys.length > 1 || (inheritedKeys.length === 1 && (inheritedKeys[0] !== "desktop.docker.io/wsl-distro" || typeof observation.value.inherited_labels[inheritedKeys[0]] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(observation.value.inherited_labels[inheritedKeys[0]])))) throw new Error("b2c-v29-observation-inherited-labels"); for (const key of ["container_id", "volume_id", "image_id"]) assertHash(observation.value[key], `b2c-v29-observation-identity:${key}`); for (const identity of [observation.value.run_id, observation.value.container, observation.value.container_id, observation.value.database, observation.value.volume_id, observation.value.image_id]) if (intake.base.prohibited.has(identity)) throw new Error("b2c-v29-prohibited-resource-reuse");
  const executionKeys = ["schema_version", "status", "container_create_authorized", "container_execute_authorized", "execution_authorized", "formal_go", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "database_review_raw_sha256", "qa_review_raw_sha256", "security_review_raw_sha256", "drain_review_raw_sha256", "provision_authority_raw_sha256", "resource_observation_raw_sha256", "runtime_dependency_manifest_raw_sha256", "combined_snapshot_raw_sha256", "resolution_guard_raw_sha256", "run_id", "container", "container_id", "database", "volume_id", "image_id"];
  const authority = sealedJson(fixed.executionAuthority, executionKeys, "b2c-v29-execution-schema"); exactString(authority.value.schema_version, "b2c-v29-execution-authority-v1", "b2c-v29-execution-schema"); exactString(authority.value.status, "AUTHORIZED", "b2c-v29-execution-status"); exactBoolean(authority.value.container_create_authorized, false, "b2c-v29-execution-create"); exactBoolean(authority.value.container_execute_authorized, true, "b2c-v29-execution-container"); exactBoolean(authority.value.execution_authorized, true, "b2c-v29-execution-authorized"); exactBoolean(authority.value.formal_go, false, "b2c-v29-execution-formal");
  const expectedAuthority = { candidate_authority_raw_sha256: intake.base.candidateSha, candidate_manifest_raw_sha256: intake.base.manifestSha, database_review_raw_sha256: intake.reviews.databaseReview, qa_review_raw_sha256: intake.reviews.qaReview, security_review_raw_sha256: intake.reviews.securityReview, drain_review_raw_sha256: intake.reviews.drainReview, provision_authority_raw_sha256: intake.authoritySha, resource_observation_raw_sha256: observation.rawSha256, runtime_dependency_manifest_raw_sha256: intake.base.runtimeDependencyManifestSha, combined_snapshot_raw_sha256: intake.base.combinedSnapshotSha, resolution_guard_raw_sha256: intake.base.resolutionGuardSha, run_id: observation.value.run_id, container: observation.value.container, container_id: observation.value.container_id, database: observation.value.database, volume_id: observation.value.volume_id, image_id: observation.value.image_id }; for (const [key, value] of Object.entries(expectedAuthority)) if (authority.value[key] !== value) throw new Error(`b2c-v29-execution-binding:${key}`);
  return Object.freeze({ target: observation.value, authoritySha: authority.rawSha256, observationSha: observation.rawSha256, plan: baselinePlan(), base: intake.base });
}

const expectedLate = () => baselinePlan().filter(({ filename }) => Number(filename.slice(0, 6)) >= 185).map(({ filename, raw_sha256 }) => ({ filename, raw_sha256, status: "succeeded" }));
const migration197Entry = () => ({ filename: "000197_property_approval_active_source_index_forward_fix.sql", raw_sha256: MIGRATION_000197_SHA256, status: "succeeded" });
const expectedFinalHistory = () => [...expectedLate(), migration197Entry()].sort((left, right) => compareCanonicalPathV29(left.filename, right.filename));
export function assertSnapshotV29(value) {
  exactObject(value, ["primary_history", "mirror_history", "forbidden_primary", "forbidden_mirror", "approval_rows", "keys", "indexdef", "predicate", "catalog"], "b2c-v29-snapshot-schema");
  const late = expectedLate(); if (!same(value.primary_history, late) || !same(value.mirror_history, late)) throw new Error("b2c-v29-snapshot-history"); for (const key of ["forbidden_primary", "forbidden_mirror", "approval_rows"]) exactZero(value[key], `b2c-v29-snapshot-zero:${key}`); if (!same(value.keys, ["tenant_id", "park_id", "action_id", "source_type", "source_id", "source_expected_version"]) || value.indexdef !== OLD_INDEX_SHA || value.predicate !== OLD_PREDICATE_SHA) throw new Error("b2c-v29-snapshot-contract"); exactObject(value.catalog, ["index_exists", "build_residue"], "b2c-v29-snapshot-catalog"); exactBoolean(value.catalog.index_exists, true, "b2c-v29-snapshot-index"); exactBoolean(value.catalog.build_residue, false, "b2c-v29-snapshot-residue"); return true;
}
export function assertFinalSnapshotV29(value) {
  exactObject(value, ["primary_history", "mirror_history", "forbidden_primary", "forbidden_mirror", "approval_rows", "keys", "indexdef", "predicate", "old_predicate_matches", "catalog"], "b2c-v29-final-snapshot-schema");
  const history = expectedFinalHistory(); if (!same(value.primary_history, history) || !same(value.mirror_history, history)) throw new Error("b2c-v29-final-snapshot-history");
  for (const key of ["forbidden_primary", "forbidden_mirror", "approval_rows", "old_predicate_matches"]) exactZero(value[key], `b2c-v29-final-snapshot-zero:${key}`);
  if (!same(value.keys, ["tenant_id", "park_id", "action_id", "source_type", "source_id", "source_expected_version"]) || value.indexdef !== NEW_INDEX_SHA || value.predicate !== NEW_PREDICATE_SHA) throw new Error("b2c-v29-final-snapshot-contract");
  exactObject(value.catalog, ["index_exists", "build_residue"], "b2c-v29-final-snapshot-catalog"); exactBoolean(value.catalog.index_exists, true, "b2c-v29-final-snapshot-index"); exactBoolean(value.catalog.build_residue, false, "b2c-v29-final-snapshot-residue"); return true;
}
export function assertFaultMarkerV29(output, marker) { const pattern = /^(?:psql:<stdin>:\d+: )?ERROR:\s+P0001:\s*([^\s].*?)\s*$/u; const matches = String(output).split(/\r?\n/u).map((line) => line.match(pattern)).filter(Boolean); if (matches.length !== 1 || matches[0][1] !== marker || !/^v29-injected-(before-create|after-create|after-drop|before-rename)$/u.test(marker)) throw new Error("b2c-v29-fault-marker"); }
const snapshotSql = (late) => { const listed = late.map(({ filename }) => `'${filename}'`).join(","); return `SELECT json_build_object('primary_history',(SELECT coalesce(json_agg(json_build_object('filename',filename,'raw_sha256',checksum,'status',status) ORDER BY filename),'[]'::json) FROM public.sys_schema_migration_history WHERE filename=ANY(ARRAY[${listed}])), 'mirror_history',(SELECT coalesce(json_agg(json_build_object('filename',filename,'raw_sha256',checksum,'status',status) ORDER BY filename),'[]'::json) FROM public.schema_migrations WHERE filename=ANY(ARRAY[${listed}])), 'forbidden_primary',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename ~ '^000(191|192|197)_'), 'forbidden_mirror',(SELECT count(*) FROM public.schema_migrations WHERE filename ~ '^000(191|192|197)_'), 'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request), 'keys',(SELECT array_agg(a.attname ORDER BY k.ordinal) FROM pg_index i JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ordinal) ON true JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'indexdef',(SELECT encode(public.digest(convert_to(pg_get_indexdef(indexrelid),'UTF8'),'sha256'),'hex') FROM pg_index WHERE indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'predicate',(SELECT encode(public.digest(convert_to(pg_get_expr(indpred,indrelid,false),'UTF8'),'sha256'),'hex') FROM pg_index WHERE indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'catalog',(SELECT json_build_object('index_exists',to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL,'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)))::text;`; };
const finalSnapshotSql = () => { const listed = expectedFinalHistory().map(({ filename }) => `'${filename}'`).join(","); return `SELECT json_build_object('primary_history',(SELECT coalesce(json_agg(json_build_object('filename',filename,'raw_sha256',checksum,'status',status) ORDER BY filename),'[]'::json) FROM public.sys_schema_migration_history WHERE filename=ANY(ARRAY[${listed}])), 'mirror_history',(SELECT coalesce(json_agg(json_build_object('filename',filename,'raw_sha256',checksum,'status',status) ORDER BY filename),'[]'::json) FROM public.schema_migrations WHERE filename=ANY(ARRAY[${listed}])), 'forbidden_primary',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename ~ '^000(191|192)_'), 'forbidden_mirror',(SELECT count(*) FROM public.schema_migrations WHERE filename ~ '^000(191|192)_'), 'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request), 'keys',(SELECT array_agg(a.attname ORDER BY k.ordinal) FROM pg_index i JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ordinal) ON true JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'indexdef',(SELECT encode(public.digest(convert_to(pg_get_indexdef(indexrelid),'UTF8'),'sha256'),'hex') FROM pg_index WHERE indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'predicate',(SELECT encode(public.digest(convert_to(pg_get_expr(indpred,indrelid,false),'UTF8'),'sha256'),'hex') FROM pg_index WHERE indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'old_predicate_matches',(SELECT count(*) FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass AND encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex')='${OLD_PREDICATE_SHA}'), 'catalog',(SELECT json_build_object('index_exists',to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL,'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)))::text;`; };
const bootstrap = "CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (id bigserial PRIMARY KEY,filename varchar(255) NOT NULL UNIQUE,checksum varchar(64) NOT NULL,status varchar(16) NOT NULL,started_at timestamptz NOT NULL,finished_at timestamptz,executed_by varchar(255) NOT NULL,batch_id varchar(32) NOT NULL); CREATE TABLE IF NOT EXISTS public.schema_migrations (LIKE public.sys_schema_migration_history INCLUDING ALL);";
const history = (entry) => `BEGIN; INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,executed_by,batch_id)VALUES('${entry.filename}','${entry.raw_sha256}','succeeded',clock_timestamp(),clock_timestamp(),'b2c-v29','v29'); INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,executed_by,batch_id) SELECT filename,checksum,status,started_at,finished_at,executed_by,batch_id FROM public.sys_schema_migration_history WHERE filename='${entry.filename}'; COMMIT;`;
const createBuildIndex = `CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build ON public.biz_property_approval_request (tenant_id, park_id, action_id, source_type, source_id, source_expected_version) WHERE (decision_status IN ('draft', 'submitted', 'pending_approval') OR (decision_status = 'approved' AND execution_status IN ('not_started', 'executing', 'retry_wait', 'infra_exhausted')));`;
function catalogAssertion(oldPresent, buildPresent) {
  const old = oldPresent ? `IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NULL THEN RAISE EXCEPTION 'old index missing'; END IF; SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex') INTO actual_index,actual_predicate FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass; IF actual_index<>'${OLD_INDEX_SHA}' OR actual_predicate<>'${OLD_PREDICATE_SHA}' THEN RAISE EXCEPTION 'old catalog drift'; END IF;` : "IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL THEN RAISE EXCEPTION 'old index still present'; END IF;";
  const build = buildPresent ? "IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source_v2_build'::regclass AND i.indisunique=true AND i.indisvalid=true AND i.indisready=true AND (SELECT array_agg(a.attname::text ORDER BY k.ordinal) FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum)=ARRAY['tenant_id','park_id','action_id','source_type','source_id','source_expected_version']::text[] AND encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex')='24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda') THEN RAISE EXCEPTION 'build catalog drift'; END IF;" : "IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL THEN RAISE EXCEPTION 'unexpected build index'; END IF;";
  return `DO $assert$ DECLARE actual_index text; actual_predicate text; BEGIN ${old} ${build} END $assert$;`;
}
const faults = Object.freeze([
  { boundary: "before-create", injectionPoint: "after-validation", catalogState: "old-present-build-absent", prefix: "", assertion: catalogAssertion(true, false), marker: "v29-injected-before-create" },
  { boundary: "after-create", injectionPoint: "after-validation", catalogState: "old-present-build-present", prefix: createBuildIndex, assertion: catalogAssertion(true, true), marker: "v29-injected-after-create" },
  { boundary: "after-drop", injectionPoint: "immediately-after-ddl", catalogState: "old-absent-build-present", prefix: `${createBuildIndex} DROP INDEX public.uq_biz_property_approval_request_active_source;`, assertion: catalogAssertion(false, true), marker: "v29-injected-after-drop" },
  { boundary: "before-rename", injectionPoint: "after-validation", catalogState: "old-absent-build-present", prefix: `${createBuildIndex} DROP INDEX public.uq_biz_property_approval_request_active_source;`, assertion: catalogAssertion(false, true), marker: "v29-injected-before-rename" },
].map(Object.freeze));
const injectedFailure = (marker) => `DO $fault$ BEGIN RAISE EXCEPTION '${marker}' USING ERRCODE='P0001'; END $fault$;`;
const faultSql = ({ marker, prefix, assertion, injectionPoint }) => injectionPoint === "immediately-after-ddl"
  ? `BEGIN; LOCK TABLE public.biz_property_approval_request IN SHARE MODE; ${prefix} ${injectedFailure(marker)} ${assertion}`
  : `BEGIN; LOCK TABLE public.biz_property_approval_request IN SHARE MODE; ${prefix} ${assertion} ${injectedFailure(marker)}`;

class Evidence {
  constructor(runId) { this.path = fixed.evidence; this.runId = runId; this.sequence = 0; if (existsSync(this.path) || lstatSync(dirname(this.path)).isSymbolicLink()) throw new Error("b2c-v29-evidence-root"); mkdirSync(this.path, { recursive: false, mode: 0o700 }); chmodSync(this.path, 0o700); }
  write(name, body) { const path = resolve(this.path, name); writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, { flag: "wx", mode: 0o444 }); chmodSync(path, 0o444); }
  child(name, command, argv, input, run, allowFailure = false, execution = {}) { const id = stage(name), number = String(++this.sequence).padStart(3, "0"); const cwd = execution.cwd ?? root, env = execution.env ?? { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }; this.write(`${number}-${id}-intent.json`, { schema_version: "b2c-v29-child-intent-v1", run_id: this.runId, stage: id, command, argv, execution: { cwd: cwd === root ? "." : cwd.slice(root.length + 1), env_keys: Object.keys(env).sort(), env_values_persisted: false }, stdin: { bytes: Buffer.byteLength(input), raw_sha256: sha(input), persisted: false } }); const raw = run(command, argv, { cwd, env, input, encoding: "utf8" }); const stdout = String(raw.stdout ?? ""), stderr = String(raw.stderr ?? ""); this.write(`${number}-${id}-result.json`, { schema_version: "b2c-v29-child-result-v1", run_id: this.runId, stage: id, exit_code: raw.status ?? null, signal: raw.signal ?? null, spawn_error: raw.error ? { code: "B2C_V29_CHILD_SPAWN_FAILED", stage: id, name: "ChildSpawnError" } : null, stdout: { bytes: Buffer.byteLength(stdout), raw_sha256: sha(stdout), safe_excerpt: "<suppressed>" }, stderr: { bytes: Buffer.byteLength(stderr), raw_sha256: sha(stderr), safe_excerpt: "<suppressed>" } }); if (raw.error || raw.signal || (!allowFailure && raw.status !== 0)) { const error = new Error(`b2c-v29-child:${id}`); error.stage = id; throw error; } return { ...raw, stdout, stderr }; }
  terminal(kind, body, provenance) { this.write(`${kind}-${this.runId}.json`, { schema_version: "b2c-v29-terminal-v1", run_id: this.runId, status: kind.toUpperCase(), run_id_reusable: false, retry_attempted: false, cleanup_attempted: false, authority_provenance: provenance, ...body }); const files = kind === "failure" ? failureEvidenceEntries(this.path).sort((left, right) => compareCanonicalPathV29(left.filename, right.filename)) : recursiveFiles(this.path).sort(compareCanonicalPathV29).map((path) => { const metadata = statSync(path), mode = (metadata.mode & 0o777).toString(8).padStart(4, "0"); if (mode !== "0444") throw new Error("b2c-v29-evidence-file-mode"); return { filename: path.slice(this.path.length + 1).split(sep).join("/"), bytes: metadata.size, mode, raw_sha256: sha(readFileSync(path)) }; }); this.write(`${kind}-${this.runId}.manifest.json`, { schema_version: "b2c-v29-evidence-manifest-v1", run_id: this.runId, status: kind.toUpperCase(), authority_provenance: provenance, files }); }
}
function psql(evidence, target, name, input, run, allowFailure = false) { return evidence.child(name, "/usr/bin/docker", ["exec", "--interactive", target.container, "psql", "--username", "postgres", "--dbname", target.database, "--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--file", "-"], input, run, allowFailure); }

function approvalRuntimePreflight(evidence, snapshot, runtime, run) {
  verifyFormalSnapshot(snapshot); verifyRuntimeDependencies(runtime);
  const env = { PATH: dirname(runtime.executable), NODE_PATH: "", APP_ROOT_PATH: snapshot.apiRoot, TS_NODE_PROJECT: resolve(snapshot.apiRoot, "tsconfig.json"), TS_NODE_TRANSPILE_ONLY: "true" };
  const expression = `require(${JSON.stringify(snapshot.approvalCliPath)})`;
  let result;
  try { result = evidence.child("approval-runtime-preflight", runtime.executable, ["--require", snapshot.resolutionGuardPath, "--require", snapshot.tsNodeRegisterPath, "--eval", expression], "", run, false, { cwd: snapshot.apiRoot, env }); }
  finally { verifyFormalSnapshot(snapshot); verifyRuntimeDependencies(runtime); }
  if (result.error || result.signal || result.status !== 0 || result.stdout !== "" || result.stderr !== "") throw new Error("b2c-v29-approval-runtime-preflight");
}

function approvalPortGate(evidence, target, snapshot, runtime, run) {
  const verifyExecutableClosure = () => { verifyFormalSnapshot(snapshot); verifyRuntimeDependencies(runtime); };
  const guardedChild = (...args) => { verifyExecutableClosure(); let result; try { result = evidence.child(...args); } finally { verifyExecutableClosure(); } return result; };
  verifyExecutableClosure();
  const gate = createRequire(import.meta.url)(snapshot.approvalGateLibPath), expectedNames = gate.APPROVAL_PORT_PG_REQUIRED_TEST_NAMES;
  verifyExecutableClosure();
  if (!Array.isArray(expectedNames) || expectedNames.length !== 7) throw new Error("b2c-v29-approval-names");
  const ipResult = guardedChild("approval-container-ip", "/usr/bin/docker", ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", target.container], "", run);
  const ip = ipResult.stdout.trim(); if (!/^[0-9a-f:.]+$/iu.test(ip)) throw new Error("b2c-v29-approval-ip");
  const approvalRunId = sha(target.run_id).slice(0, 32), env = { PATH: dirname(runtime.executable), NODE_PATH: "", APP_ROOT_PATH: snapshot.apiRoot, TS_NODE_PROJECT: resolve(snapshot.apiRoot, "tsconfig.json"), TS_NODE_TRANSPILE_ONLY: "true", PROPERTY_APPROVAL_PORT_PG_URL: `postgresql://postgres@${ip}:5432/${target.database}`, PROPERTY_APPROVAL_PORT_PG_RUN_ID: approvalRunId, PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE: "yes" };
  const cli = (phase) => guardedChild(`approval-${phase}`, runtime.executable, ["--require", snapshot.resolutionGuardPath, "--require", snapshot.tsNodeRegisterPath, snapshot.approvalCliPath, phase], "", run, true, { cwd: snapshot.apiRoot, env });
  const requirePhase = (phase, result) => { let parsed; try { parsed = JSON.parse(result.stdout.trim()); } catch { throw new Error(`b2c-v29-approval-${phase}`); } if (result.error || result.signal || result.status !== 0 || parsed?.phase !== phase || parsed?.runId !== approvalRunId || parsed?.status !== "pass") throw new Error(`b2c-v29-approval-${phase}`); };
  let summary, primary;
  try {
    requirePhase("probe", cli("probe")); requirePhase("setup", cli("setup"));
    const testResult = guardedChild("approval-seven-test-suite", runtime.executable, ["--test", "--test-reporter=tap", "--require", snapshot.resolutionGuardPath, "--require", snapshot.tsNodeRegisterPath, snapshot.approvalSpecPath], "", run, true, { cwd: snapshot.apiRoot, env });
    if (testResult.error || testResult.signal || testResult.status !== 0) throw new Error("b2c-v29-approval-suite");
    summary = gate.parseTapSummary(testResult.stdout, { expectedTests: 7, expectedNames });
  } catch (error) { primary = error; }
  let cleanupError;
  try { requirePhase("cleanup", cli("cleanup")); } catch (error) { cleanupError = error; }
  try { requirePhase("cleanup", cli("cleanup")); } catch (error) { cleanupError ??= error; }
  if (primary) throw primary; if (cleanupError) throw cleanupError;
  return Object.freeze({ ...summary, fixture_cleanup: true });
}

function executeWithV29(runCommand) {
  const intake = executionIntake(), target = intake.target, evidence = new Evidence(target.run_id), provenance = { resource_observation_raw_sha256: intake.observationSha, execution_authority_raw_sha256: intake.authoritySha };
  try {
    const actual = inspect("execute", target, (command, argv, options) => evidence.child("inspect", command, argv, options.input, runCommand), { ...target.labels, inherited_labels: target.inherited_labels }); if (actual.container_id !== target.container_id || actual.volume_id !== target.volume_id || actual.image_id !== target.image_id) throw new Error("b2c-v29-execute-identity-drift");
    if (!/^16[0-9]{4}$/u.test(psql(evidence, target, "postgres-16", "SHOW server_version_num;", runCommand).stdout.trim())) throw new Error("b2c-v29-version-drift");
    const formalSnapshot = materializeFormalSnapshot(evidence, intake.base.formal, intake.base.runtime); verifyRuntimeDependencies(intake.base.runtime); evidence.write("runtime-dependency-manifest.json", { schema_version: "b2c-v29-runtime-dependency-manifest-v1", runtime_dependency_manifest_raw_sha256: intake.base.runtimeDependencyManifestSha, entries: intake.base.runtime.entries });
    approvalRuntimePreflight(evidence, formalSnapshot, intake.base.runtime, runCommand);
    const plan = intake.plan; for (const entry of plan.filter(({ filename }) => Number(filename.slice(0, 6)) < 185)) psql(evidence, target, `apply-${entry.filename}`, migrationBytesImmediatelyBeforeExecution(entry), runCommand); psql(evidence, target, "history-bootstrap", bootstrap, runCommand); for (const entry of plan.filter(({ filename }) => Number(filename.slice(0, 6)) >= 185)) { psql(evidence, target, `apply-${entry.filename}`, migrationBytesImmediatelyBeforeExecution(entry), runCommand); psql(evidence, target, `record-${entry.filename}`, history(entry), runCommand); }
    const sql = snapshotSql(expectedLate()), initial = JSON.parse(psql(evidence, target, "initial-snapshot", sql, runCommand).stdout.trim()); assertSnapshotV29(initial); const results = [];
    for (const fault of faults) { const before = JSON.parse(psql(evidence, target, `before-${fault.boundary}`, sql, runCommand).stdout.trim()); assertSnapshotV29(before); const failed = psql(evidence, target, `fault-${fault.boundary}`, faultSql(fault), runCommand, true); if (failed.status === 0) throw new Error(`b2c-v29-fault-success:${fault.boundary}`); assertFaultMarkerV29(`${failed.stdout}${failed.stderr}`, fault.marker); const after = JSON.parse(psql(evidence, target, `after-${fault.boundary}`, sql, runCommand).stdout.trim()); assertSnapshotV29(after); if (!same(before, after)) throw new Error(`b2c-v29-rollback-drift:${fault.boundary}`); results.push({ boundary: fault.boundary, injection_point: fault.injectionPoint, catalog_state: fault.catalogState, marker: fault.marker, sqlstate: "P0001", snapshot_exact: true }); }
    const rollbackFinal = JSON.parse(psql(evidence, target, "rollback-final-snapshot", sql, runCommand).stdout.trim()); assertSnapshotV29(rollbackFinal); if (!same(initial, rollbackFinal)) throw new Error("b2c-v29-final-drift");
    verifyFormalSources(intake.base.formal); const migration197 = migrationBytesImmediatelyBeforeExecution(intake.base.formal.migration197); psql(evidence, target, "apply-000197", migration197, runCommand); psql(evidence, target, "record-000197", history(migration197Entry()), runCommand);
    const committedSql = finalSnapshotSql(), committed = JSON.parse(psql(evidence, target, "committed-snapshot", committedSql, runCommand).stdout.trim()); assertFinalSnapshotV29(committed);
    verifyFormalSources(intake.base.formal); psql(evidence, target, "rerun-000197-identical-bytes", migrationBytesImmediatelyBeforeExecution(intake.base.formal.migration197), runCommand);
    const rerun = JSON.parse(psql(evidence, target, "rerun-snapshot", committedSql, runCommand).stdout.trim()); assertFinalSnapshotV29(rerun); if (!same(committed, rerun)) throw new Error("b2c-v29-rerun-drift");
    const approval = approvalPortGate(evidence, target, formalSnapshot, intake.base.runtime, runCommand);
    const postApproval = JSON.parse(psql(evidence, target, "post-approval-snapshot", committedSql, runCommand).stdout.trim()); assertFinalSnapshotV29(postApproval); if (!same(committed, postApproval)) throw new Error("b2c-v29-approval-residue");
    const migration = { filename: migration197Entry().filename, raw_sha256: MIGRATION_000197_SHA256, status: "succeeded", dual_history_atomic: true, identical_byte_rerun: true, catalog_history_unchanged: true };
    verifyFormalSnapshot(formalSnapshot); verifyRuntimeDependencies(intake.base.runtime);
    if (formalSnapshot.combinedSnapshotSha256 !== intake.base.combinedSnapshotSha || formalSnapshot.resolutionGuardSha256 !== intake.base.resolutionGuardSha) throw new Error("b2c-v29-authorized-snapshot-drift");
    evidence.terminal("success", { direct_baseline: "fixed-fixture-plus-000185-000195-original-bytes", formal_source_snapshot_manifest_raw_sha256: formalSnapshot.manifestRawSha256, combined_snapshot_raw_sha256: formalSnapshot.combinedSnapshotSha256, resolution_guard_raw_sha256: formalSnapshot.resolutionGuardSha256, runtime_dependency_manifest_raw_sha256: intake.base.runtimeDependencyManifestSha, faults: results, migration_000197: migration, approval_port_pg: approval, final_snapshot_exact: true }, provenance); return Object.freeze({ faults: results, migration_000197: migration, approval_port_pg: approval, final_snapshot_exact: true });
  } catch (error) { const preflight = error?.stage === "approval-runtime-preflight"; evidence.terminal("failure", { failure: { code: "B2C_V29_EXECUTION_FAILED", stage: preflight ? "approval-runtime-preflight" : "execution", category: preflight ? "runtime-preflight" : "unknown", name: "ExecutionError" } }, provenance); throw error; }
}

/** Formal phase two API: no caller-controlled command, path, hash, target, run ID, or evidence option. */
export function executeV29() { return executeWithV29(spawnSync); }

/** Test-only facade. It has no path parameter and is unavailable from the canonical repository root. */
export function createIsolatedV29TestHarness(runCommand) {
  if (typeof runCommand !== "function" || !/^\/tmp\/b2c-v29-test-[^/]+$/u.test(root) || realpathSync(root) !== root || !research.startsWith(`${root}${sep}`)) throw new Error("b2c-v29-test-harness-root");
  return Object.freeze({ provision: () => provisionWithV29(runCommand), execute: () => executeWithV29(runCommand) });
}

export function candidateV29() { return Object.freeze({ status: "PENDING_REVIEW", execution_authorized: false, container_create_authorized: false, container_execute_authorized: false, formal_go: false, docker_or_database_command_executed: false, trust_root: "repository-fixed-path-procedural-root-v1", review_chain: ["candidate", "database", "qa", "security", "drain", "provision_authority", "resource_observation", "execution_authority"] }); }
export function runtimeDependencyManifestV29() { return runtimeDependencyPlan().manifestSha; }
export function snapshotAuthorityV29() { const value = expectedFormalSnapshot(formalSourcePlan(), runtimeDependencyPlan(), resolve(fixed.evidence, "formal-source-snapshot")); return Object.freeze({ combined_snapshot_raw_sha256: value.combinedSnapshotSha256, resolution_guard_raw_sha256: value.guardSha }); }
