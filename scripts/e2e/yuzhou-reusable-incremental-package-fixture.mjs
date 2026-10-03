#!/usr/bin/env node
/* global process */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "../hr-cutover/build-yuzhou-reusable-incremental-package.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value, all[index + 1]]] : pairs, []));
if (!args["--root"] || !args["--contract-type-id"] || Object.keys(args).length !== 2) throw new Error("fixture arguments invalid");
const root = resolve(args["--root"]), inputPath = `${root}/input.json`, output = `${root}/output`, typeId = args["--contract-type-id"];
mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700);
const typeIdentity = sha("dbo.compacttypecode\0LABOR");
const binding = { sourceTable: "dbo.compacttypecode", sourceKey: "LABOR", sourceIdentitySha256: typeIdentity, sourcePkCanonical: `sha256:${typeIdentity}`, sourceTypeCode: "LABOR", sourceTypeName: "劳动合同", targetTable: "hr_contract_type", targetContractTypeId: typeId, mappingStatus: "verified", mappingEvidenceSha256: sha("synthetic current-scope legacy-map receipt") };
const artifact = { formatVersion: 1, sourceSystem: "yuzhou-v10", targetScope: { tenantId: "10000001", parkId: "20000001" }, bindings: [binding] }; artifact.artifactSha256 = sha(canonical(artifact));
const source = { contractNo: "HT-2026-001", typeName: "劳动合同", employeeCode: "E-001", startDate: "2024-01-01", endDate: "2025-12-31", probationEndDate: "2024-03-31", contractMonths: "24", totalContractMonths: "24", probationMonths: "3", probationSalary: "9000.00", baseSalary: "12000.00", legacyState: "草稿", continuetimes: "0", continueyears: "0", signedDate: "2023-12-20", nonCompeteFlag: "否", confidentialityFlag: "否", trainingServiceFlag: "否", legacyFilePresent: 0, legacyFileLocatorSha256: null, legacyTextPresent: 0, legacyTextSha256: null, legacyTextBytes: null };
const row = { sourceTable: "dbo.compact", sourceKey: "HT-2026-001", sourceIdentitySha256: sha("dbo.compact\0HT-2026-001"), sourceRowSha256: sha(JSON.stringify(source, Object.keys(source).sort())), source };
const input = { recipeVersion: "yuzhou-reusable-incremental-contract-v1", recipeSha256: YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256, sourceSystem: "yuzhou-v10", extractedAt: "2026-10-03T08:00:00Z", employeeIndex: [{ employeeCode: "E-001", sourceTable: "dbo.person", sourceKey: "E-001" }], contractTypeMappingArtifact: artifact, contractStateResolutions: { "草稿": { normalizedStatus: "draft", mappingEvidence: "synthetic reviewed state receipt" } }, records: [row] };
writeFileSync(inputPath, `${JSON.stringify(input)}\n`, { mode: 0o600 }); chmodSync(inputPath, 0o600);
execFileSync(process.execPath, ["scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs", "--input", inputPath, "--output", output], { stdio: "inherit" });
process.stdout.write(`${JSON.stringify({ inputPath, packagePath: `${output}/package.json`, manifestPath: `${output}/manifest.json` })}\n`);
