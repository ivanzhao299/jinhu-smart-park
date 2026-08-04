/* global process */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research");
const foundationResearch = resolve(root,
  ".trellis/tasks/07-30-pr192-b-identity-control-plane/research");
const freezePath = resolve(research, "c4-input-freeze-v2.txt");
const taskRoot = resolve(root, "apps/api/src/modules/property-tasks");
const approvalRoot = resolve(root, "apps/api/src/modules/property-approvals");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const posixRelative = (path) => relative(root, path).split(sep).join("/");

const EXPECTED = Object.freeze({
  stage: "C4 INPUT PASS",
  owner: "property-task-input-gate-owner",
  "superseded-input-freeze-v1": "0bf8c671dd9e4ed1ae7faaf15b480c4196fbc25956011cdec482daa5f5891f8b",
  "failed-run-01i-artifact": "d50d1ecc51c5962eacc21bb3a85c28499261e3f09b8b2d7004509f38067b3694",
  "failed-run-01i-manifest": "2af4522d1974b724ed03f49f7691fcba475c9159d3a9c217b06cb18e3342f047",
  "failed-run-01i-reservation": "347a59aecb9ba60fecc0c2bf52d6d0901fe6631946640eb29e9112fda976e659",
  "failed-run-01i-cleanup-status": "passed",
  "failed-run-01i-container-absent": "true",
  "failed-run-01i-anonymous-volume-absent": "true",
  "repair-approval-adapter": "330a1296130ce23d713e23c66fa40c7830cf3c15e65dd6ce09ab3bee2bf326f6",
  "repair-approval-adapter-spec": "ab8dae3b56619f38ca87a01d1da3dbdb14ab03c0b36f3db5c57d7472b0b1fe15",
  "repair-task-orchestrator": "ce984b41d5c7a378182ac1718b98aad75263ffc48d8f3ffa2fd20965955e6ab0",
  "repair-task-orchestrator-spec": "011dc7df1f29f3146627b0dde7f89b74142597d25bb919db22de7252ddc05b1f",
  "approval-runtime-file-count": "53",
  "approval-runtime-grammar-bytes": "8182",
  "allowed-cross-owner-production-exception-count": "1",
  "allowed-cross-owner-production-exception": "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts",
  "c3-final-signoff": "efed9823bfa6086319447c69068a744231a3a2b793997cfd887e0b318107b27d",
  "c3-runtime-artifact": "76ed0588c25a0e88eb365ccff1a51e1cec2d8db26c16e127b1479feff250363a",
  "c3-runtime-detached-manifest": "01696a19a7876719d40b3fb23f0aad417431d3e1d97044002f432aeace493a5d",
  "c3-runtime-input-freeze": "30775a755c570a15938989a99d567b81c33eaf3ede1a53079dbeaf543a1cdcfa",
  "b-approval-runtime-sidecar": "30168511b4ea2028afebf45300a399dcb3f0d15b6ed279368611447a61f1f589",
  "b-approval-runtime-canonical": "1d9b5533fff085a125c8aae913b6ff06ac3e7d73606e5710ec796964ec48e853",
  "foundation-contract-v2-attestation": "8ee9ae99efbb14dd346ff10b78ed5af759c893b5f83d3d30188549f85e28807e",
  "appmodule-contract-v2-reattestation": "56edea04fd350523e93d7cd3cd1de3e71a68bcd005b4dd10b4b2375da21d013f",
  "appmodule-raw": "225fbdfa17f7d2ec99f280d909cab057fc04b803c06fbf2ae378874707ef09fb",
  "b-contract": "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944",
  "shared-source": "d444a85ec6be5dcaf0cc0315fdab7aafdbf1493322a6df104930aaad226b633a",
  "endpoint-manifest": "6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd",
  "endpoint-row-count": "49",
  "error-filter": "ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0",
  "error-filter-sidecar": "9ca15ef645574a8c86a3f0cd5c3cdd238aa55ac0dddab99fae9be140275b16c2",
  "000188": "e0b659d9d5c35eec67cfa029240538626492736e4f450f2b47acb40e25dc4e08",
  "000194": "93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0",
  "000195": "9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4",
  "c2-final-candidate": "b5169a6e2668d3a2491814f34dd6745e386056f721236160aa5fe331aae41e50",
  "c2-detached-manifest": "67bca562e4b80a12b7fb9cde03e14eb622f27154e649b402c9a8f5f8a8065844",
  "c2-projection-schema": "8d36af019b125e5e6fac5fd99a632c00154d2126c228c7bb4ba50f5091ff7868",
  "c2-function-artifact": "efec512c186d64d025be6760aeeec730c11d8b176dd70ad9dc7a2c4146af043a",
  "c2-function-definition-grammar": "62af6e29ce78590b1c90621eefb5319ef101f7375b347fc4f6dc5a0341704c1f",
  "c2-projection-replace-definition": "50655ce0ca2a74ff653066b77b9ff60cd969663e07f6828934fd21ef601f2b47",
  "c2-budget-candidate": "127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4",
  "c2-budget-evidence": "38ebd4148083f3439a3456079ecc77a9aff1da41a19d113f61c90d30cd5499c0",
  "c2-budget-canonical": "d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45",
  "c2-budget-final-signoff": "1744d43ec80c9faeb52abb8659c78655df6575ad75024392b1c770644a5a0ac4",
  "receipt-token": "PROPERTY_MUTATION_RECEIPT_PORT",
  "production-registry-count": "0",
  "allowed-owned-path": "apps/api/src/modules/property-tasks/**",
  "forbidden-owned-paths": "apps/api/src/modules/property-approvals/**,packages/shared/**,database/migrations/**,apps/api/src/app.module.ts",
  validation: "PASS",
  "open-p0-p1": "[]"
});

function fail(message) {
  throw new Error(`C4 input gate: ${message}`);
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: ${actual} != ${expected}`);
}
function rawHash(path, expected, label = posixRelative(path)) {
  if (!existsSync(path)) fail(`${label} is missing`);
  const digest = sha256(readFileSync(path));
  assertEqual(digest, expected, `${label} raw SHA-256`);
  return digest;
}
function recursiveFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? recursiveFiles(path) : [path];
  });
}
function byteSort(values) {
  return [...values].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
}

function readFreeze() {
  const bytes = readFileSync(freezePath);
  if (bytes[0] === 0xef || bytes.includes(13) || bytes.at(-1) !== 10) {
    fail("freeze must be UTF-8 without BOM, LF-only and final-LF");
  }
  const lines = bytes.toString("utf8").slice(0, -1).split("\n");
  assertEqual(lines.shift(), "c4-input-freeze-v2", "freeze header");
  const observed = {};
  for (const line of lines) {
    const cells = line.split("\t");
    if (cells.length !== 2 || !cells[0] || Object.hasOwn(observed, cells[0])) {
      fail(`invalid freeze row: ${line}`);
    }
    observed[cells[0]] = cells[1];
  }
  assertEqual(JSON.stringify(observed), JSON.stringify(EXPECTED), "exact frozen key/value sequence");
  return { values: observed, raw_sha256: sha256(bytes), bytes: bytes.length };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${byteSort(Object.keys(value)).map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertFailedRunClosure(freeze, failedRun, manifest, reservation) {
  assertEqual(failedRun.status, "failed", "01i outcome");
  assertEqual(failedRun.candidate_admissible, false, "01i candidate admissibility");
  assertEqual(failedRun.cleanup?.status, freeze["failed-run-01i-cleanup-status"],
    "01i cleanup status");
  assertEqual(String(failedRun.cleanup?.container_absent),
    freeze["failed-run-01i-container-absent"], "01i container absence");
  assertEqual(String(failedRun.cleanup?.anonymous_volume_absent),
    freeze["failed-run-01i-anonymous-volume-absent"], "01i anonymous volume absence");
  if (!Array.isArray(failedRun.cleanup?.errors) || failedRun.cleanup.errors.length !== 0) {
    fail("01i cleanup errors must be exact-empty");
  }
  for (const claim of ["run_id\tb2ac4_runtime_formal_v11_20260801i", "status\tfailed",
    "candidate_admissible\tfalse", freeze["failed-run-01i-artifact"],
    freeze["failed-run-01i-reservation"]]) {
    if (!manifest.includes(claim)) fail(`01i detached manifest does not bind ${claim}`);
  }
  assertEqual(reservation.run_id, "b2ac4_runtime_formal_v11_20260801i", "01i reservation runId");
  assertEqual(reservation.artifact,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/c4-runtime-formal-candidate-v11-20260801i.json",
    "01i reservation artifact");
  assertEqual(reservation.manifest,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/c4-runtime-formal-candidate-v11-20260801i.manifest.txt",
    "01i reservation manifest");
  return true;
}

function assertSignedInputs(freeze) {
  const inputs = [
    ["superseded-input-freeze-v1", resolve(research, "c4-input-freeze-v1.txt")],
    ["failed-run-01i-artifact", resolve(research,
      "c4-runtime-formal-candidate-v11-20260801i.json")],
    ["failed-run-01i-manifest", resolve(research,
      "c4-runtime-formal-candidate-v11-20260801i.manifest.txt")],
    ["failed-run-01i-reservation", resolve(research,
      "c4-runtime-runid-56b1fd4b07d1c0be69ecb7dd114e702df5a6b81caaa5b5651ae82b95a77dca70.reservation.json")],
    ["repair-approval-adapter", resolve(root,
      "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts")],
    ["repair-approval-adapter-spec", resolve(root,
      "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.spec.ts")],
    ["repair-task-orchestrator", resolve(root,
      "apps/api/src/modules/property-tasks/property-task.orchestrator.ts")],
    ["repair-task-orchestrator-spec", resolve(root,
      "apps/api/src/modules/property-tasks/property-task.orchestrator.spec.ts")],
    ["c3-final-signoff", resolve(research, "b2a-c3-final-gate-signoff.md")],
    ["c3-runtime-artifact", resolve(research, "b2a-c3-runtime-formal-candidate-20260801d.json")],
    ["c3-runtime-detached-manifest", resolve(research,
      "b2a-c3-runtime-formal-candidate-20260801d.manifest.txt")],
    ["b-approval-runtime-sidecar", resolve(research, "b-approval-runtime-v2.txt")],
    ["foundation-contract-v2-attestation", resolve(foundationResearch,
      "b-property-foundation-contract-v2-attestation.txt")],
    ["appmodule-contract-v2-reattestation", resolve(research,
      "appmodule-contract-v2-reattestation.txt")],
    ["appmodule-raw", resolve(root, "apps/api/src/app.module.ts")],
    ["error-filter-sidecar", resolve(research, "b2a-c1-error-filter-handoff.md")],
    ["000188", resolve(root, "database/migrations/000188_property_b_task_runtime_schema.sql")],
    ["000194", resolve(root,
      "database/migrations/000194_property_task_projection_contract_correction.sql")],
    ["000195", resolve(root,
      "database/migrations/000195_property_mutation_receipt_contract_v2.sql")],
    ["c2-final-candidate", resolve(research, "b2a-c2-candidate-gate-artifact-v12d.json")],
    ["c2-detached-manifest", resolve(research,
      "b2a-c2-candidate-gate-artifact-v12d.json.manifest.json")],
    ["c2-projection-schema", resolve(research,
      "b2a-c2-candidate-gate-artifact-v12d.json.projection-schema.grammar")],
    ["c2-function-artifact", resolve(research,
      "b2a-c2-candidate-gate-artifact-v12d.json.functions.json")],
    ["c2-budget-candidate", resolve(research,
      "b2a-c2-projection-budget-addendum-candidate.md")],
    ["c2-budget-evidence", resolve(research,
      "b2a-c2-projection-budget-addendum-candidate-evidence.md")],
    ["c2-budget-final-signoff", resolve(research,
      "b2a-c2-projection-budget-addendum-final-signoff.md")]
  ];
  for (const [key, path] of inputs) rawHash(path, freeze[key]);

  const failedRun = JSON.parse(readFileSync(resolve(research,
    "c4-runtime-formal-candidate-v11-20260801i.json"), "utf8"));
  const manifest = readFileSync(resolve(research,
    "c4-runtime-formal-candidate-v11-20260801i.manifest.txt"), "utf8");
  const reservation = JSON.parse(readFileSync(resolve(research,
    "c4-runtime-runid-56b1fd4b07d1c0be69ecb7dd114e702df5a6b81caaa5b5651ae82b95a77dca70.reservation.json"), "utf8"));
  assertFailedRunClosure(freeze, failedRun, manifest, reservation);

  const c3 = readFileSync(resolve(research, "b2a-c3-final-gate-signoff.md"), "utf8");
  for (const claim of ["C3 FINAL GATE = PASS", "C3_open_P0_P1=[]",
    "C4_runtime_release=allowed_property-task-owner_only", freeze["b-approval-runtime-sidecar"],
    "49808f0e7e87908755bbf30384f4d338c92065e6a1f896856effaf1a1529f36c",
    freeze["foundation-contract-v2-attestation"],
    freeze["appmodule-contract-v2-reattestation"]]) {
    if (!c3.includes(claim)) fail(`C3 final signoff does not bind ${claim}`);
  }
  const foundation = readFileSync(resolve(foundationResearch,
    "b-property-foundation-contract-v2-attestation.txt"), "utf8");
  if (!foundation.includes("validation\tPASS") || !foundation.includes("open-p0-p1\t[]")
    || !foundation.includes("current-c1-5-foundation-runtime-v2\t984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4")) {
    fail("foundation contract-v2 attestation is not closed PASS");
  }
  rawHash(resolve(research, "b-property-foundation-runtime-v2.txt"),
    "984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4");
}

function recomputeBContract() {
  const rows = [
    ["b0-runtime-contract-freeze.md", "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf"],
    ["b0-product-access-freeze.md", "d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040"],
    ["b0-identity-control-freeze.md", "062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496"],
    ["b0-schema-physical-addendum.md", "3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5"]
  ];
  const freezeRoot = resolve(root,
    ".trellis/tasks/07-30-pr192-property-productization-remediation/research");
  for (const [name, digest] of rows) rawHash(resolve(freezeRoot, name), digest);
  return sha256(`b-contract-v2\n${rows.map(([name, digest]) =>
    `freeze\t${name}\t${digest}\n`).join("")}`);
}

const sharedFiles = ["access-manifest.ts", "index.ts", "permission-bundles.ts", "permissions.ts",
  "property-task-contracts.ts", "response-contracts.ts", "routes.ts", "track-b-contracts.ts",
  "track-b-endpoint-permissions.ts", "track-b-routes.ts"];
function recomputeSharedSource() {
  const rows = sharedFiles.map((name) => {
    const path = `packages/shared/src/property-business/${name}`;
    return `file\t${path}\t${sha256(readFileSync(resolve(root, path)))}\n`;
  });
  return sha256(`b-shared-source-v1\n${rows.join("")}`);
}
function recomputeEndpointManifest() {
  const require = createRequire(import.meta.url);
  const shared = require(resolve(root, "packages/shared/dist/index.js"));
  const rows = shared.PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST;
  if (!Array.isArray(rows) || rows.length !== Number(EXPECTED["endpoint-row-count"])) {
    fail("built shared endpoint manifest is not the frozen 49-row array");
  }
  const sorted = [...rows].sort((left, right) => Buffer.compare(
    Buffer.from(`${left.method}\t${left.path}`, "utf8"),
    Buffer.from(`${right.method}\t${right.path}`, "utf8")));
  const grammar = `b-endpoint-manifest-v2\n${sorted.map((entry) =>
    `row\t${entry.method}\t${entry.path}\t${sha256(canonicalJson(entry))}\n`).join("")}`;
  return { digest: sha256(grammar), row_count: rows.length, shared };
}
function recomputeApprovalRuntime() {
  const paths = byteSort(recursiveFiles(approvalRoot)
    .filter((path) => path.endsWith(".ts"))
    .map(posixRelative));
  const grammar = `b-approval-runtime-owned-files-v2\n${paths.map((path) => {
    const bytes = readFileSync(resolve(root, path));
    return `file\t${path}\t${bytes.length}\t${sha256(bytes)}\n`;
  }).join("")}`;
  if (paths.length !== 53) fail(`approval canonical file count is ${paths.length}, expected 53`);
  return { digest: sha256(grammar), count: paths.length, bytes: Buffer.byteLength(grammar) };
}
export function assertCrossOwnerProductionExceptions(values) {
  const expectedPath = "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts";
  const count = Number(values["allowed-cross-owner-production-exception-count"]);
  const path = values["allowed-cross-owner-production-exception"];
  if (count !== 1 || path !== expectedPath || path.includes("*") || path.endsWith("/")) {
    fail("cross-owner production exception must be the exact single adapter path");
  }
  return { count, paths: [path] };
}
function recomputeErrorFilter() {
  const paths = ["apps/api/src/shared/filters/api-exception.filter.ts",
    "apps/api/src/shared/filters/api-exception.filter.spec.ts"];
  return sha256(`b-property-error-filter-v1\n${paths.map((path) =>
    `file\t${path}\t${sha256(readFileSync(resolve(root, path)))}\n`).join("")}`);
}
function assertC2ProjectionAndBudget() {
  const functions = JSON.parse(readFileSync(resolve(research,
    "b2a-c2-candidate-gate-artifact-v12d.json.functions.json"), "utf8"));
  assertEqual(sha256(functions.grammar), EXPECTED["c2-function-definition-grammar"],
    "C2 function grammar SHA-256");
  assertEqual(functions.grammar_sha256, EXPECTED["c2-function-definition-grammar"],
    "C2 function grammar declared SHA-256");
  const replaceRow = functions.rows?.find((row) =>
    row.identity?.startsWith("fn_property_task_projection_replace_v1("));
  assertEqual(replaceRow?.definition_sha256, EXPECTED["c2-projection-replace-definition"],
    "projection replace function definition SHA-256");

  const budget = readFileSync(resolve(research,
    "b2a-c2-projection-budget-addendum-candidate.md"));
  const begin = Buffer.from("<!-- B2A_C2_PROJECTION_BUDGET_GRAMMAR_BEGIN -->\n");
  const end = Buffer.from("<!-- B2A_C2_PROJECTION_BUDGET_GRAMMAR_END -->");
  const start = budget.indexOf(begin);
  const finish = budget.indexOf(end, start + begin.length);
  if (start < 0 || finish < 0 || budget.indexOf(begin, start + 1) >= 0
    || budget.indexOf(end, finish + 1) >= 0) fail("C2 budget marker cardinality");
  const encoded = budget.subarray(start + begin.length, finish);
  if (encoded.includes(9) || encoded.includes(13) || encoded.at(-1) !== 10) {
    fail("C2 budget encoded grammar shape");
  }
  const grammar = Buffer.from(encoded.toString("ascii").replaceAll("<TAB>", "\t"), "ascii");
  assertEqual(grammar.length, 1692, "C2 budget canonical bytes");
  assertEqual(sha256(grammar), EXPECTED["c2-budget-canonical"], "C2 budget canonical SHA-256");
}

const DIRECT_PROJECTION_DML = /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\s*\.\s*)?biz_property_task_projection(?:_head)?\b/i;
const DIRECT_RECEIPT_ACCESS = /\bbiz_property_mutation_receipt\b|\bDatabasePropertyMutationReceiptAdapter\b|from\s+["'][^"']*property-mutation-receipt\.adapter["']/i;
export function assertTaskProductionSources(files) {
  for (const file of files) {
    const { path, source } = file;
    const approvedSerializationHelperImport = path ===
      "apps/api/src/modules/property-tasks/property-task.orchestrator.ts"
      ? source.replace(/import\s*\{\s*isPropertyMutationReceiptSerializationFailure\s*\}\s*from\s*["']\.\.\/property-approvals\/property-mutation-receipt\.adapter["'];?/u, "")
      : source;
    if (DIRECT_PROJECTION_DML.test(source)) fail(`${path} contains direct projection/head DML`);
    if (DIRECT_RECEIPT_ACCESS.test(approvedSerializationHelperImport)) {
      fail(`${path} bypasses the receipt port token`);
    }
    if (/\btest_fixture_[a-z0-9_]*\b/i.test(source)) fail(`${path} contains test_fixture_*`);
    if (/PROPERTY_MUTATION_RECEIPT|mutation.?receipt/i.test(source)
      && !source.includes(EXPECTED["receipt-token"])) {
      fail(`${path} refers to mutation receipts without PROPERTY_MUTATION_RECEIPT_PORT`);
    }
  }
  return { production_file_count: files.length };
}
function assertProductionOwnership(shared) {
  const files = recursiveFiles(taskRoot).filter((path) => path.endsWith(".ts")
    && !/\.(?:spec|test)\.ts$/.test(path)
    && !path.split(sep).includes("fixtures"))
    .map((path) => ({ path: posixRelative(path), source: readFileSync(path, "utf8") }));
  const scan = assertTaskProductionSources(files);
  const contractSource = readFileSync(resolve(root,
    "packages/shared/src/property-business/property-task-contracts.ts"), "utf8");
  if (!/PROPERTY_TASK_PRODUCTION_SOURCE_REGISTRATIONS\s*=\s*\[\]\s+as const\s+satisfies/.test(contractSource)) {
    fail("production source registrations are not exact-empty in shared source");
  }
  if (!contractSource.includes("Symbol(\"PROPERTY_MUTATION_RECEIPT_PORT\")")) {
    fail("shared receipt token symbol definition drifted");
  }
  if (shared.PROPERTY_TASK_PRODUCTION_SOURCE_REGISTRATIONS?.length !== 0
    || shared.createPropertyTaskProductionSourceRegistry?.().size !== 0) {
    fail("built production source registry is not exact-empty");
  }
  return { ...scan, direct_projection_dml_count: 0, direct_receipt_bypass_count: 0,
    production_test_fixture_count: 0, production_registry_count: 0 };
}

export function runC4InputGate() {
  const freezeArtifact = readFreeze();
  const freeze = freezeArtifact.values;
  assertSignedInputs(freeze);
  assertEqual(recomputeBContract(), freeze["b-contract"], "B-contract SHA-256");
  assertEqual(recomputeSharedSource(), freeze["shared-source"], "shared source SHA-256");
  const endpoint = recomputeEndpointManifest();
  assertEqual(endpoint.digest, freeze["endpoint-manifest"], "endpoint manifest SHA-256");
  const approval = recomputeApprovalRuntime();
  assertEqual(approval.digest, freeze["b-approval-runtime-canonical"],
    "approval runtime canonical SHA-256");
  assertEqual(String(approval.count), freeze["approval-runtime-file-count"],
    "approval runtime file count");
  assertEqual(String(approval.bytes), freeze["approval-runtime-grammar-bytes"],
    "approval runtime grammar bytes");
  const crossOwnerProductionExceptions = assertCrossOwnerProductionExceptions(freeze);
  assertEqual(recomputeErrorFilter(), freeze["error-filter"], "property error filter SHA-256");
  assertC2ProjectionAndBudget();
  const ownership = assertProductionOwnership(endpoint.shared);
  return {
    schema_version: "track-b2a-c4-input-gate-v2",
    status: "passed",
    stage: freeze.stage,
    freeze: { raw_sha256: freezeArtifact.raw_sha256, bytes: freezeArtifact.bytes },
    recalculated: {
      b_contract_sha256: freeze["b-contract"],
      shared_source_sha256: freeze["shared-source"],
      endpoint_manifest_sha256: endpoint.digest,
      endpoint_row_count: endpoint.row_count,
      approval_runtime_sha256: approval.digest,
      approval_file_count: approval.count,
      approval_grammar_bytes: approval.bytes,
      error_filter_sha256: freeze["error-filter"],
      projection_function_grammar_sha256: freeze["c2-function-definition-grammar"],
      projection_replace_definition_sha256: freeze["c2-projection-replace-definition"],
      projection_budget_sha256: freeze["c2-budget-canonical"]
    },
    ownership,
    cross_owner_production_exceptions: crossOwnerProductionExceptions,
    open_p0_p1: []
  };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(runC4InputGate(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
