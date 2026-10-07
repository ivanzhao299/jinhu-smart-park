#!/usr/bin/env node
/* global structuredClone */
import process from "node:process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { YUZHOU_REUSABLE_INCREMENTAL_COVERAGE, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "./build-yuzhou-reusable-incremental-package.mjs";
import { YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES } from "./yuzhou-incremental-package-limits.mjs";
import { YUZHOU_PROFILE_ALIAS_BATCH_CODE_SHA256 } from "./build-yuzhou-profile-alias-batch.mjs";
import { YUZHOU_ORIGINAL_PROFILE_ALIAS_INPUT_CODE_SHA256 } from "./prepare-yuzhou-original-profile-alias-input.mjs";

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
      originalProfileAliases: "node scripts/hr-cutover/build-yuzhou-profile-alias-batch.mjs --input <private-alias-input.json> --output <new-private-directory>",
      originalProfileSource: "node scripts/hr-cutover/prepare-yuzhou-original-profile-alias-input.mjs --config <private-metadata-config.json> --output <new-private-directory>",
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
    originalProfileSourcePreparation: {
      codeSha256: YUZHOU_ORIGINAL_PROFILE_ALIAS_INPUT_CODE_SHA256,
      productionWorkflow: ".github/workflows/prepare-original-profile-input.yml",
      runtimeInputs: { expected_runtime_commit: "deployed source commit matching .release.json", expected_api_commit: "verified API image commit; defaults to deployed source commit", expected_web_commit: "verified Web image commit; defaults to deployed source commit" },
      trigger: "main-only manual dispatch, protected production environment and deployment mutex",
      source: "existing sealed T5 source in verified production API runtime; read-only repeatable-read snapshot",
      outputs: "private verified input, versioned before-images and existing ordered batch; metadata only on stdout",
      productionImport: "HOLD", authorizationGranted: false, writerPresent: false,
    },
    originalProfileAliasPreparation: {
      codeSha256: YUZHOU_PROFILE_ALIAS_BATCH_CODE_SHA256,
      ordering: "complete every baseline package before any alias package; all requested first aliases of a profile share one item",
      evidence: "raw/planner identity, row digest and owner match; original target and version authenticated again by API",
      authorizationGranted: false,
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
