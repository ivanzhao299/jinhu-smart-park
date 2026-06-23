#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRuntimeMemory, MEMORY_FILES, runtimeDir } from "./runtime-memory-build.mjs";

const JSON_SECTIONS = [
  ["platform", MEMORY_FILES.platform],
  ["architecture", MEMORY_FILES.architecture],
  ["agent", MEMORY_FILES.agent],
  ["skill", MEMORY_FILES.skill],
  ["goal", MEMORY_FILES.goal],
  ["evolution", MEMORY_FILES.evolution],
  ["discovery", MEMORY_FILES.discovery],
  ["roadmap", MEMORY_FILES.roadmap],
  ["decision", MEMORY_FILES.decision]
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function fail(message, failures) {
  failures.push(message);
}

async function validate() {
  const failures = [];
  const warnings = [];
  const current = await buildRuntimeMemory();

  for (const [section, fileName] of JSON_SECTIONS) {
    const path = join(runtimeDir, fileName);
    if (!existsSync(path)) {
      fail(`missing memory file: ${fileName}`, failures);
      continue;
    }
    let saved;
    try {
      saved = await readJson(path);
    } catch (error) {
      fail(`invalid JSON in ${fileName}: ${error.message}`, failures);
      continue;
    }

    const expected = current[section];
    if (saved.memory_kind !== expected.memory_kind) {
      fail(`${fileName} memory_kind mismatch: saved=${saved.memory_kind} expected=${expected.memory_kind}`, failures);
    }
    if (saved.source_fingerprint?.aggregate_sha256 !== expected.source_fingerprint?.aggregate_sha256) {
      fail(`${fileName} source fingerprint mismatch`, failures);
    }
  }

  const handoffPath = join(runtimeDir, MEMORY_FILES.handoff);
  if (!existsSync(handoffPath)) {
    fail(`missing memory file: ${MEMORY_FILES.handoff}`, failures);
  } else {
    const text = await readFile(handoffPath, "utf8");
    for (const required of ["# Runtime Memory Handoff Summary", "## Current State", "## Agent Roles", "## Standard Commands"]) {
      if (!text.includes(required)) {
        fail(`${MEMORY_FILES.handoff} missing section: ${required}`, failures);
      }
    }
  }

  return { failures, warnings, current };
}

const result = await validate();
console.log("# Runtime Memory Validate");
console.log("");
console.log(`runtime_dir: ${runtimeDir}`);
console.log(`status: ${result.failures.length === 0 ? "PASS" : "FAIL"}`);
console.log(`checked_json_sections: ${JSON_SECTIONS.length}`);
console.log(`warnings: ${result.warnings.length}`);
if (result.warnings.length > 0) {
  console.log("");
  console.log("warnings:");
  for (const warning of result.warnings) console.log(`- ${warning}`);
}
if (result.failures.length > 0) {
  console.log("");
  console.log("failures:");
  for (const failure of result.failures) console.log(`- ${failure}`);
  process.exit(1);
}
console.log("");
console.log("Runtime Memory files are present and source fingerprints match current source files.");
