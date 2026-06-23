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
  console.error("Usage: node ops/agent-orchestrator/scripts/browser-discovery.mjs [--system-map <file>] [--fixture] --dry-run|--apply");
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

  if (args.dryRun === args.apply) {
    throw new Error("Specify exactly one of --dry-run or --apply.");
  }
  if (!args.systemMap.trim()) {
    throw new Error("Missing --system-map file.");
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

function buttonCandidates(systemMap) {
  const buttons = [];
  for (const form of systemMap.forms ?? []) {
    buttons.push({
      button_id: `BTN_${form.form_id}_SUBMIT`,
      page_id: form.page_id,
      label: "提交",
      action: "submit",
      source: "form_default"
    });
  }
  for (const link of systemMap.links ?? []) {
    buttons.push({
      button_id: `BTN_LINK_${buttons.length + 1}`,
      page_id: link.from,
      label: link.label ?? "打开",
      action: "navigate",
      target: link.to,
      source: "link_hint"
    });
  }
  return buttons;
}

function buildBrowserInventory(systemMap) {
  const pages = (systemMap.pages ?? []).map((page) => ({
    page_id: page.page_id,
    title: page.title,
    path: page.path,
    page_type: page.page_type ?? "unknown",
    primary_table_hint: page.primary_table_hint ?? null,
    menu_id: (systemMap.menus ?? []).find((menu) => menu.path === page.path)?.menu_id ?? null,
    iframes: page.iframes ?? [],
    screenshot_ref: (systemMap.screenshots ?? []).find((shot) => shot.page_id === page.page_id)?.file ?? null
  }));

  const uiInventory = {
    forms: (systemMap.forms ?? []).map((form) => ({
      form_id: form.form_id,
      page_id: form.page_id,
      title: form.title,
      fields: form.fields ?? []
    })),
    buttons: buttonCandidates(systemMap),
    links: systemMap.links ?? [],
    iframes: pages.flatMap((page) => (page.iframes ?? []).map((iframe) => ({
      page_id: page.page_id,
      ...iframe
    }))),
    screenshot_metadata: (systemMap.screenshots ?? []).map((shot) => ({
      ...shot,
      capture_status: "fixture_metadata_only"
    }))
  };

  return {
    version: 1,
    runtime_mode: "fixture",
    browser_inventory_id: `BROWSER-RUNTIME-${systemMap.target_id}`,
    target_id: systemMap.target_id,
    system_map_id: systemMap.system_map_id,
    generated_at: nowIso(),
    page_inventory: pages,
    menu_inventory: (systemMap.menus ?? []).map((menu) => ({
      menu_id: menu.menu_id,
      label: menu.label,
      path: menu.path,
      roles: menu.roles ?? [],
      children: menu.children ?? []
    })),
    ui_inventory: uiInventory,
    adapter_readiness: {
      playwright_adapter: "reserved_not_enabled_in_mvp",
      chrome_headless_adapter: "reserved_not_enabled_in_mvp",
      browser_agent_adapter: "reserved_not_enabled_in_mvp"
    },
    safety: {
      network_access: false,
      authorization_required: true,
      destructive_actions_allowed: false,
      notes: [
        "MVP uses only fixture/manual manifest input.",
        "No external website, OA, ERP, admin portal, or browser session was accessed."
      ]
    }
  };
}

function outputPaths(targetId) {
  return {
    page: join(discoveryDir, `page_inventory.${targetId}.json`),
    menu: join(discoveryDir, `menu_inventory.${targetId}.json`),
    ui: join(discoveryDir, `ui_inventory.${targetId}.json`)
  };
}

function printSummary(inventory, mode, paths) {
  console.log("# Browser Runtime Discovery");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`runtime_mode: ${inventory.runtime_mode}`);
  console.log(`target_id: ${inventory.target_id}`);
  console.log(`system_map_id: ${inventory.system_map_id}`);
  console.log(`pages: ${inventory.page_inventory.length}`);
  console.log(`menus: ${inventory.menu_inventory.length}`);
  console.log(`forms: ${inventory.ui_inventory.forms.length}`);
  console.log(`buttons: ${inventory.ui_inventory.buttons.length}`);
  console.log(`links: ${inventory.ui_inventory.links.length}`);
  console.log(`iframes: ${inventory.ui_inventory.iframes.length}`);
  console.log(`screenshots: ${inventory.ui_inventory.screenshot_metadata.length}`);
  console.log(`page_inventory_output: ${paths.page}`);
  console.log(`menu_inventory_output: ${paths.menu}`);
  console.log(`ui_inventory_output: ${paths.ui}`);
  console.log("");
  console.log("adapters:");
  for (const [adapter, status] of Object.entries(inventory.adapter_readiness)) {
    console.log(`- ${adapter}: ${status}`);
  }
  console.log("");
  console.log("safety:");
  console.log(`- network_access: ${inventory.safety.network_access ? "yes" : "no"}`);
  console.log(`- destructive_actions_allowed: ${inventory.safety.destructive_actions_allowed ? "yes" : "no"}`);
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no page/menu/ui inventory files were written.");
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
const inventory = buildBrowserInventory(systemMap);
const paths = outputPaths(inventory.target_id);
if (args.apply) {
  await writeJson(paths.page, {
    version: inventory.version,
    target_id: inventory.target_id,
    generated_at: inventory.generated_at,
    pages: inventory.page_inventory
  });
  await writeJson(paths.menu, {
    version: inventory.version,
    target_id: inventory.target_id,
    generated_at: inventory.generated_at,
    menus: inventory.menu_inventory
  });
  await writeJson(paths.ui, {
    version: inventory.version,
    target_id: inventory.target_id,
    generated_at: inventory.generated_at,
    ui: inventory.ui_inventory
  });
}
printSummary(inventory, args.apply ? "apply" : "dry-run", paths);
