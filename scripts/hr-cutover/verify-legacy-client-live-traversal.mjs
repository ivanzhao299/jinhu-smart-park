#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { verifyLegacyClientLiveTraversal } from "./legacy-client-live-traversal-lib.mjs";

const manifestPath = resolve(process.argv[2] ?? "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json");
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const atomicInventoryPath = resolve(process.argv[3] ?? manifest.atomicInventoryContract?.path ?? "");
  const atomicInventory = JSON.parse(readFileSync(atomicInventoryPath, "utf8"));
  const report = verifyLegacyClientLiveTraversal(manifest, atomicInventory);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  const message = error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code.startsWith("TRAVERSAL_")
    ? error.message
    : "TRAVERSAL_INPUT_READ_FAILED: manifest or atomic inventory could not be read as JSON";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
