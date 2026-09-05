import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const modeArgs = process.argv.slice(2);
assert.ok(modeArgs.length === 0 || (modeArgs.length === 1
  && ["--park-binding", "--identity-transition"].includes(modeArgs[0])), "BUSINESS_SCOPE_UNKNOWN_TEST_MODE");
const parkBinding = modeArgs[0] === "--park-binding";
const identityTransition = modeArgs[0] === "--identity-transition";
const runId = randomBytes(6).toString("hex");
const container = `jinhu-hr-scope-${identityTransition ? "identity" : parkBinding ? "park" : "core"}-${runId}`;
const password = `synthetic-${randomBytes(18).toString("hex")}`;
let containerStarted = false;

const toolEnv = {
  PATH: process.env.PATH ?? "",
  ...(typeof process.env.HOME === "string" ? { HOME: process.env.HOME } : {}),
  ...(typeof process.env.DOCKER_CONTEXT === "string" ? { DOCKER_CONTEXT: process.env.DOCKER_CONTEXT } : {})
};

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: options.env ?? toolEnv
  });
}

function requireSuccess(result, marker) {
  if (result.status !== 0) {
    throw new Error(`${marker}: exit=${String(result.status)}`);
  }
  return result.stdout.trim();
}

function availableKiB() {
  const result = run("df", ["-Pk", "/private/tmp"]);
  const lines = requireSuccess(result, "BUSINESS_SCOPE_CAPACITY_CHECK_FAILED").split(/\r?\n/u);
  const fields = lines.at(-1)?.trim().split(/\s+/u) ?? [];
  const value = Number(fields[3]);
  assert.ok(Number.isSafeInteger(value) && value > 0, "BUSINESS_SCOPE_CAPACITY_CHECK_INVALID");
  return value;
}

async function main() {
  assert.ok(availableKiB() >= 100 * 1024 * 1024, "BUSINESS_SCOPE_HOST_CAPACITY_GUARD");
  requireSuccess(run("docker", ["info"]), "BUSINESS_SCOPE_DOCKER_UNAVAILABLE");
  const dockerFreeKiB = Number(requireSuccess(
    run("docker", [
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--entrypoint",
      "sh",
      "postgres:16-alpine",
      "-c",
      "df -Pk / | awk 'NR == 2 { print $4; exit }'"
    ]),
    "BUSINESS_SCOPE_DOCKER_CAPACITY_CHECK_FAILED"
  ));
  assert.ok(Number.isSafeInteger(dockerFreeKiB), "BUSINESS_SCOPE_DOCKER_CAPACITY_CHECK_INVALID");
  assert.ok(dockerFreeKiB >= 15 * 1024 * 1024, "BUSINESS_SCOPE_DOCKER_CAPACITY_GUARD");
  requireSuccess(
    run("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "--tmpfs",
      "/var/lib/postgresql/data:rw,size=512m",
      "-p",
      "127.0.0.1::5432",
      "-e",
      "POSTGRES_USER=postgres",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      "POSTGRES_DB=postgres",
      "postgres:16-alpine"
    ]),
    "BUSINESS_SCOPE_POSTGRES_START_FAILED"
  );
  containerStarted = true;

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = run("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"]);
    if (result.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "BUSINESS_SCOPE_POSTGRES_NOT_READY");

  const portOutput = requireSuccess(
    run("docker", ["port", container, "5432/tcp"]),
    "BUSINESS_SCOPE_POSTGRES_PORT_FAILED"
  );
  const portMatch = portOutput.match(/^127\.0\.0\.1:(\d+)$/mu);
  assert.ok(portMatch, "BUSINESS_SCOPE_POSTGRES_NOT_LOOPBACK_BOUND");
  const databaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${portMatch[1]}/postgres`;

  const result = run(
    "pnpm",
    [
      "--filter",
      "@jinhu/api",
      "exec",
      "node",
      "--test",
      "--test-force-exit",
      "--require",
      "ts-node/register",
      identityTransition
        ? "src/modules/users/smart-park-identity-transition.pg.spec.ts"
        : parkBinding
        ? "src/modules/parks/smart-park-business-scope.pg.spec.ts"
        : "src/shared/business-scope/business-scope-core.pg.spec.ts"
    ],
    {
      stdio: "inherit",
      env: {
        ...toolEnv,
        BUSINESS_SCOPE_TEST_DATABASE_URL: databaseUrl
      }
    }
  );
  assert.equal(result.status, 0, "BUSINESS_SCOPE_POSTGRES_CONTRACT_FAILED");
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  if (containerStarted) {
    const cleanup = run("docker", ["rm", "-f", "-v", container]);
    if (cleanup.status !== 0) {
      const cleanupFailure = new Error("BUSINESS_SCOPE_POSTGRES_CLEANUP_FAILED");
      failure = failure
        ? new AggregateError(
          [failure, cleanupFailure],
          "BUSINESS_SCOPE_POSTGRES_CONTRACT_AND_CLEANUP_FAILED"
        )
        : cleanupFailure;
    }
  }
}
if (failure) throw failure;
process.stdout.write(identityTransition ? "SMART_PARK_IDENTITY_TRANSITION_POSTGRES_PASS\n"
  : parkBinding ? "SMART_PARK_SCOPE_POSTGRES_PASS\n" : "BUSINESS_SCOPE_CORE_POSTGRES_PASS\n");
