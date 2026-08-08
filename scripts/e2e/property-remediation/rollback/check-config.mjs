import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertFinalSha, canonicalSha256, loadProfile, repoRoot, validateDurableTableSources } from "./lib.mjs";
import { buildCommandSpecs, commandSpecSha256, materializeCommand, probeCommandRuntime } from "./command-spec.mjs";
import { validateSourceBinding } from "./source-validator.mjs";
import { probeDependencyWorktree } from "./dependency-control.mjs";
import { assertBaselineSemanticAnchors, assertSemanticContractsReady } from "./semantic-contract.mjs";

export async function checkConfig({ finalSha, requireClean = true } = {}) {
  assertFinalSha(finalSha);
  const { profile, profileSha256 } = loadProfile();
  assertSemanticContractsReady(profile);
  assertBaselineSemanticAnchors(profile, { root: repoRoot, treeSha: finalSha });
  const durableTables = validateDurableTableSources(profile);
  for (const rehearsalCase of profile.cases) buildCommandSpecs(profile, rehearsalCase);
  const commandProbe = await probeCommandRuntime();
  const dependencyProbe = await probeDependencyWorktree({ finalSha });
  for (const rehearsalCase of profile.cases) for (const spec of buildCommandSpecs(profile, rehearsalCase)) materializeCommand(spec, repoRoot);
  const source = await validateSourceBinding({ finalSha, profile, requireClean });
  return {
    schemaVersion: "property-track-c-rollback-config-check-v1",
    status: "PASS",
    mode: "SELF_CLEANING_DRY_PROBE",
    mutatingCommandsExecuted: true,
    residualWorktrees: 0,
    finalSha,
    profileSha256,
    backendClosures: profile.cases.filter(({ kind }) => kind === "backend-closure").length,
    frontendGroups: profile.cases.filter(({ kind }) => kind === "frontend-group").length,
    sourceBindingSha: source.finalSha,
    durableTables: durableTables.length,
    commandRuntimeProbes: commandProbe.probes,
    isolatedWorktreeProbes: dependencyProbe.probes,
    pnpmCliSha256: dependencyProbe.pnpmCliSha256,
    commandSpecSha256: canonicalSha256(Object.fromEntries(profile.cases.map((entry) => [entry.id, commandSpecSha256(profile, entry)]))),
    rtoTargetMilliseconds: profile.rtoTargetMilliseconds,
    rpoTargetCommittedRows: profile.rpoTargetCommittedRows
  };
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--final-sha") {
    throw new Error("usage: check-config.mjs --final-sha <full-commit-sha>");
  }
  return argv[1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await checkConfig({ finalSha: parseArgs(process.argv.slice(2)) }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
