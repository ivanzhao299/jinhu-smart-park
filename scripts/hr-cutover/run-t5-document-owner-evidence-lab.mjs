#!/usr/bin/env node
/* global process */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseT5FileOwnerEvidenceLabArgs, runT5FileOwnerEvidenceLab } from "./run-t5-file-owner-evidence-lab.mjs";

export function parseT5DocumentOwnerEvidenceLabArgs(argv) {
  const translated = (argv[0] === "--" ? argv.slice(1) : argv).map(value => value === "--document-owner-stage" ? "--stage" : value);
  const args = parseT5FileOwnerEvidenceLabArgs(translated, "document");
  return { configPath: args.configPath, documentOwnerStage: args.stage, durationMinutes: args.durationMinutes, pollSeconds: args.pollSeconds };
}

export function runT5DocumentOwnerEvidenceLab({ configPath, documentOwnerStage, durationMinutes, pollSeconds }, dependencies) {
  return runT5FileOwnerEvidenceLab({ kind: "document", configPath, stage: documentOwnerStage, durationMinutes, pollSeconds }, dependencies);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runT5DocumentOwnerEvidenceLab(parseT5DocumentOwnerEvidenceLabArgs(process.argv.slice(2))).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.code ?? "T5_FILE_CONTINUOUS_FAILED"}\n`); process.exitCode = 1; });
}
