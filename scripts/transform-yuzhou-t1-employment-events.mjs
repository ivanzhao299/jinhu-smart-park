#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const outputDir = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !basename(outputDir).startsWith("staging-")) throw new Error("controlled staging directory is required");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const copySafeJson = (value) => JSON.stringify(value).replaceAll("\\", "\\\\");
const readArray = (name) => {
  try {
    const value = JSON.parse(readFileSync(resolve(outputDir, name), "utf8"));
    if (!Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error(`${name.replace(".raw.json", "")} extraction is not valid JSON array`);
  }
};

const typeRows = readArray("employment-event-types.raw.json").sort((a, b) => String(a.legacyType).localeCompare(String(b.legacyType), "zh-CN"));
const stateRows = readArray("employment-event-states.raw.json").sort((a, b) => String(a.sourceValue ?? "").localeCompare(String(b.sourceValue ?? ""), "zh-CN"));
const eventRows = readArray("employment-events.raw.json").sort((a, b) => Number(a.legacyId) - Number(b.legacyId));
const seenIds = new Set();
const seenNos = new Set();
const events = eventRows.map((source) => {
  const sourceKey = String(source.legacyId ?? "").trim();
  const eventNo = String(source.legacyEventNo ?? "").trim();
  if (!sourceKey || seenIds.has(sourceKey)) throw new Error("employment events have blank or duplicate source id");
  if (!eventNo || seenNos.has(eventNo)) throw new Error("employment events have blank or duplicate event number");
  seenIds.add(sourceKey);
  seenNos.add(eventNo);
  const sourceTable = "dbo.readjust";
  return {
    sourceTable,
    sourceKey,
    sourceIdentitySha256: sha256(`${sourceTable}\u0000${sourceKey}`),
    sourceRowSha256: sha256(canonical(source)),
    source,
  };
});
const types = typeRows.map((source) => ({
  legacyType: String(source.legacyType ?? "").trim(),
  legacyCode: source.legacyCode == null ? null : String(source.legacyCode),
}));
const eventPath = resolve(outputDir, "employment-events.jsonl");
const typePath = resolve(outputDir, "employment-event-types.json");
const statePath = resolve(outputDir, "employment-event-states.json");
writeFileSync(eventPath, `${events.map(copySafeJson).join("\n")}\n`, { mode: 0o600 });
writeFileSync(typePath, `${JSON.stringify(types, null, 2)}\n`, { mode: 0o600 });
writeFileSync(statePath, `${JSON.stringify(stateRows, null, 2)}\n`, { mode: 0o600 });
const summary = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  domains: {
    employmentEvents: { rows: events.length, file: "employment-events.jsonl", fileSha256: sha256(readFileSync(eventPath)) },
    employmentEventTypes: { rows: types.length, file: "employment-event-types.json", fileSha256: sha256(readFileSync(typePath)) },
    employmentEventStates: { rows: stateRows.length, file: "employment-event-states.json", fileSha256: sha256(readFileSync(statePath)) },
  },
};
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
