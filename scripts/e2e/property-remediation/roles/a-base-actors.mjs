import { createRequire } from "node:module";
import { resolve } from "node:path";
import { decodeContractFile } from "../lib/contracts.mjs";

const require = createRequire(import.meta.url);
const shared = require(resolve("packages/shared/dist/index.js"));

const oracle = decodeContractFile(
  "scripts/e2e/property-remediation/roles/a-base-actor-oracle.json",
  "actor-oracle.schema.json"
);
const bundles = Object.values(shared.PROPERTY_PERMISSION_BUNDLES);
const bundleByCode = new Map(bundles.map((bundle) => [bundle.code, bundle]));
const pageCodes = new Set(shared.PROPERTY_BUSINESS_PAGE_PERMISSION_CODES);
const surfaceByPage = new Map(
  shared.PROPERTY_BUSINESS_SURFACES.map((surface) => [
    surface.pageCode,
    surface
  ])
);
const legacy = new Set(shared.PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS);
const known = new Set(Object.values(shared.PROPERTY_BUSINESS_PERMISSIONS));

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertExact(label, actual, expected) {
  const normalizedActual = sortedUnique(actual);
  const normalizedExpected = sortedUnique(expected);
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    const expectedSet = new Set(normalizedExpected);
    const actualSet = new Set(normalizedActual);
    const missing = normalizedExpected.filter((value) => !actualSet.has(value));
    const unexpected = normalizedActual.filter((value) => !expectedSet.has(value));
    throw new Error(
      `${label} drift: missing=[${missing.join(",")}], unexpected=[${unexpected.join(",")}]`
    );
  }
}

export function buildExactActors(frozenOracle = oracle) {
  const actors = frozenOracle.actors.map((frozen) => {
    const selectedBundles = frozen.bundle_codes.map((code) => {
      const bundle = bundleByCode.get(code);
      if (!bundle) throw new Error(`${frozen.id}: unknown shared bundle ${code}`);
      return bundle;
    });
    const runtimeBundlePermissions = sortedUnique(
      selectedBundles.flatMap((bundle) => bundle.permissions)
    );
    if (frozen.kind === "ordinary") {
      assertExact(
        `${frozen.id} shared bundle permissions`,
        runtimeBundlePermissions,
        frozen.expected.permissions
      );
    }
    for (const permission of frozen.expected.permissions) {
      if (
        permission === "*" ||
        permission.includes("*") ||
        legacy.has(permission) ||
        !known.has(permission)
      ) {
        throw new Error(`${frozen.id}: forbidden or unknown permission ${permission}`);
      }
    }
    const surfaces = frozen.expected.permissions
      .filter((permission) => pageCodes.has(permission))
      .map((permission) => {
        const surface = surfaceByPage.get(permission);
        if (!surface) {
          throw new Error(`${frozen.id}: page permission has no canonical surface`);
        }
        return surface;
      });
    const expectedRoutes = surfaces.map((surface) => surface.route);
    assertExact(
      `${frozen.id} frozen menu routes`,
      expectedRoutes,
      frozen.expected.menu_routes
    );
    if (frozen.kind !== "exception_super") {
      assertExact(
        `${frozen.id} frozen modules`,
        ["asset", ...surfaces.map((surface) => surface.moduleCode)],
        frozen.expected.modules
      );
    }
    if (
      frozen.kind === "support" &&
      frozen.expected.permissions.some((permission) =>
        /:(create|update|manage|approve|sign|activate|checkout|cancel|confirm|reschedule|execute|register|waive|generate|transfer)$/.test(
          permission
        )
      )
    ) {
      throw new Error(`${frozen.id}: support oracle contains a write capability`);
    }
    if (frozen.kind === "exception_super") {
      if (
        frozen.identity.is_super !== true ||
        JSON.stringify(frozen.identity.raw_permissions) !== '["*"]' ||
        frozen.bundle_codes.length !== 0 ||
        Object.values(frozen.expected).some((values) => values.length !== 0)
      ) {
        throw new Error(`${frozen.id}: exception super is not fully isolated`);
      }
    } else if (
      frozen.identity.is_super !== false ||
      frozen.identity.raw_permissions.length !== 0
    ) {
      throw new Error(`${frozen.id}: positive actors cannot be super or wildcard`);
    }
    return Object.freeze({
      id: frozen.id,
      kind: frozen.kind,
      identity: Object.freeze({
        is_super: frozen.identity.is_super,
        raw_permissions: Object.freeze([...frozen.identity.raw_permissions])
      }),
      bundle_codes: Object.freeze([...frozen.bundle_codes]),
      expected: Object.freeze({
        modules: Object.freeze([...frozen.expected.modules]),
        permissions: Object.freeze([...frozen.expected.permissions]),
        menu_routes: Object.freeze([...frozen.expected.menu_routes]),
        data_scopes: Object.freeze([...frozen.expected.data_scopes])
      })
    });
  });
  if (actors.filter((actor) => actor.kind === "support").length !== 1) {
    throw new Error("exactly one explicit support actor is required");
  }
  if (actors.filter((actor) => actor.kind === "exception_super").length !== 1) {
    throw new Error("exactly one isolated exception super actor is required");
  }
  return Object.freeze(actors);
}

export const A_BASE_EXACT_ACTORS = buildExactActors();
