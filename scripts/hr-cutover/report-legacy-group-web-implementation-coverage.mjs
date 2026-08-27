import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessLegacyGroupWebImplementationCoverage } from "./legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
const result = assessLegacyGroupWebImplementationCoverage(mapping, root);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ summary: result.summary, gates: result.gates }, null, 2)}\n`);
}
