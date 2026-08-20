#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const outputDir = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !basename(outputDir).startsWith("staging-")) throw new Error("controlled staging directory is required");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const domains = [
  { name: "departments", table: "dbo.departmentcode", key: "legacyCode" },
  { name: "positions", table: "dbo.job", key: "legacyCode" },
  { name: "employees", table: "dbo.person", key: "employeeCode" },
];
const summary = { formatVersion: 1, generatedAt: new Date().toISOString(), domains: {} };

for (const domain of domains) {
  const rawPath = resolve(outputDir, `${domain.name}.raw.json`);
  let rows;
  try {
    rows = JSON.parse(readFileSync(rawPath, "utf8"));
  } catch {
    throw new Error(`${domain.name} extraction is not valid JSON`);
  }
  if (!Array.isArray(rows)) throw new Error(`${domain.name} extraction must be an array`);
  rows.sort((a, b) => String(a[domain.key]).localeCompare(String(b[domain.key]), "en"));
  const seen = new Set();
  const transformed = rows.map((source) => {
    const sourceKey = String(source[domain.key] ?? "").trim();
    if (!sourceKey || seen.has(sourceKey)) throw new Error(`${domain.name} has blank or duplicate source key`);
    seen.add(sourceKey);
    return {
      sourceTable: domain.table,
      sourceKey,
      sourceIdentitySha256: sha256(`${domain.table}\u0000${sourceKey}`),
      sourceRowSha256: sha256(canonical(source)),
      source,
    };
  });
  writeFileSync(resolve(outputDir, `${domain.name}.jsonl`), `${transformed.map((row) => JSON.stringify(row)).join("\n")}\n`, { mode: 0o600 });
  summary.domains[domain.name] = {
    rows: transformed.length,
    file: `${domain.name}.jsonl`,
    fileSha256: sha256(readFileSync(resolve(outputDir, `${domain.name}.jsonl`))),
  };
}
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
