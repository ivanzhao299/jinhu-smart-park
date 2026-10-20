#!/usr/bin/env node
/* global process */
// Controlled local operator entry. It authenticates complete retained prepared
// files and registers extraction facts only; it never approves payroll policy.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import shared from "../../packages/shared/dist/hr-yuzhou-payroll-source.js";
import { buildYuzhouPayrollSourcePackageFromPreparedStreaming } from "./build-yuzhou-payroll-source-package.mjs";
const { canonicalJson, canonicalYuzhouPayrollSourcePackage, validateYuzhouPayrollSourcePackage, validateYuzhouPayrollSourceHashes } = shared;
const sha = value => createHash("sha256").update(value).digest("hex");
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const HASH = /^[0-9a-f]{64}$/u;
const fail = code => { throw new Error(`PAYROLL_SOURCE_EXTRACTION_${code}`); };
const privateFile = path => { if (!isAbsolute(path) || !statSync(path).isFile() || (statSync(path).mode & 0o077)) fail("PRIVATE_FILE_REQUIRED"); };
const knownFiles = ["scheme-memberships.jsonl", "items.jsonl", "formulas.jsonl", "closes.jsonl", "payslips.jsonl", "tax-rules.jsonl"];
export function payrollSourceExtractorIdentity() {
  const files = Object.fromEntries([
    "scripts/hr-cutover/register-yuzhou-payroll-source-extraction.mjs",
    "scripts/hr-cutover/build-yuzhou-payroll-source-package.mjs",
    "packages/shared/src/hr-yuzhou-payroll-source.ts",
    "packages/shared/dist/hr-yuzhou-payroll-source.js",
  ].map(path => [path, sha(readFileSync(resolve(root, path)))]));
  return { extractorSha256: sha(canonicalJson(files)), files };
}

/** The caller supplies a reviewed extractor hash; no public API exposes this entry. */
export async function verifyPreparedPayrollExtraction(options) {
  if (!options || !HASH.test(options.expectedExtractorSha256 ?? "")
    || payrollSourceExtractorIdentity().extractorSha256 !== options.expectedExtractorSha256) fail("EXTRACTOR_DRIFT");
  for (const key of ["preparedRoot", "manifestPath", "mappingPath"]) if (!isAbsolute(options[key] ?? "")) fail("ABSOLUTE_PATH_REQUIRED");
  privateFile(options.manifestPath); privateFile(options.mappingPath);
  const manifestBytes = readFileSync(options.manifestPath);
  if (!HASH.test(options.expectedManifestSha256 ?? "") || sha(manifestBytes) !== options.expectedManifestSha256) fail("MANIFEST_DRIFT");
  const manifest = JSON.parse(manifestBytes);
  if (!manifest.outputFiles || typeof manifest.outputFiles !== "object" || Array.isArray(manifest.outputFiles)
    || Object.keys(manifest.outputFiles).some(name => !knownFiles.includes(name))) fail("MANIFEST_FILES_INVALID");
  // The existing streaming builder authenticates the whole payslip file (not a
  // client month slice) and every selected catalog/close/membership file.
  const built = await buildYuzhouPayrollSourcePackageFromPreparedStreaming({
    preparedRoot: options.preparedRoot, manifestPath: options.manifestPath, mappingPath: options.mappingPath,
    month: options.month, sourceInstance: options.sourceInstance,
    expectedHeadVersion: options.expectedHeadVersion ?? 0, expectedHeadHash: options.expectedHeadHash ?? null,
  });
  // Tax rules are not projected into this source package, but if the manifest
  // declares them, authenticate their bytes too before attesting that manifest.
  if (manifest.outputFiles["tax-rules.jsonl"]) {
    const expected = manifest.outputFiles["tax-rules.jsonl"].fileSha256;
    if (!HASH.test(expected ?? "")) fail("MANIFEST_FILES_INVALID");
    const digest = createHash("sha256");
    for await (const bytes of createReadStream(resolve(options.preparedRoot, "tax-rules.jsonl"))) digest.update(bytes);
    if (digest.digest("hex") !== expected) fail("FILE_HASH_MISMATCH");
  }
  if (sha(readFileSync(options.manifestPath)) !== sha(manifestBytes)
    || built.preparedEvidence.manifestSha256 !== sha(manifestBytes)
    || payrollSourceExtractorIdentity().extractorSha256 !== options.expectedExtractorSha256) fail("INPUT_DRIFT");
  validateYuzhouPayrollSourcePackage(built.packageDto);
  validateYuzhouPayrollSourceHashes(built.packageDto, sha);
  const pkg = canonicalYuzhouPayrollSourcePackage(built.packageDto);
  const proof = { targetScope: pkg.targetScope, sourceSystem: pkg.sourceSystem, sourceInstance: pkg.sourceInstance,
    month: pkg.month, evidenceSha256: pkg.evidenceSha256, booksSha256: sha(canonicalJson(pkg.books)),
    bookSetSha256: pkg.bookSetSha256, rosterSha256: pkg.rosterSha256, catalogSha256: pkg.catalogSha256,
    manifestSha256: built.preparedEvidence.manifestSha256, mappingSha256: built.preparedEvidence.mappingArtifactSha256,
    extractorSha256: options.expectedExtractorSha256, fileSha256: built.preparedEvidence.files,
    recordCount: built.receipt.recordCount, valueCount: built.receipt.valueCount, bookCount: pkg.books.length };
  return { proof, packageSha256: built.receipt.packageSha256 };
}

// Kept private so module consumers cannot submit a caller-constructed attestation.
async function persistVerifiedExtraction(client, proof) {
  const values = [proof.targetScope.tenantId, proof.targetScope.parkId, proof.sourceInstance, `${proof.month}-01`,
    proof.evidenceSha256, proof.booksSha256, proof.bookSetSha256, proof.rosterSha256, proof.catalogSha256,
    proof.manifestSha256, proof.mappingSha256, proof.extractorSha256, JSON.stringify(proof.fileSha256),
    proof.recordCount, proof.valueCount, proof.bookCount];
  await client.query(`INSERT INTO hr_yuzhou_payroll_source_extraction(tenant_id,park_id,source_system,source_instance,
    period_month,evidence_sha256,books_sha256,book_set_sha256,roster_sha256,catalog_sha256,
    manifest_sha256,mapping_sha256,extractor_sha256,file_sha256,record_count,value_count,book_count)
    VALUES($1,$2,'yuzhou-v10',$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
    ON CONFLICT DO NOTHING`, values);
  const { rows } = await client.query(`SELECT id FROM hr_yuzhou_payroll_source_extraction
    WHERE tenant_id=$1 AND park_id=$2 AND source_instance=$3 AND period_month=$4::date AND evidence_sha256=$5
      AND books_sha256=$6 AND book_set_sha256=$7 AND roster_sha256=$8 AND catalog_sha256=$9
      AND manifest_sha256=$10 AND mapping_sha256=$11 AND extractor_sha256=$12 AND file_sha256=$13::jsonb
      AND record_count=$14 AND value_count=$15 AND book_count=$16`, values);
  if (rows.length !== 1) fail("REGISTRATION_CONFLICT");
  return rows[0].id;
}

export async function registerPreparedPayrollExtraction(config, connect) {
  const transport = config?.databaseTransport ?? "loopback";
  const hostAllowed = transport === "loopback" ? ["127.0.0.1", "::1"].includes(config?.database?.host)
    : transport === "docker_service" && typeof config?.database?.host === "string"
      && /^[a-z][a-z0-9-]{0,62}$/u.test(config.database.host);
  if (config?.allowExtractionRegistration !== true || !config.database || !config.targetScope || !hostAllowed
    || Object.keys(config.database).some(key => !["host", "port", "database", "user", "password", "ssl"].includes(key))
    || typeof config.database.user !== "string" || !config.database.user || typeof config.database.password !== "string"
    || config.database.ssl !== undefined && typeof config.database.ssl !== "boolean"
    || !Number.isInteger(config.database.port)
    || config.database.port < 1 || config.database.port > 65535 || !config.database.database
    || !Number.isInteger(config.expectedDatabaseOid) || config.expectedDatabaseOid <= 0) fail("TARGET_REQUIRED");
  const verified = await verifyPreparedPayrollExtraction(config);
  if (canonicalJson(verified.proof.targetScope) !== canonicalJson(config.targetScope)) fail("SCOPE_MISMATCH");
  const client = await connect(config.database);
  try {
    const { rows: [identity] } = await client.query("SELECT current_database() AS name,oid::int FROM pg_database WHERE datname=current_database()");
    if (identity?.name !== config.database.database || identity?.oid !== config.expectedDatabaseOid) fail("TARGET_MISMATCH");
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL statement_timeout='15s'");
      await client.query("SET LOCAL lock_timeout='2s'");
      const id = await persistVerifiedExtraction(client, verified.proof);
      await client.query("COMMIT");
      return { status: "REGISTERED_VERIFIED_EXTRACTION", id, ...verified.proof, packageSha256: verified.packageSha256,
        businessApproval: false, payrollCalculated: false, paymentExecuted: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  } finally { await client.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === "--describe-extractor") {
      process.stdout.write(`${JSON.stringify(payrollSourceExtractorIdentity())}\n`);
    } else {
      if (process.argv.length !== 4 || process.argv[2] !== "--config") fail("ARGUMENTS_INVALID");
      const path = resolve(process.argv[3]); privateFile(path);
      const config = JSON.parse(readFileSync(path, "utf8"));
      if (!isAbsolute(config.receiptPath ?? "") || (statSync(resolve(config.receiptPath, "..")).mode & 0o077)) fail("PRIVATE_OUTPUT_REQUIRED");
      const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
      const { Client } = require("pg");
      const result = await registerPreparedPayrollExtraction(config, async connection => { const client = new Client(connection); await client.connect(); return client; });
      if (existsSync(config.receiptPath)) chmodSync(config.receiptPath, 0o600);
      writeFileSync(config.receiptPath, `${JSON.stringify(result)}\n`, { mode: 0o600 }); chmodSync(config.receiptPath, 0o600);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error && /^(?:PAYROLL_SOURCE_EXTRACTION_|YUZHOU_PAYROLL_SOURCE_)[A-Z_]+$/u.test(error.message) ? error.message : "PAYROLL_SOURCE_EXTRACTION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
