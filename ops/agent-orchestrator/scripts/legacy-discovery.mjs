#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/legacy-discovery.mjs --target <target.json> --dry-run|--apply");
}

function parseArgs(argv) {
  const args = {
    target: "",
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--dry-run" || arg === "--apply") {
      continue;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.target.trim()) {
    usage();
    throw new Error("Missing --target file.");
  }
  if (args.dryRun === args.apply) {
    throw new Error("Specify exactly one of --dry-run or --apply.");
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function nowIso() {
  return new Date().toISOString();
}

function assertTargetSafety(target) {
  const required = [
    "target_id",
    "target_name",
    "target_type",
    "base_url",
    "auth_mode",
    "allowed_scope",
    "forbidden_scope",
    "crawl_depth",
    "rate_limit",
    "legal_authorization_required",
    "source_mode"
  ];
  for (const key of required) {
    if (target[key] === undefined || target[key] === null || target[key] === "") {
      throw new Error(`Discovery target is missing required field: ${key}`);
    }
  }
  if (target.legal_authorization_required !== true) {
    throw new Error("Discovery target must set legal_authorization_required=true.");
  }
  if (target.authorization_status === "BLOCKED") {
    throw new Error("Discovery target authorization_status=BLOCKED.");
  }
  if (!["static_fixture", "exported_html", "exported_json", "manual_page_manifest"].includes(target.source_mode)) {
    throw new Error(`Unsupported source_mode: ${target.source_mode}`);
  }
}

async function readFixtureSystemMap(target) {
  for (const ref of target.fixture_refs ?? []) {
    const path = resolveRepoPath(ref);
    if (existsSync(path) && path.endsWith(".json")) {
      const value = await readJson(path);
      if (value.system_map_id || value.pages || value.forms || value.tables) {
        return value;
      }
    }
  }
  return null;
}

function blankSystemMap(target) {
  return {
    version: 1,
    system_map_id: `SYSTEM-MAP-${target.target_id}`,
    target_id: target.target_id,
    target_name: target.target_name,
    target_type: target.target_type,
    generated_at: nowIso(),
    source_mode: target.source_mode,
    authorization_status: target.authorization_status ?? "PENDING_AUTHORIZATION",
    menus: [],
    pages: [],
    forms: [],
    tables: [],
    links: [],
    api_candidates: [],
    screenshots: [],
    attachments: [],
    risk_notes: [
      "No fixture system map was provided; generated an empty discovery shell.",
      "MVP does not access live networks or crawl external systems."
    ]
  };
}

async function buildSystemMap(target) {
  assertTargetSafety(target);
  const fixture = await readFixtureSystemMap(target);
  const base = fixture ?? blankSystemMap(target);
  const riskNotes = [
    ...(base.risk_notes ?? []),
    "Legacy Discovery MVP is fixture/export/manifest only; no live external access was performed.",
    "High-concurrency crawling, destructive actions, and unauthorized targets are forbidden."
  ];

  return {
    ...base,
    version: 1,
    system_map_id: `SYSTEM-MAP-${target.target_id}`,
    target_id: target.target_id,
    target_name: target.target_name,
    target_type: target.target_type,
    generated_at: nowIso(),
    source_mode: target.source_mode,
    authorization_status: target.authorization_status ?? "PENDING_AUTHORIZATION",
    screenshots: target.capture_screenshots ? (base.screenshots ?? []) : [],
    risk_notes: [...new Set(riskNotes)]
  };
}

function outputPathFor(targetId) {
  return join(discoveryDir, `system-map.${targetId}.json`);
}

function printSummary(target, systemMap, mode, outputPath) {
  console.log("# Legacy Discovery");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`target_id: ${target.target_id}`);
  console.log(`target_name: ${target.target_name}`);
  console.log(`target_type: ${target.target_type}`);
  console.log(`source_mode: ${target.source_mode}`);
  console.log(`authorization_status: ${systemMap.authorization_status}`);
  console.log(`system_map_id: ${systemMap.system_map_id}`);
  console.log(`menus: ${(systemMap.menus ?? []).length}`);
  console.log(`pages: ${(systemMap.pages ?? []).length}`);
  console.log(`forms: ${(systemMap.forms ?? []).length}`);
  console.log(`tables: ${(systemMap.tables ?? []).length}`);
  console.log(`links: ${(systemMap.links ?? []).length}`);
  console.log(`api_candidates: ${(systemMap.api_candidates ?? []).length}`);
  console.log(`screenshots: ${(systemMap.screenshots ?? []).length}`);
  console.log(`attachments: ${(systemMap.attachments ?? []).length}`);
  console.log(`output: ${outputPath}`);
  console.log("");
  console.log("risk_notes:");
  for (const note of systemMap.risk_notes ?? []) {
    console.log(`- ${note}`);
  }
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no system map file was written and no network access was performed.");
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const targetPath = resolveRepoPath(args.target);
const target = await readJson(targetPath);
const systemMap = await buildSystemMap(target);
const outputPath = outputPathFor(target.target_id);
if (args.apply) {
  await writeJson(outputPath, systemMap);
}
printSummary(target, systemMap, args.apply ? "apply" : "dry-run", outputPath);
