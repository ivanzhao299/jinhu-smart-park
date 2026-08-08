import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const runner = readFileSync(resolve(here,
  "track-b-appmodule-composition-gate.mjs"), "utf8");
const pgSpec = readFileSync(resolve(root,
  "apps/api/src/app.module.composition.pg.spec.ts"), "utf8");
const appModule = readFileSync(resolve(root, "apps/api/src/app.module.ts"), "utf8");
const postgresHelper = readFileSync(resolve(here,
  "bootstrap/ephemeral-postgres.mjs"), "utf8");

function recursiveRegularTypeScriptFiles(directory) {
  const directoryMetadata = lstatSync(directory);
  assert.equal(directoryMetadata.isSymbolicLink(), false, directory);
  assert.equal(directoryMetadata.isDirectory(), true, directory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    const metadata = lstatSync(path);
    assert.equal(metadata.isSymbolicLink(), false, path);
    if (metadata.isDirectory()) return recursiveRegularTypeScriptFiles(path);
    assert.equal(metadata.isFile(), true, path);
    return path.endsWith(".ts") ? [path] : [];
  }).sort();
}

test("AppModule runner owns an exact isolated PostgreSQL lifecycle", () => {
  for (const marker of [
    "OFFICIAL_POSTGRES_IMAGE",
    "buildEphemeralPostgresRunArgs",
    "assertExactEphemeralPostgresContainer",
    "resolveCreatedContainerId",
    "cleanupExactLifecycle",
    "pr192-b-appmodule-composition-gate",
    "anonymous_volume_absent",
    "container_absent"
  ]) assert.match(runner, new RegExp(marker.replaceAll(".", "\\."), "u"));
  assert.match(postgresHelper, /com\.jinhu\.fixture\.run-id/u);
  assert.match(runner, /stableProbes >= 2/u);
  assert.match(runner, /POSTGRES_HOST: "127\.0\.0\.1"/u);
  assert.match(runner, /removeContainer: \(id\) => docker\(\["rm", "-f", "-v", id\]\)/u);
  assert.match(runner, /removeVolume: \(name\) => docker\(\["volume", "rm", name\]\)/u);
});

test("AppModule runner fails closed on TAP, cleanup, failure, and signals", () => {
  assert.match(runner, /summary\.tests !== expected/u);
  assert.match(runner, /summary\.fail !== 0 \|\| summary\.skipped !== 0/u);
  assert.match(runner, /not ok/u);
  assert.match(runner, /SKIP\|TODO/u);
  assert.match(runner, /for \(const signal of \["SIGINT", "SIGTERM", "SIGHUP"\]\)/u);
  assert.match(runner, /testChild\?\.kill\("SIGTERM"\)/u);
  assert.match(runner, /const cleaned = safeCleanup\(\)/u);
  assert.match(runner, /cleaned\.status !== "passed"/u);
  assert.match(runner, /status: "failed",\n\s+candidate_admissible: false/u);
  assert.match(runner, /let originalFailureStage = null/u);
  assert.match(runner, /originalFailureStage = currentStage/u);
  assert.match(runner, /failed_stage: originalFailureStage \?\? currentStage/u);
  const originalFailureIndex = runner.indexOf("originalFailureStage = currentStage");
  const cleanupStageIndex = runner.indexOf('currentStage = "cleanup"', originalFailureIndex);
  assert.ok(originalFailureIndex > 0 && cleanupStageIndex > originalFailureIndex,
    "the original failure stage must be captured before finally changes currentStage");
});

test("AppModule runner fences every unsafe callback before its first execution", () => {
  assert.match(runner, /const childTimeoutMs = 20_000/u);
  assert.match(runner, /childTimeoutMs < 30_000/u);
  assert.match(runner, /iot_realtime_earliest_callback_ms: 30_000/u);
  assert.match(runner, /iot_rule_status_earliest_callback_ms: 60_000/u);
  assert.match(runner, /testChild\?\.kill\("SIGKILL"\)/u);
  for (const [key, value] of [
    ["IDEMPOTENCY_CLEANUP_ENABLED", "false"],
    ["SAFETY_INSPECT_SCHEDULER_ENABLED", "false"],
    ["VIDEO_ALERT_SCHEDULER_ENABLED", "false"],
    ["MQTT_BROKER_URL", ""]
  ]) {
    assert.match(runner, new RegExp(`${key}: ${JSON.stringify(value)}`, "u"));
  }
  assert.match(runner, /duration_ms:/u);
});

test("AppModule PostgreSQL spec exposes four exact composition assertions", () => {
  const titles = [...pgSpec.matchAll(/\n {2}it\("([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(titles, [
    "composes PropertyTaskModule through the full AppModule",
    "registers the exact eight property task routes",
    "resolves one shared approval receipt port singleton",
    "preserves the application guards followed by the nest-cls noop guard"
  ]);
  assert.match(pgSpec, /NestFactory\.create<NestExpressApplication>\(AppModule/u);
  assert.match(pgSpec, /app\.setGlobalPrefix\("api\/v1"\)/u);
  assert.match(pgSpec, /await app\.init\(\)/u);
  assert.match(pgSpec, /await app\?\.close\(\)/u);
});

test("AppModule PostgreSQL spec freezes the exact task routes", () => {
  const routes = [...pgSpec.matchAll(/ {2}"((?:GET|POST) \/api\/v1\/property\/tasks[^"]*)"/gu)]
    .map((match) => match[1]);
  assert.deepEqual(routes, [
    "GET /api/v1/property/tasks",
    "GET /api/v1/property/tasks/:taskId",
    "POST /api/v1/property/tasks/:taskId/block",
    "POST /api/v1/property/tasks/:taskId/claim",
    "POST /api/v1/property/tasks/:taskId/release",
    "POST /api/v1/property/tasks/:taskId/start",
    "POST /api/v1/property/tasks/:taskId/unblock",
    "POST /api/v1/property/tasks/internal/rebuild"
  ]);
  assert.match(pgSpec, /assert\.deepEqual\(routes, expectedTaskRoutes\)/u);
});

test("AppModule PostgreSQL spec proves one receipt provider and six exact guards", () => {
  assert.match(pgSpec, /assert\.strictEqual\(port, adapter\)/u);
  assert.match(pgSpec, /approvalModules\.length, 1/u);
  assert.match(pgSpec, /providers\.has\(PROPERTY_MUTATION_RECEIPT_PORT\)\)\.length, 1/u);
  assert.match(pgSpec, /config\.getGlobalGuards\(\)/u);
  for (const guard of [
    "JwtAuthGuard",
    "PermissionGuard",
    "ModuleGuard",
    "IdempotencyKeyGuard",
    "PropertyHighRiskActionGuard"
  ]) assert.match(pgSpec, new RegExp(`"${guard}"`, "u"));
  assert.match(pgSpec, /guards\.length, expectedApplicationGuards\.length \+ 1/u);
  assert.match(pgSpec, /clsNoopGuard\.constructor\.name, "Object"/u);
  assert.match(pgSpec, /Object\.keys\(clsNoopGuard\), \["canActivate"\]/u);
  assert.match(pgSpec, /await clsNoopGuard\.canActivate!\(\{\}\), true/u);
});

test("AppModule source binds the dynamic noop guard to mounted CLS middleware only", () => {
  const clsConfig = appModule.match(
    /ClsModule\.forRoot\(\{[\s\S]*?\n {4}\}\),\n {4}ScheduleModule/u
  )?.[0];
  assert.ok(clsConfig, "ClsModule configuration block must remain statically discoverable");
  assert.match(clsConfig, /middleware:\s*\{[\s\S]*?mount: true/u);
  assert.doesNotMatch(clsConfig, /\bguard\s*:/u);
});

test("AppModule runner permanently reserves a sha256 runId identity", () => {
  assert.match(runner, /const runIdDigest = sha256\(runId\)/u);
  assert.match(runner,
    /`appmodule-composition-runid-\$\{runIdDigest\}\.reservation\.json`/u);
  assert.match(runner, /property-appmodule-composition-runid-reservation-v1/u);
  assert.match(runner, /run_id: runId/u);
  assert.match(runner, /artifact: relativePath\(artifactPath\)/u);
  assert.match(runner, /detached_manifest: relativePath\(manifestPath\)/u);
  assert.match(runner,
    /writeFileSync\(reservationPath, bytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.match(runner, /runId is permanently reserved/u);
});

test("AppModule runner publishes immutable formal success or failure evidence", () => {
  assert.match(runner, /property-appmodule-composition-formal-v1/u);
  assert.match(runner,
    /publication_contract\\tartifact-and-detached-manifest-both-required/u);
  assert.match(runner,
    /writeFileSync\(manifestPath, manifestBytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.match(runner,
    /writeFileSync\(artifactPath, artifactBytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.match(runner, /status: "passed",\n\s+candidate_admissible: true/u);
  assert.match(runner, /status: "failed",\n\s+candidate_admissible: false/u);
  const testIndex = runner.indexOf("pgGate = await runCompositionSpec()");
  const cleanupIndex = runner.indexOf("const cleaned = safeCleanup()", testIndex);
  const finalFreezeIndex = runner.indexOf("inputFreezeAfterCleanup =", cleanupIndex);
  const outcomeIndex = runner.indexOf("const outcome =", finalFreezeIndex);
  assert.ok(testIndex > 0 && cleanupIndex > testIndex
    && finalFreezeIndex > cleanupIndex && outcomeIndex > finalFreezeIndex,
  "success disposition must follow tests, exact cleanup, and final input freeze");
});

test("AppModule runner freezes every signed composition authority four times", () => {
  for (const path of [
    "apps/api/src/app.module.ts",
    "apps/api/src/modules/property-tasks/property-task.module.ts",
    "apps/api/src/modules/property-approvals/property-approval.module.ts",
    "c4-runtime-formal-final-signoff-v13l.md",
    "b-property-task-runtime-v1.grammar",
    "b-property-task-projection-callsite-v1.grammar",
    "b-property-task-runtime-v1-handoff.md",
    "b-property-task-runtime-v1-handoff-signoff.md"
  ]) assert.match(runner, new RegExp(path.replaceAll(".", "\\."), "u"));
  assert.match(runner, /const pgSpec = resolve\(apiRoot, "src\/app\.module\.composition\.pg\.spec\.ts"\)/u);
  assert.match(runner, /runnerPath,/u);
  assert.match(runner, /staticSpec,/u);
  const authorityBlock = runner.match(/const authorityInputs = \[([\s\S]*?)\n\];/u)?.[1];
  assert.ok(authorityBlock, "authority input block is required");
  const authorityCount = authorityBlock.split("\n").filter((line) =>
    /^\s+(?:resolve\(|pgSpec,|runnerPath,|staticSpec,)/u.test(line)).length;
  assert.equal(authorityCount, 11, "eleven explicit authorities must remain frozen");
  for (const path of [
    "apps/api/package.json",
    "apps/api/tsconfig.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml"
  ]) assert.match(runner, new RegExp(path.replaceAll(".", "\\."), "u"));
  for (const marker of [
    "recursiveRegularTypeScriptFiles",
    "readdirSync(directory, { withFileTypes: true })",
    "metadata.isSymbolicLink()",
    "metadata.isFile()",
    'path.endsWith(".ts")',
    "buildSignedInputs().map"
  ]) assert.ok(runner.includes(marker), marker);
  for (const helper of [
    "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs",
    "scripts/e2e/property-remediation/track-b2a-c4-runtime-lifecycle.mjs"
  ]) assert.match(runner, new RegExp(helper.replaceAll(".", "\\."), "u"));
  assert.match(runner, /const executionAuthorityInputs = \[/u);
  assert.match(runner, /\.\.\.executionAuthorityInputs/u);
  assert.match(runner, /execution_authority_inputs: executionAuthorityInputs\.map\(relativePath\)/u);
  assert.match(runner, /execution_closure:/u);
  assert.match(runner, /\]\)\]\.sort\(\)\.map\(assertRegularSignedInput\)/u);

  const apiFiles = recursiveRegularTypeScriptFiles(resolve(root, "apps/api/src"))
    .map((path) => path.slice(root.length + 1).replaceAll("\\", "/"));
  assert.ok(apiFiles.length > 0, "API TypeScript execution closure must not be empty");
  const timerOrEnvSources = [
    "apps/api/src/shared/services/idempotency-cleanup.service.ts",
    "apps/api/src/modules/safety-inspect-tasks/safety-inspect.scheduler.ts",
    "apps/api/src/modules/video-cameras/video-alert.scheduler.ts",
    "apps/api/src/modules/iot/iot-mqtt.service.ts",
    "apps/api/src/modules/iot/iot-rule.scheduler.ts",
    "apps/api/src/modules/iot/iot-status.scheduler.ts",
    "apps/api/src/modules/iot/iot-realtime.gateway.ts"
  ];
  assert.ok(timerOrEnvSources.length >= 7);
  for (const sourcePath of timerOrEnvSources) {
    assert.ok(apiFiles.includes(sourcePath), `${sourcePath} must be in the recursive freeze`);
    assert.match(readFileSync(resolve(root, sourcePath), "utf8"),
      /setInterval\(|process\.env\.|configService/u, sourcePath);
  }
  for (const stage of ["before-execution", "after-local", "after-test", "after-cleanup"]) {
    assert.match(runner, new RegExp(`"${stage}"`, "u"));
  }
  assert.match(runner, /AppModule composition signed input drift/u);
});

test("AppModule signed input validator rejects symlinks and special files", () => {
  const functionSource = runner.match(
    /function assertRegularSignedInput\(path\) \{[\s\S]*?\n\}/u
  )?.[0];
  assert.ok(functionSource, "runner signed-input validator must be extractable");
  const assertRegularSignedInput = runInNewContext(`(${functionSource})`, { lstatSync });
  const temporaryDirectory = mkdtempSync("/tmp/appmodule-signed-input-");
  const symlinkPath = resolve(temporaryDirectory, "authority-link");
  try {
    symlinkSync(resolve(root, "pnpm-lock.yaml"), symlinkPath);
    assert.throws(() => assertRegularSignedInput(symlinkPath), /signed input forbids symlink/u);
    assert.throws(() => assertRegularSignedInput("/dev/null"),
      /signed input requires regular file/u);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("AppModule runner uses unwrapped TAP 4 and performs no schema mutation", () => {
  assert.match(runner, /const expectedTests = 4/u);
  assert.match(runner, /const expectedLocalTests = 12/u);
  assert.match(runner,
    /\["--require", "ts-node\/register", pgSpec\]/u);
  assert.doesNotMatch(runner, /--test-isolation/u);
  assert.match(runner, /parseTap\(stdout, expectedTests, "AppModule composition"\)/u);
  assert.match(runner, /input: "SELECT 1;\\n"/u);
  assert.doesNotMatch(runner,
    /synchronize\s*:\s*true|session_replication_role|DISABLE TRIGGER|database\/migrations/iu);
});
