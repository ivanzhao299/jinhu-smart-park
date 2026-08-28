/* global process */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessLegacyGroupWebImplementationCoverage } from "./legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
const arg = name => {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  return resolve(value);
};
const evidenceAPath = arg("--uat-evidence-a");
const evidenceBPath = arg("--uat-evidence-b");
const triplePath = arg("--expected-triple");
if ([evidenceAPath, evidenceBPath, triplePath].filter(Boolean).length !== 0 && [evidenceAPath, evidenceBPath, triplePath].some(value => !value)) {
  throw new Error("--uat-evidence-a, --uat-evidence-b and --expected-triple must be supplied together");
}
const options = evidenceAPath ? {
  liveRoleUatEvidencePair: {
    A: JSON.parse(readFileSync(evidenceAPath, "utf8")),
    B: JSON.parse(readFileSync(evidenceBPath, "utf8"))
  },
  expectedTriple: JSON.parse(readFileSync(triplePath, "utf8"))
} : {};
if (options.expectedTriple) {
  const currentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (options.expectedTriple.codeSha !== currentSha) throw new Error("UAT evidence code SHA does not match the current checkout");
}
const result = assessLegacyGroupWebImplementationCoverage(mapping, root, options);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ summary: result.summary, gates: result.gates }, null, 2)}\n`);
}
