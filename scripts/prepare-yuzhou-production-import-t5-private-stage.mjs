#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync, unlinkSync, rmdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { createT5NonfilePrivateStage, ProductionImportT5NonfilePrivateStageError } from "./hr-cutover/production-import-t5-nonfile-private-stage.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STAGE_DOMAINS = Object.freeze(["family", "knowhow", "person_core", "ticket"]);
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u;

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(3, "0");
const privateFile = path => {
  try { return lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() && statSync(path).nlink === 1 && mode(path) === "600"; } catch { return false; }
};
const privateDirectory = path => {
  try { return lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink() && mode(path) === "700"; } catch { return false; }
};
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const digest = value => createHash("sha256").update(value).digest("hex");
const parseJson = (path, code) => {
  if (!privateFile(path)) fail(code);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
};

export function parseT5ProductionPrivateStageArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index];
    const value = input[index + 1];
    if (!new Set(["--stage", "--triple", "--t0-decisions", "--output-root", "--run-id"]).has(key) || !value || Object.hasOwn(values, key)) fail("T5_PRIVATE_STAGE_ARGUMENT_INVALID");
    values[key] = value;
  }
  if (!Object.keys(values).every(key => ["--stage", "--triple", "--t0-decisions", "--output-root", "--run-id"].includes(key)) || Object.keys(values).length !== 5 || !SAFE_RUN_ID.test(values["--run-id"] ?? "")) fail("T5_PRIVATE_STAGE_ARGUMENT_INVALID");
  for (const key of ["--stage", "--triple", "--t0-decisions", "--output-root"]) if (!isAbsolute(values[key])) fail("T5_PRIVATE_STAGE_ARGUMENT_INVALID");
  return { stagePath: resolve(values["--stage"]), triplePath: resolve(values["--triple"]), t0DecisionsPath: resolve(values["--t0-decisions"]), outputRoot: resolve(values["--output-root"]), runId: values["--run-id"] };
}

function readStage(stagePath) {
  if (!privateDirectory(stagePath)) fail("T5_PRIVATE_STAGE_SOURCE_UNSAFE");
  const manifest = parseJson(join(stagePath, "manifest.json"), "T5_PRIVATE_STAGE_MANIFEST_INVALID");
  if (manifest.artifactKind !== "yuzhou_t5_nonfile_materialization_stage" || manifest.productionImport !== "HOLD" || !Number.isSafeInteger(manifest.sourceRows) || manifest.sourceRows <= 0 || !SHA256.test(manifest.sourceSnapshotSha256 ?? "") || !SHA256.test(manifest.sourceRestoreReceiptSha256 ?? "") || !SHA256.test(manifest.mappingContractSha256 ?? "") || !SHA256.test(manifest.nonfileBusinessSha256 ?? "") || JSON.stringify(manifest.filesExcluded) !== JSON.stringify(["photo", "docs"]) || JSON.stringify(Object.keys(manifest.domains ?? {}).sort()) !== JSON.stringify(STAGE_DOMAINS)) fail("T5_PRIVATE_STAGE_MANIFEST_INVALID");
  const records = [];
  for (const domain of STAGE_DOMAINS) {
    const item = manifest.domains[domain];
    const file = join(stagePath, item?.file ?? "");
    if (!item || typeof item.file !== "string" || !SHA256.test(item.fileSha256 ?? "") || basename(file) !== item.file || !privateFile(file) || sha256(file) !== item.fileSha256) fail("T5_PRIVATE_STAGE_SOURCE_UNSAFE");
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (!Number.isSafeInteger(item.rows) || item.rows < 0 || lines.length !== item.rows) fail("T5_PRIVATE_STAGE_ROW_COUNT_INVALID");
    try { records.push(...lines.map(line => JSON.parse(line))); } catch { fail("T5_PRIVATE_STAGE_ROW_INVALID"); }
  }
  if (records.length !== manifest.sourceRows) fail("T5_PRIVATE_STAGE_ROW_COUNT_INVALID");
  const definition = manifest.definitionEvidence;
  const definitionFile = join(stagePath, definition?.file ?? "");
  if (!object(definition) || definition.rows !== 19 || typeof definition.file !== "string" || basename(definitionFile) !== definition.file || !SHA256.test(definition.fileSha256 ?? "") || !privateFile(definitionFile) || sha256(definitionFile) !== definition.fileSha256 || definition.logicColumnDenominator !== 190 || !Number.isSafeInteger(definition.logicColumnPresentCount) || definition.logicColumnPresentCount < 0 || definition.logicColumnPresentCount > 190) fail("T5_PRIVATE_STAGE_DEFINITION_EVIDENCE_INVALID");
  let definitionEvidence;
  try { definitionEvidence = readFileSync(definitionFile, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)); } catch { fail("T5_PRIVATE_STAGE_DEFINITION_EVIDENCE_INVALID"); }
  if (definitionEvidence.length !== definition.rows) fail("T5_PRIVATE_STAGE_DEFINITION_EVIDENCE_INVALID");
  return { manifest, records, definitionEvidence };
}

function deriveEmployeeIndex(records, t0DecisionsPath, triple) {
  const artifact = parseJson(t0DecisionsPath, "T5_PRIVATE_STAGE_T0_DECISIONS_INVALID");
  const keys = ["formatVersion", "artifactKind", "triple", "phaseArtifactSha256", "targetInventoryArtifactSha256", "targetIdentitySha256", "targetScope", "jobStateDecisionArtifactSha256", "status", "countByDisposition", "records", "productionImport"];
  const dispositionKeys = ["insert", "skip_exact", "review_target_collision", "quarantine"];
  if (!exactKeys(artifact, keys) || artifact.formatVersion !== 1 || artifact.artifactKind !== "yuzhou_hr_production_import_real_t0_decision_candidates" || JSON.stringify(artifact.triple) !== JSON.stringify(triple) || artifact.productionImport !== "HOLD" || artifact.status !== "READY_FOR_FREEZE" || !Array.isArray(artifact.records)
    || !SHA256.test(artifact.phaseArtifactSha256 ?? "") || !SHA256.test(artifact.targetInventoryArtifactSha256 ?? "") || !SHA256.test(artifact.targetIdentitySha256 ?? "") || !SHA256.test(artifact.jobStateDecisionArtifactSha256 ?? "")
    || !exactKeys(artifact.countByDisposition, dispositionKeys) || !object(artifact.targetScope) || typeof artifact.targetScope.tenantId !== "string" || artifact.targetScope.tenantId.length === 0 || typeof artifact.targetScope.parkId !== "string" || artifact.targetScope.parkId.length === 0 || !SHA256.test(artifact.targetScope.scopeSha256 ?? "")) fail("T5_PRIVATE_STAGE_T0_DECISIONS_INVALID");
  const observedCounts = Object.fromEntries(dispositionKeys.map(key => [key, 0]));
  for (const row of artifact.records) {
    if (!object(row) || !dispositionKeys.includes(row.candidateDisposition)) fail("T5_PRIVATE_STAGE_T0_DECISIONS_INVALID");
    observedCounts[row.candidateDisposition] += 1;
  }
  if (JSON.stringify(observedCounts) !== JSON.stringify(artifact.countByDisposition) || observedCounts.review_target_collision !== 0 || observedCounts.quarantine !== 0) fail("T5_PRIVATE_STAGE_T0_DECISIONS_INVALID");
  const t0ByIdentity = new Map();
  for (const row of artifact.records) {
    if (!object(row) || row.targetTable !== "hr_employee") continue;
    if (row.phase !== "T0" || row.sourceSystem !== "yuzhou-v10" || row.sourceTable !== "dbo.person" || !SHA256.test(row.sourceIdentitySha256 ?? "") || t0ByIdentity.has(row.sourceIdentitySha256)) fail("T5_PRIVATE_STAGE_T0_DECISIONS_INVALID");
    t0ByIdentity.set(row.sourceIdentitySha256, row);
  }
  const employeeCodes = new Set();
  for (const record of records) {
    if (typeof record?.employeeCode !== "string" || record.employeeCode.length === 0) fail("T5_PRIVATE_STAGE_EMPLOYEE_INDEX_INVALID");
    employeeCodes.add(record.employeeCode);
  }
  const index = [];
  for (const employeeCode of [...employeeCodes].sort()) {
    const sourceIdentitySha256 = digest(`dbo.person\0${employeeCode}`);
    const row = t0ByIdentity.get(sourceIdentitySha256);
    if (!row) fail("T5_PRIVATE_STAGE_T0_DECISIONS_INCOMPLETE");
    if (!["insert", "skip_exact"].includes(row.candidateDisposition)) continue;
    if (!object(row.targetFields) || row.targetFields.employee_code !== employeeCode || !UUID.test(row.expectedTargetId ?? "")) fail("T5_PRIVATE_STAGE_T0_DECISIONS_INVALID");
    index.push({ employeeCode, sourceIdentitySha256 });
  }
  return { index, artifactSha256: sha256(t0DecisionsPath), targetIdentitySha256: artifact.targetIdentitySha256, targetScopeSha256: artifact.targetScope?.scopeSha256 };
}

function writePrivate(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  if (!privateFile(path)) fail("T5_PRIVATE_STAGE_OUTPUT_UNSAFE");
}

/**
 * Creates a new 0700 run directory containing a private T5 payload and an
 * aggregate-only receipt. It deliberately has no database connection and does
 * not activate or import data.
 */
export function prepareT5ProductionPrivateStage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["outputRoot", "runId", "stagePath", "t0DecisionsPath", "triplePath"])) fail("T5_PRIVATE_STAGE_INPUT_INVALID");
  if (!SAFE_RUN_ID.test(input.runId ?? "")) fail("T5_PRIVATE_STAGE_INPUT_INVALID");
  const stage = readStage(input.stagePath);
  const triple = parseJson(input.triplePath, "T5_PRIVATE_STAGE_TRIPLE_INVALID");
  if (!exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]) || stage.manifest.sourceSnapshotSha256 !== triple.sourceSnapshotHash || stage.manifest.mappingContractSha256 !== triple.mappingContractHash) fail("T5_PRIVATE_STAGE_TRIPLE_INVALID");
  const employees = deriveEmployeeIndex(stage.records, input.t0DecisionsPath, triple);
  const outputRoot = resolve(input.outputRoot);
  if (existsSync(outputRoot) && !privateDirectory(outputRoot)) fail("T5_PRIVATE_STAGE_OUTPUT_UNSAFE");
  if (!existsSync(outputRoot)) { mkdirSync(outputRoot, { recursive: true, mode: 0o700 }); chmodSync(outputRoot, 0o700); }
  const output = join(outputRoot, `t5-private-${input.runId}`);
  if (existsSync(output)) fail("T5_PRIVATE_STAGE_OUTPUT_EXISTS");
  mkdirSync(output, { mode: 0o700 }); chmodSync(output, 0o700);
  try {
    const generated = createT5NonfilePrivateStage({
      triple,
      stageManifest: {
        artifactKind: stage.manifest.artifactKind,
        sourceSnapshotSha256: stage.manifest.sourceSnapshotSha256,
        sourceRestoreReceiptSha256: stage.manifest.sourceRestoreReceiptSha256,
        nonfileBusinessSha256: stage.manifest.nonfileBusinessSha256,
        mappingContractSha256: stage.manifest.mappingContractSha256,
        definitionEvidenceSha256: stage.manifest.definitionEvidence.fileSha256,
        definitionEvidenceRows: stage.manifest.definitionEvidence.rows,
        definitionLogicColumnDenominator: stage.manifest.definitionEvidence.logicColumnDenominator,
        definitionLogicColumnPresentCount: stage.manifest.definitionEvidence.logicColumnPresentCount,
        t0DecisionArtifactSha256: employees.artifactSha256,
        t0TargetIdentitySha256: employees.targetIdentitySha256,
        t0TargetScopeSha256: employees.targetScopeSha256,
        domains: stage.manifest.domains,
        filesExcluded: stage.manifest.filesExcluded,
        productionImport: stage.manifest.productionImport,
      },
      definitionEvidence: stage.definitionEvidence,
      employeeIndex: employees.index,
      records: stage.records,
    });
    writePrivate(join(output, "private-stage.json"), generated.privateStage);
    writePrivate(join(output, "receipt.json"), generated.receipt);
    return Object.freeze({ output, privateStageSha256: generated.receipt.privateStageSha256, recordCount: generated.receipt.recordCount, productionImport: "HOLD" });
  } catch (error) {
    // Do not surface source values or leave a partially-written usable payload.
    for (const file of ["private-stage.json", "receipt.json"]) {
      const path = join(output, file);
      if (existsSync(path) && privateFile(path)) unlinkSync(path);
    }
    if (existsSync(output) && privateDirectory(output)) rmdirSync(output);
    if (error instanceof ProductionImportT5NonfilePrivateStageError) fail(error.code);
    fail(error?.code ?? "T5_PRIVATE_STAGE_GENERATION_FAILED");
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = prepareT5ProductionPrivateStage(parseT5ProductionPrivateStageArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "PASS", privateStageSha256: result.privateStageSha256, recordCount: result.recordCount, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "T5_PRIVATE_STAGE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
