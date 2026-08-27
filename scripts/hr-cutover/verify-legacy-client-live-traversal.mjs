#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyLegacyClientLiveTraversal } from "./legacy-client-live-traversal-lib.mjs";

const manifestPath = resolve(process.argv[2] ?? "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json");
try {
  const report = verifyLegacyClientLiveTraversal(JSON.parse(readFileSync(manifestPath, "utf8")));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
