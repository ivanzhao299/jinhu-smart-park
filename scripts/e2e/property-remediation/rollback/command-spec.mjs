import { accessSync, constants, lstatSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { canonicalSha256, isPathInside, repoRoot } from "./lib.mjs";
import { execFileBounded, TIMEOUTS } from "./timeout.mjs";

const TOKENS = Object.freeze({
  NODE: "$NODE",
  TSC: "$TSC",
  NEXT: "$NEXT",
  TS_REGISTER: "$TS_NODE_REGISTER",
  WORKTREE: "$WORKTREE",
  HARNESS: "$ROLLBACK_HARNESS"
});
export const COMMAND_IDS = Object.freeze([
  "shared-build", "api-build", "web-typecheck", "web-clean-production-build", "contract", "canonical-port",
  "targeted-regression", "postgresql-regression", "flags-artifact-runtime-proof", "rollback-service-smoke"
]);
export const TS_NODE_CJS_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "Node" });

export function typescriptTestEnvironment(worktree, typescriptTestProject) {
  const projectPath = typeof worktree === "string" ? resolve(worktree, typescriptTestProject) : "";
  if (!projectPath || !isPathInside(worktree, projectPath)) throw new Error("TypeScript test project escapes its worktree");
  const projectInfo = lstatSync(projectPath);
  if (!projectInfo.isFile() || projectInfo.isSymbolicLink()) throw new Error("TypeScript test project must be a regular in-worktree file");
  return { TS_NODE_PROJECT: projectPath, TS_NODE_COMPILER_OPTIONS: TS_NODE_CJS_COMPILER_OPTIONS };
}

function checkedFile(path) {
  const absolute = resolve(repoRoot, path);
  if (!isPathInside(repoRoot, absolute) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()) throw new Error(`command spec references an unsafe or missing file: ${path}`);
  return path;
}

function runtimePaths(worktree = repoRoot) {
  const values = {
    [TOKENS.NODE]: realpathSync(process.execPath),
    [TOKENS.TSC]: realpathSync(resolve(worktree, "node_modules/typescript/bin/tsc")),
    [TOKENS.NEXT]: realpathSync(resolve(worktree, "apps/web/node_modules/next/dist/bin/next")),
    [TOKENS.TS_REGISTER]: realpathSync(resolve(worktree, "apps/api/node_modules/ts-node/register/index.js"))
  };
  for (const [token, path] of Object.entries(values)) {
    const info = lstatSync(path);
    if (!info.isFile()) throw new Error(`runner executable resolver is not a file: ${token}`);
    if (token !== TOKENS.TS_REGISTER) accessSync(path, constants.X_OK);
  }
  return values;
}

function wt(path) { return `${TOKENS.WORKTREE}/${checkedFile(path)}`; }

export function buildCommandSpecs(profile, rehearsalCase) {
  const nodeTestArgs = profile.commandSpec.nodeTestArgs.map((arg) => arg === "ts-node/register" ? TOKENS.TS_REGISTER : arg);
  const apiTestProject = "apps/api/tsconfig.json";
  const webTestProject = "apps/web/tsconfig.json";
  const targetedTestProject = rehearsalCase.kind === "frontend-group" ? webTestProject : apiTestProject;
  const specs = [
    { id: "shared-build", executable: TOKENS.NODE, args: [TOKENS.TSC, "-p", `${TOKENS.WORKTREE}/packages/shared/tsconfig.json`], needsDatabaseCredential: false, nodeEnvironment: "production", cleanPath: "packages/shared/dist" },
    { id: "api-build", executable: TOKENS.NODE, args: [TOKENS.TSC, "-p", `${TOKENS.WORKTREE}/apps/api/tsconfig.build.json`], needsDatabaseCredential: false, nodeEnvironment: "production", cleanPath: "apps/api/dist" },
    { id: "web-typecheck", executable: TOKENS.NODE, args: [TOKENS.TSC, "--noEmit", "-p", `${TOKENS.WORKTREE}/apps/web/tsconfig.json`], needsDatabaseCredential: false },
    { id: "web-clean-production-build", executable: TOKENS.NODE, args: [TOKENS.NEXT, "build", `${TOKENS.WORKTREE}/apps/web`], needsDatabaseCredential: false, cleanPath: "apps/web/.next", nodeEnvironment: "production" },
    { id: "contract", executable: TOKENS.NODE, args: [wt(profile.commandSpec.contractFile)], needsDatabaseCredential: false },
    { id: "canonical-port", executable: TOKENS.NODE, args: [...nodeTestArgs, wt(profile.commandSpec.canonicalPortFile)], needsDatabaseCredential: false, typescriptTestProject: apiTestProject },
    { id: "targeted-regression", executable: TOKENS.NODE, args: [...nodeTestArgs, ...rehearsalCase.targetedTestFiles.map(wt)], needsDatabaseCredential: false, typescriptTestProject: targetedTestProject },
    { id: "postgresql-regression", executable: TOKENS.NODE, args: [...nodeTestArgs, ...profile.commandSpec.postgresqlFiles.map(wt)], needsDatabaseCredential: true, typescriptTestProject: apiTestProject },
    { id: "flags-artifact-runtime-proof", executable: TOKENS.NODE, args: [`${TOKENS.HARNESS}/flags-proof.mjs`, "--worktree", TOKENS.WORKTREE, "--expected", "false"], needsDatabaseCredential: false },
    { id: "rollback-service-smoke", executable: TOKENS.NODE, args: [`${TOKENS.HARNESS}/service-smoke.mjs`, "--worktree", TOKENS.WORKTREE, "--stage", "rollback"], needsDatabaseCredential: true }
  ];
  if (JSON.stringify(specs.map(({ id }) => id)) !== JSON.stringify(COMMAND_IDS)) throw new Error("runner-owned command matrix drift");
  return specs;
}

export function commandSpecSha256(profile, rehearsalCase) { return canonicalSha256(buildCommandSpecs(profile, rehearsalCase)); }

export function materializeCommand(spec, worktree) {
  const paths = runtimePaths(worktree);
  const harness = resolve(repoRoot, "scripts/e2e/property-remediation/rollback");
  const substitute = (value) => value.replaceAll(TOKENS.WORKTREE, worktree).replaceAll(TOKENS.TS_REGISTER, paths[TOKENS.TS_REGISTER]).replaceAll(TOKENS.HARNESS, harness);
  const executable = paths[spec.executable];
  if (!executable) throw new Error("unsupported runner-owned executable token");
  return [executable, ...spec.args.map(substitute)];
}

export async function probeCommandRuntime({ signal } = {}) {
  const paths = runtimePaths();
  const probes = [
    [paths[TOKENS.NODE], ["--version"]],
    [paths[TOKENS.NODE], [paths[TOKENS.TSC], "--version"]],
    [paths[TOKENS.NODE], [paths[TOKENS.NEXT], "--help"]],
    [paths[TOKENS.NODE], ["--require", paths[TOKENS.TS_REGISTER], "--eval", "process.stdout.write('ts-loader-ok')"]]
  ];
  for (const [executable, args] of probes) await execFileBounded(executable, args, { env: { PATH: [dirname(paths[TOKENS.NODE]), "/usr/bin", "/bin"].join(":"), LANG: "C.UTF-8", TZ: "UTC" } }, { timeout: TIMEOUTS.probe, label: `command probe ${executable}`, signal });
  return { status: "PASS", probes: probes.length };
}

export function safeChildEnvironment({ databaseUrl, needsDatabaseCredential, credential, authority, flags = "false", nodeEnvironment = "test", typescriptTestProject, worktree }) {
  const nodeDir = dirname(runtimePaths()[TOKENS.NODE]);
  const env = { PATH: `${nodeDir}:/usr/bin:/bin`, LANG: "C.UTF-8", TZ: "UTC", NODE_ENV: nodeEnvironment, PROPERTY_OFFLINE_DRAFTS_V1: flags, PROPERTY_UPLOAD_QUEUE_V1: flags, NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: flags, NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: flags };
  if (typescriptTestProject) Object.assign(env, typescriptTestEnvironment(worktree, typescriptTestProject));
  if (authority) {
    env.ROLLBACK_API_PORT = String(authority.apiPort); env.ROLLBACK_WEB_PORT = String(authority.webPort); env.ROLLBACK_RUNTIME_MANIFEST = authority.runtimeManifest;
    env.NEXT_PUBLIC_API_TARGET = `http://127.0.0.1:${authority.apiPort}`;
    env.NEXT_PUBLIC_API_PREFIX = "/api/v1";
    env.ROLLBACK_LEASE_NONCE = authority.runtimeNonce;
    env.ROLLBACK_LEASE_RUN_ID = authority.labels["jinhu.rollback.run_id"];
    env.ROLLBACK_LEASE_FINAL_SHA = authority.labels["jinhu.rollback.final_sha"];
    env.ROLLBACK_LEASE_CASE_ID = authority.labels["jinhu.rollback.case_id"];
    env.ROLLBACK_LEASE_EXPECTED_EXECUTABLE = realpathSync(process.execPath);
  }
  if (needsDatabaseCredential) {
    if (typeof databaseUrl !== "string" || !/^postgres(?:ql)?:\/\//u.test(databaseUrl)) throw new Error("PostgreSQL target credential is missing");
    env.DATABASE_URL = databaseUrl;
    env.PROPERTY_IDENTITY_PG_URL = databaseUrl;
    env.PROPERTY_FOUNDATION_PG_URL = databaseUrl;
    Object.assign(env, credential.postgres, {
      JWT_SECRET: credential.jwtSecret, PARTY_DATA_ENCRYPTION_KEY: credential.partyDataEncryptionKey,
      ROLLBACK_ADMIN_USERNAME: credential.adminUsername, ROLLBACK_ADMIN_PASSWORD: credential.adminPassword,
      ROLLBACK_TENANT_ID: credential.tenantId, ROLLBACK_PARK_ID: credential.parkId
    });
  }
  return env;
}
