import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const menuPath = resolve(rootDir, "apps/web/lib/menu.ts");

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
    return false;
  }
  pass(message);
  return true;
}

function extractWhitelistBlock(source) {
  const match = source.match(/export const FIRST_RELEASE_MENU_PATHS = \[(.*?)\] as const;/s);
  return match?.[1] ?? "";
}

function run() {
  info(`Reading menu definition from ${menuPath}`);
  const source = readFileSync(menuPath, "utf8");
  const whitelistBlock = extractWhitelistBlock(source);

  if (!assert(source.includes("FIRST_RELEASE_MENU_PATHS"), "FIRST_RELEASE_MENU_PATHS exists")) return;
  if (!assert(source.includes("FIRST_RELEASE_MENU_PATH_SET"), "FIRST_RELEASE_MENU_PATH_SET exists")) return;
  if (!assert(source.includes("filterFirstReleaseMenus(mergedMenus)"), "menu filtering still uses whitelist gate")) return;
  if (!assert(source.includes("FIRST_RELEASE_MENU_PATH_SET.has(menu.href)"), "menu filter references whitelist set")) return;

  const requiredPaths = [
    "/dashboard",
    "/system/users",
    "/assets/parks",
    "/leasing/contracts",
    "/leasing/receivables",
    "/leasing/payments",
    "/workorders",
    "/workorders/list",
    "/safety/dashboard",
    "/safety/inspect-points",
    "/safety/inspect-templates",
    "/safety/inspect-plans",
    "/safety/inspect-tasks",
    "/safety/hazards",
    "/safety/hazards/overdue"
  ];
  for (const path of requiredPaths) {
    if (!assert(whitelistBlock.includes(path), `whitelist includes ${path}`)) return;
  }

  const forbiddenPaths = [
    "/iot/dashboard",
    "/energy/dashboard",
    "/robots/overview",
    "/admin/video-security/dashboard",
    "/safety/emergency-dashboard",
    "/safety/emergency-contacts",
    "/safety/emergency-plans",
    "/safety/emergencies",
    "/safety/work-permits",
    "/safety/my-inspect-tasks",
    "/leasing/leads",
    "/leasing/lead-pool",
    "/leasing/funnel",
    "/leasing/refunds",
    "/leasing/invoices"
  ];
  for (const path of forbiddenPaths) {
    if (!assert(!whitelistBlock.includes(path), `whitelist excludes ${path}`)) return;
  }

  if (!assert(source.includes("/leasing/leads"), "menu file still contains non-first-release menu definitions")) return;
  if (!assert(source.includes("/iot/dashboard"), "menu file still contains hidden modules for filtering")) return;

  console.log("[PASS] first release menu whitelist regression completed");
}

run();
