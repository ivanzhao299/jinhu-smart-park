import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { runV7 } from "./track-b2c-000197-v11-v6-direct-pg-regression-v7.mjs";
import { failureInjectionCasesV11 } from "./track-b2c-000197-failure-cases-v11.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const hex = /^[0-9a-f]{64}$/u;
const files = Object.freeze({ registry: resolve(research, "b2c-000197-v11-v6-direct-pg-regression-v9-resource-identity-registry-20260803.json") });
export const V9_ENV_KEYS = Object.freeze(["B2C_000197_V11_V6_DIRECT_PG_V9_EXECUTE", "B2C_000197_V11_V6_DIRECT_PG_V9_RUN_ID", "B2C_000197_V11_V6_DIRECT_PG_V9_RESOURCE_SHA"]);
function exact(path, hash) { if (!hex.test(hash) || !existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path || (statSync(path).mode & 0o777) !== 0o444 || sha256(readFileSync(path)) !== hash) throw new Error("b2c-v9-intake-drift"); return readFileSync(path, "utf8"); }
export function assertFreshV9(registry, target) { const all = [registry.known_run_ids, registry.known_containers, registry.known_databases, registry.known_volumes]; if (registry.schema_version !== "b2c-v9-resource-registry-v1" || !all.every(Array.isArray) || registry.known_run_ids.includes(target.runId) || registry.known_containers.includes(target.container) || registry.known_databases.includes(target.database) || registry.known_volumes.includes(target.volume)) throw new Error("b2c-v9-prohibited-resource-reuse"); return true; }
export function faultSummaryV9(entry, before, after, result) { const output = `${result.stdout ?? ""}${result.stderr ?? ""}`; const marks = output.match(/v11-injected-[a-z-]+/gu) ?? []; const states = [...output.matchAll(/^ERROR:\s+([0-9A-Z]{5}):/gmu)].map((m) => m[1]); if (result.status === 0 || states.length !== 1 || states[0] !== "P0001" || marks.length !== 1 || marks[0] !== entry.marker || JSON.stringify(before) !== JSON.stringify(after)) throw new Error("b2c-v9-fault-summary-drift"); return Object.freeze({ boundary: entry.boundary, sqlstate: "P0001", marker: entry.marker, snapshotExact: true, before, after }); }
function sealedIntake(env) { if (env.B2C_000197_V11_V6_DIRECT_PG_V9_EXECUTE !== "1") throw new Error("b2c-v9-not-authorized"); const registrySha = env.B2C_000197_V11_V6_DIRECT_PG_V9_RESOURCE_SHA ?? ""; const registry = JSON.parse(exact(files.registry, registrySha)); return { registry }; }
// Only this wrapper owns the default safe executor; callers cannot supply a raw target.
export function executeV9({ env = process.env, runCommand = spawnSync } = {}) { const intake = sealedIntake(env); void intake; void runCommand; throw new Error("b2c-v9-awaiting-three-reviews-and-resource-authority"); }
export function directPgRegressionCandidateV9() { return Object.freeze({ status: "sealed-static-awaiting-reviews", execution_authorized: false, default_executor: "spawnSync", v7_trust_boundary: "v7 is an immutable non-production test artifact and cannot be selected by v9 without source-code modification", fault_cases: failureInjectionCasesV11().map(({ boundary }) => boundary), docker_or_database_command_executed: false }); }
