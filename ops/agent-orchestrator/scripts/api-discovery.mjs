#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");
const defaultSystemMapPath = join(discoveryDir, "system-map.example.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/api-discovery.mjs [--system-map <file>] [--fixture] --dry-run|--apply");
}

function parseArgs(argv) {
  const args = {
    systemMap: defaultSystemMapPath,
    fixture: argv.includes("--fixture"),
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--system-map") {
      args.systemMap = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--fixture" || arg === "--dry-run" || arg === "--apply") {
      continue;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.dryRun === args.apply) throw new Error("Specify exactly one of --dry-run or --apply.");
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

function responseShapeFor(method) {
  return method === "GET" ? "list_or_detail" : "entity_or_action_result";
}

function riskFor(method, path) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return "MEDIUM";
  if (String(path).toLowerCase().includes("auth")) return "HIGH";
  return "LOW";
}

function buildApiInventory(systemMap) {
  const endpoints = (systemMap.api_candidates ?? []).map((candidate, index) => {
    const method = String(candidate.method ?? "GET").toUpperCase();
    return {
      endpoint_id: candidate.endpoint_id ?? `API_${index + 1}`,
      method,
      path: candidate.path,
      protocol: candidate.protocol ?? "REST",
      request: {
        query: method === "GET" ? ["review_required"] : [],
        body: method === "GET" ? null : ["review_required"]
      },
      response: {
        shape: responseShapeFor(method),
        fields: ["review_required"]
      },
      auth: candidate.auth ?? "review_required",
      graphql: candidate.protocol === "GraphQL",
      websocket: candidate.protocol === "WebSocket",
      source: candidate.source ?? "system_map_api_candidate",
      risk: candidate.risk ?? riskFor(method, candidate.path)
    };
  });

  return {
    version: 1,
    api_inventory_id: `API-INVENTORY-${systemMap.target_id}`,
    target_id: systemMap.target_id,
    system_map_id: systemMap.system_map_id,
    source: "fixture_system_map_api_candidates",
    generated_at: nowIso(),
    endpoints,
    graphql_operations: endpoints.filter((item) => item.graphql),
    websocket_channels: endpoints.filter((item) => item.websocket),
    supported_capture_types: ["REST", "XHR", "Fetch", "GraphQL"],
    risk_notes: [
      "MVP infers API inventory from fixture/manual manifest API candidates.",
      "No live traffic was captured and no endpoint was called.",
      "Request/response/auth contracts must be confirmed from user-provided API documentation or authorized exports."
    ]
  };
}

function outputPathFor(targetId) {
  return join(discoveryDir, `api_inventory.${targetId}.json`);
}

function printSummary(inventory, mode, outputPath) {
  console.log("# API Discovery");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`target_id: ${inventory.target_id}`);
  console.log(`api_inventory_id: ${inventory.api_inventory_id}`);
  console.log(`endpoints: ${inventory.endpoints.length}`);
  console.log(`graphql_operations: ${inventory.graphql_operations.length}`);
  console.log(`websocket_channels: ${inventory.websocket_channels.length}`);
  console.log(`output: ${outputPath}`);
  console.log("");
  console.log("endpoints:");
  for (const endpoint of inventory.endpoints) {
    console.log(`- ${endpoint.method} ${endpoint.path} | protocol=${endpoint.protocol} | auth=${endpoint.auth} | risk=${endpoint.risk}`);
  }
  console.log("");
  console.log("risk_notes:");
  for (const note of inventory.risk_notes) console.log(`- ${note}`);
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no api_inventory file was written and no network request was made.");
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const systemMap = await readJson(resolveRepoPath(args.systemMap));
const inventory = buildApiInventory(systemMap);
const outputPath = outputPathFor(inventory.target_id);
if (args.apply) {
  await writeJson(outputPath, inventory);
}
printSummary(inventory, args.apply ? "apply" : "dry-run", outputPath);
