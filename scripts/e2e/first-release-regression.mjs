import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptOrder = [
  "scripts/e2e/first-release-menu-whitelist.mjs",
  "scripts/e2e/first-release-auth-health.mjs",
  "scripts/e2e/first-release-idempotency.mjs",
  "scripts/e2e/first-release-files.mjs",
  "scripts/e2e/first-release-users-assets.mjs",
  "scripts/e2e/first-release-workorders.mjs",
  "scripts/e2e/first-release-leasing.mjs"
];

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function buildEnv() {
  const env = { ...process.env };
  if (!env.TEST_RUN_ID) {
    env.TEST_RUN_ID = `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
  }
  if (!env.IDEMPOTENCY_KEY_PREFIX) {
    env.IDEMPOTENCY_KEY_PREFIX = "first-release-regression";
  }
  return env;
}

function runScript(scriptPath, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env,
      stdio: "inherit"
    });

    child.on("error", (error) => {
      resolvePromise({
        ok: false,
        code: 1,
        scriptPath,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        resolvePromise({
          ok: false,
          code: 1,
          scriptPath,
          signal
        });
        return;
      }
      resolvePromise({
        ok: code === 0,
        code: code ?? 1,
        scriptPath
      });
    });
  });
}

async function run() {
  const env = buildEnv();
  info(`Script root: ${rootDir}`);
  info(`Test run: ${env.TEST_RUN_ID}`);
  info(`Idempotency prefix: ${env.IDEMPOTENCY_KEY_PREFIX}`);

  for (const scriptPath of scriptOrder) {
    info(`Running ${scriptPath}`);
    const result = await runScript(resolve(rootDir, scriptPath), env);
    if (!result.ok) {
      if (result.signal) {
        fail(`${scriptPath} exited with signal ${result.signal}`);
      } else if (result.error) {
        fail(`${scriptPath} failed to spawn: ${result.error}`);
      } else {
        fail(`${scriptPath} exited with code ${result.code}`);
      }
      process.exit(result.code || 1);
      return;
    }
    pass(scriptPath);
  }

  console.log("[PASS] First-release regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
