#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sourceDir = process.env.YUZHOU_SOURCE_DIR;
const compose = readFileSync(join(root, "infra/docker/docker-compose.yuzhou-migration.yml"), "utf8");
const runtimeCheck = readFileSync(join(root, "scripts/check-hr-migration-runtime.sh"), "utf8");

assert.match(compose, /platform: linux\/amd64/);
assert.match(compose, /^name: jinhu_yuzhou_migration_lab/m);
assert.match(compose, /restart: "no"/);
assert.match(compose, /127\.0\.0\.1:\$\{YUZHOU_SQLSERVER_PORT:-14333\}:1433/);
assert.match(compose, /YUZHOU_SQLSERVER_SA_PASSWORD:\?Set/);
assert.doesNotMatch(compose, /MSSQL_SA_PASSWORD:\s+[^$]/);
assert.match(runtimeCheck, /POSTGRES_PORT="\$\{POSTGRES_PORT:-15432\}"/);
assert.match(runtimeCheck, /YUZHOU_SQLSERVER_PORT:-14333/);

if (sourceDir) {
  const outputDir = mkdtempSync(join(tmpdir(), "yuzhou-manifest-contract-"));
  const outputFile = join(outputDir, "manifest.json");
  execFileSync("node", [join(root, "scripts/build-yuzhou-source-manifest.mjs"), sourceDir, outputFile]);
  const manifest = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.equal(manifest.sourceSystem, "Yuzhou Group V10");
  assert.equal(manifest.summary.files, 220);
  assert.equal(manifest.summary.textFiles, 218);
  assert.equal(manifest.summary.textLines, 17_570);
  assert.equal(manifest.summary.countsByKind["sql-source"], 194);
  assert.equal(manifest.summary.countsByKind["function-source"], 16);
  assert.equal(manifest.summary.countsByKind["trigger-source"], 2);
  assert.equal(manifest.summary.duplicateGroups.length, 1);
  assert.ok(manifest.files.every((entry) => !entry.path.startsWith("/")));
}

console.log("Yuzhou migration lab contract passed.");
