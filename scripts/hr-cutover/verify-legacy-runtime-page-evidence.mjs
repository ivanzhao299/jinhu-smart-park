#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { verifyLegacyRuntimePageEvidence } from "./legacy-runtime-page-evidence-lib.mjs";

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--manifest" || !isAbsolute(argv[1])) {
    const error = new Error("--manifest must be one absolute path");
    error.code = "LEGACY_RUNTIME_PAGE_EVIDENCE_CLI_ARGUMENT_INVALID";
    throw error;
  }
  const manifest = JSON.parse(readFileSync(argv[1], "utf8"));
  const report = verifyLegacyRuntimePageEvidence(manifest);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.code ?? "LEGACY_RUNTIME_PAGE_EVIDENCE_FAILED"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
