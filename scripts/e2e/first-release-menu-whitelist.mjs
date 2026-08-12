import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const menuPath = resolve(rootDir, "apps/web/lib/menu.ts");
const propertyRoutesPath = resolve(rootDir, "packages/shared/src/property-business/track-b-routes.ts");

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
  const propertyRoutes = readFileSync(propertyRoutesPath, "utf8");
  const whitelistBlock = extractWhitelistBlock(source);

  if (!assert(source.includes("FIRST_RELEASE_MENU_PATHS"), "legacy FIRST_RELEASE_MENU_PATHS remains available for compatibility checks")) return;
  if (!assert(source.includes("FIRST_RELEASE_MENU_PATH_SET"), "legacy FIRST_RELEASE_MENU_PATH_SET remains available for compatibility checks")) return;
  if (!assert(!source.includes("return filterFirstReleaseMenus(mergedMenus)"), "runtime dashboard menu no longer uses the first-release whitelist gate")) return;
  if (!assert(source.includes("export function filterFirstReleaseMenus"), "legacy menu filter helper remains isolated and explicit")) return;

  const requiredPaths = [
    "/dashboard",
    "/system/users",
    "/assets/parks",
    "/assets/unit-status-board",
    "/assets/statistics",
    "/leasing/contracts",
    "/leasing/receivables",
    "/leasing/payments",
    "/workorders",
    "/workorders/list",
    "/operations/terminal",
    "/safety/dashboard",
    "/safety/inspect-points",
    "/safety/inspect-templates",
    "/safety/inspect-plans",
    "/safety/inspect-tasks",
    "/safety/my-inspect-tasks",
    "/safety/hazards",
    "/safety/hazards/overdue"
  ];
  for (const path of requiredPaths) {
    if (!assert(whitelistBlock.includes(path), `whitelist includes ${path}`)) return;
  }
  if (!assert(whitelistBlock.includes("...PROPERTY_BUSINESS_SURFACES.map((surface) => surface.route)"), "whitelist retains canonical homestay and housing surfaces")) return;

  for (const path of [
    "/assets/property-operations",
    "/assets/property-occupancies",
    "/assets/property-mode-transitions"
  ]) {
    if (!assert(propertyRoutes.includes(`route: "${path}"`), `shared property surface declares ${path}`)) return;
  }
  if (!assert(whitelistBlock.includes("...assetPropertyControlMenus.map((surface) => surface.href!)"), "whitelist retains the shared asset property control surfaces")) return;

  const expandedPaths = [
    "/iot/dashboard",
    "/energy/dashboard",
    "/robots/overview",
    "/robots/cleaning",
    "/admin/video-security/dashboard",
    "/safety/emergency-contacts",
    "/safety/emergency-plans",
    "/safety/emergencies",
    "/safety/work-permits",
    "/leasing/leads",
    "/leasing/lead-pool",
    "/leasing/funnel",
    "/leasing/refunds",
    "/leasing/invoices"
  ];
  for (const path of expandedPaths) {
    if (!assert(source.includes(path), `expanded menu definition includes ${path}`)) return;
  }

  if (!assert(source.includes("/leasing/leads"), "menu file contains leasing lead menu definitions")) return;
  if (!assert(source.includes("/iot/dashboard"), "menu file contains IoT menu definitions")) return;

  console.log("[PASS] first release menu whitelist regression completed");
}

run();
