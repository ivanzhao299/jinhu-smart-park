import { resolve, sep } from "node:path";
import {
  RUN_ID_PATTERN,
  assertNoDatabaseUrlOverrides,
  validateRunId
} from "../bootstrap/ephemeral-postgres.mjs";

export const A_BASE_FIXTURE_LABEL = "pr192-track-a-base";
export const A_BASE_DATABASE_NAME = "pr192_track_a_base_fixture";
export const FORBIDDEN_ENVIRONMENT_PATTERN =
  /(^|[^a-z])(prod(uction)?|staging|stage|shared|uat)([^a-z]|$)/i;

export function assertAStubEnvironment({
  runId,
  artifactDir,
  env = process.env,
  rootDir = process.cwd()
}) {
  validateRunId(runId);
  assertNoDatabaseUrlOverrides(env);
  for (const [key, value] of Object.entries(env)) {
    if (
      /^(NODE_ENV|APP_ENV|ENVIRONMENT|DEPLOY_ENV|DATABASE_NAME)$/i.test(key) &&
      FORBIDDEN_ENVIRONMENT_PATTERN.test(value ?? "")
    ) {
      throw new Error(`A-base refuses non-test environment marker ${key}`);
    }
  }
  const runsRoot = resolve(rootDir, "artifacts/property-remediation/runs");
  const exactRunRoot = resolve(runsRoot, runId);
  const resolvedArtifact = resolve(artifactDir);
  if (
    resolvedArtifact !== exactRunRoot &&
    !resolvedArtifact.startsWith(`${exactRunRoot}${sep}`)
  ) {
    throw new Error("A-base artifacts must stay under the exact ignored run directory");
  }
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("invalid A-base run id");
  }
  return { runsRoot, exactRunRoot };
}

export function assertDedicatedScope({ profile, tenantId, parkIds }) {
  if (profile.scope_marker !== "PR192_A_BASE_TEST_ONLY_V1") {
    throw new Error("profile is missing the reviewed dedicated test marker");
  }
  if (
    !/^[a-f0-9-]{36}$/i.test(tenantId) ||
    parkIds.length !== 3 ||
    new Set(parkIds).size !== 3 ||
    parkIds.some((parkId) => !/^[a-f0-9-]{36}$/i.test(parkId))
  ) {
    throw new Error("A-base scope identifiers are not deterministic UUID scopes");
  }
  if (parkIds.includes(tenantId)) {
    throw new Error("tenant and park fixture scopes must be distinct");
  }
}

export function exactCleanupPredicates({ tenantId, parkIds, idsByTable }) {
  if (!idsByTable || Object.keys(idsByTable).length === 0) {
    throw new Error("cleanup requires exact deterministic primary keys");
  }
  return Object.entries(idsByTable)
    .reverse()
    .map(([table, ids]) => {
      if (!/^[a-z][a-z0-9_]+$/.test(table)) {
        throw new Error(`unsafe cleanup table ${table}`);
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error(`cleanup table ${table} has no exact keys`);
      }
      return {
        table,
        tenantId,
        parkIds: [...parkIds],
        ids: [...ids]
      };
    });
}
