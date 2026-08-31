#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { validateSourceRestoreReceipt } from "./source-restore-receipt.mjs";
import { canonicalT5Baseline } from "./t5-canonical-baseline.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const DOMAIN_ROWS = Object.freeze({ accept: 0, bonuscode: 8, bonusrecord: 0, compact: 802, compact_c: 357, compacttypecode: 4, course: 0, docs: 1003, family: 4560, his: 375, jch_1: 0, jobstatecode: 8, jobtrain: 0, knowhow: 6, person_core: 2949, person_user: 0, person_user_item: 8, photo: 2949, readjust: 6887, readjustitem: 8, ticket: 237, train: 0, trainhis: 2 });
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const mode = path => (statSync(path).mode & 0o777).toString(8);

function privateRegularFile(path, label) {
  if (!isAbsolute(path)) fail("T5_BASELINE_REBASE_PATH_INVALID", `${label} path must be absolute`);
  const target = resolve(path);
  let link; let info;
  try { link = lstatSync(target); info = statSync(target); } catch { fail("T5_BASELINE_REBASE_PATH_INVALID", `${label} is missing`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || mode(target) !== "600") fail("T5_BASELINE_REBASE_PATH_INVALID", `${label} must be a non-symlink 0600 file`);
  return target;
}

function readReceipt(path, baseline) {
  const receiptPath = privateRegularFile(path, "source restore receipt");
  const raw = readFileSync(receiptPath);
  let receipt;
  try { receipt = validateSourceRestoreReceipt(JSON.parse(raw)); } catch { fail("T5_BASELINE_REBASE_RECEIPT_INVALID", "source restore receipt is invalid"); }
  const receiptSha256 = sha256(raw);
  if (receipt.productionImport !== "HOLD" || receipt.sourceSnapshotSha256 !== baseline.sourceSnapshotSha256) fail("T5_BASELINE_REBASE_RECEIPT_INVALID", "source restore receipt snapshot is not canonical");
  if (receiptSha256 === baseline.sourceRestoreReceiptSha256) fail("T5_BASELINE_REBASE_NOT_NEEDED", "source restore receipt already matches the canonical baseline");
  return { receiptSha256, sourceSnapshotSha256: receipt.sourceSnapshotSha256 };
}

function readStage(path, label, baseline) {
  if (!isAbsolute(path)) fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} stage path must be absolute`);
  const root = resolve(path);
  let link; let info;
  try { link = lstatSync(root); info = statSync(root); } catch { fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} stage is missing`); }
  if (link.isSymbolicLink() || !info.isDirectory() || mode(root) !== "700") fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} stage must be a non-symlink 0700 directory`);
  const manifestPath = privateRegularFile(join(root, "manifest.json"), `${label} manifest`);
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} manifest is invalid JSON`); }
  if (manifest.sensitive !== true || manifest.productionImport !== "HOLD") fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} manifest authority`);
  for (const key of ["businessSha256", "catalogSha256", "mappingContractSha256"]) if (manifest[key] !== baseline[key] || !SHA256.test(manifest[key] ?? "")) fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} ${key} drift`);
  if (JSON.stringify(Object.keys(manifest.domains ?? {}).sort()) !== JSON.stringify(Object.keys(DOMAIN_ROWS).sort())) fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} domain set drift`);
  const domains = {};
  for (const [name, rows] of Object.entries(DOMAIN_ROWS)) {
    const item = manifest.domains[name];
    if (!item || item.rows !== rows || typeof item.file !== "string" || basename(item.file) !== item.file || !SHA256.test(item.fileSha256 ?? "")) fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} domain ${name} contract`);
    const file = privateRegularFile(join(root, item.file), `${label} domain ${name}`);
    if (sha256(readFileSync(file)) !== item.fileSha256) fail("T5_BASELINE_REBASE_STAGE_INVALID", `${label} domain ${name} hash drift`);
    domains[name] = { rows: item.rows, sourceObject: item.sourceObject, objectStatus: item.objectStatus, fileSha256: item.fileSha256 };
  }
  return { manifest, domains };
}

function writePrivate(path, value) {
  if (!isAbsolute(path)) fail("T5_BASELINE_REBASE_PATH_INVALID", "output path must be absolute");
  const target = resolve(path);
  if (existsSync(target)) fail("T5_BASELINE_REBASE_OUTPUT_EXISTS", `${basename(target)} already exists`);
  const parent = dirname(target);
  if (!existsSync(parent)) { mkdirSync(parent, { recursive: true, mode: 0o700 }); chmodSync(parent, 0o700); }
  if (mode(parent) !== "700") fail("T5_BASELINE_REBASE_PATH_INVALID", "output parent must be 0700");
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(target, 0o600);
}

export function rebaseT5CanonicalBaseline(input) {
  const baselinePath = input.baselinePath ?? resolve(import.meta.dirname, "contracts/yuzhou-t5-canonical-baseline-v1.json");
  const baseline = canonicalT5Baseline(baselinePath);
  const receipt = readReceipt(input.sourceRestoreReceipt, baseline);
  const a = readStage(input.sourceA, "A", baseline);
  const b = readStage(input.sourceB, "B", baseline);
  for (const name of Object.keys(DOMAIN_ROWS)) if (canonical(a.domains[name]) !== canonical(b.domains[name])) fail("T5_BASELINE_REBASE_AB_MISMATCH", `domain ${name} differs between A and B`);
  const candidate = { ...baseline, sourceRestoreReceiptSha256: receipt.receiptSha256 };
  const evidence = { formatVersion: 1, artifactKind: "yuzhou_t5_canonical_baseline_rebase_evidence", sourceSnapshotSha256: receipt.sourceSnapshotSha256, previousSourceRestoreReceiptSha256: baseline.sourceRestoreReceiptSha256, sourceRestoreReceiptSha256: receipt.receiptSha256, businessSha256: baseline.businessSha256, catalogSha256: baseline.catalogSha256, mappingContractSha256: baseline.mappingContractSha256, sourceRows: baseline.sourceRows, domains: a.domains, productionImport: "HOLD" };
  writePrivate(input.outputPath, candidate);
  try { writePrivate(input.evidencePath, evidence); } catch (error) { unlinkSync(input.outputPath); throw error; }
  return { sourceRows: baseline.sourceRows, productionImport: "HOLD", candidate, evidence };
}

function parseArgs(argv) {
  const values = {}; const args = argv[0] === "--" ? argv.slice(1) : argv;
  for (let index = 0; index < args.length; index += 2) { const key = args[index]; const value = args[index + 1]; if (!value || !["--source-a", "--source-b", "--source-restore-receipt", "--baseline", "--output", "--evidence"].includes(key) || values[key]) fail("T5_BASELINE_REBASE_ARGUMENTS", "invalid arguments"); values[key] = value; }
  if (Object.keys(values).length !== 6) fail("T5_BASELINE_REBASE_ARGUMENTS", "all six arguments are required");
  if (resolve(values["--output"]) === resolve(values["--evidence"])) fail("T5_BASELINE_REBASE_ARGUMENTS", "candidate and evidence outputs must differ");
  return { sourceA: values["--source-a"], sourceB: values["--source-b"], sourceRestoreReceipt: values["--source-restore-receipt"], baselinePath: values["--baseline"], outputPath: values["--output"], evidencePath: values["--evidence"] };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = rebaseT5CanonicalBaseline(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ status: "PASS", sourceRows: result.sourceRows, productionImport: result.productionImport })}\n`);
}
