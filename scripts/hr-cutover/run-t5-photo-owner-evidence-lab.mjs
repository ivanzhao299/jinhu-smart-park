#!/usr/bin/env node
/* global process */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseT5FileOwnerEvidenceLabArgs, runT5FileOwnerEvidenceLab } from "./run-t5-file-owner-evidence-lab.mjs";

export function parseT5PhotoOwnerEvidenceLabArgs(argv) {
  const translated = (argv[0] === "--" ? argv.slice(1) : argv).map(value => value === "--photo-owner-stage" ? "--stage" : value);
  const args = parseT5FileOwnerEvidenceLabArgs(translated, "photo");
  return { configPath: args.configPath, photoOwnerStage: args.stage, durationMinutes: args.durationMinutes, pollSeconds: args.pollSeconds };
}

export function runT5PhotoOwnerEvidenceLab({ configPath, photoOwnerStage, durationMinutes, pollSeconds }, dependencies) {
  return runT5FileOwnerEvidenceLab({ kind: "photo", configPath, stage: photoOwnerStage, durationMinutes, pollSeconds }, dependencies);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runT5PhotoOwnerEvidenceLab(parseT5PhotoOwnerEvidenceLabArgs(process.argv.slice(2))).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.code ?? "T5_FILE_CONTINUOUS_FAILED"}\n`); process.exitCode = 1; });
}
