#!/usr/bin/env node
/* global structuredClone */
import process from "node:process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { YUZHOU_REUSABLE_INCREMENTAL_COVERAGE, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "./build-yuzhou-reusable-incremental-package.mjs";
import { YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES } from "./yuzhou-incremental-package-limits.mjs";

/** Metadata only: never reads an extract, credentials, or database. */
export function describeYuzhouImportInterface() {
  return {
    formatVersion: 1,
    artifactKind: "yuzhou_reusable_import_interface",
    evidenceScope: "offline adapter capabilities; not production deployment or batch acceptance",
    recipeVersion: "yuzhou-reusable-incremental-v2",
    recipeSha256: YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,
    sourceSystem: "yuzhou-v10",
    entries: {
      controlledStaging: "node scripts/hr-cutover/build-yuzhou-import-from-staging.mjs --config <private-config.json>",
      verifiedExtract: "node scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs --input <private-extract.json> --output <new-private-directory>",
      workbench: "/hr/imports",
    },
    api: {
      prefix: "configured API_PREFIX; default /api/v1",
      preview: { method: "POST", path: "/hr/imports/yuzhou/incremental/preview" },
      commit: { method: "POST", path: "/hr/imports/yuzhou/incremental/:id/commit" },
      status: { method: "GET", path: "/hr/imports/yuzhou/incremental/:id" },
      scope: "existing authenticated tenant/park and per-domain permissions",
    },
    limits: { maxItems: YUZHOU_INCREMENTAL_MAX_ITEMS, maxPackageBytes: YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, encoding: "compact UTF-8 JSON plus newline, including witnesses and envelope" },
    batchPolicy: {
      ordering: "process builder packagePaths in returned order; do not sort or submit only the first package",
      atomicity: "one transaction per package; no cross-package atomicity claim",
      recovery: "query the operation ID after uncertain submission before retrying",
      validation: "same-format batches reuse frozen rules; validate integrity, identity, dependencies, scope and modern-field conflicts every batch",
      updates: "unchanged facts do not duplicate; modern edits are preserved; employment transitions and effective contract changes use normal workflows",
      sourceAbsence: "never implies target deletion",
    },
    inputBoundary: "verified structured extracts or controlled staging; arbitrary SQL Server .bak upload is not supported",
    productionWrites: false,
    coverage: structuredClone(YUZHOU_REUSABLE_INCREMENTAL_COVERAGE),
  };
}

export const serializeYuzhouImportInterface = () => `${JSON.stringify(describeYuzhouImportInterface(), null, 2)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), expected = serializeYuzhouImportInterface();
    if (!args.length) process.stdout.write(expected);
    else if (args.length === 2 && args[0] === "--check") {
      if (readFileSync(args[1], "utf8") !== expected) throw new Error("drift");
      process.stdout.write("YUZHOU_IMPORT_INTERFACE_CURRENT\n");
    } else throw new Error("arguments");
  } catch {
    process.stderr.write("YUZHOU_IMPORT_INTERFACE_CHECK_FAILED\n");
    process.exitCode = 1;
  }
}
