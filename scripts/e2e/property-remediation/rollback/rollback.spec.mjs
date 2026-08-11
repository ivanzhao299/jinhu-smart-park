import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { symlinkSync, realpathSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { URL } from "node:url";
import test from "node:test";
import { buildCommandSpecs, COMMAND_IDS, materializeCommand, probeCommandRuntime, safeChildEnvironment } from "./command-spec.mjs";
import { compareDurableSnapshots } from "./comparator.mjs";
import { assertNoSensitiveData, canonicalSha256, durableTableNames, loadProfile, makeDurableSnapshot, repoRoot, sha256 } from "./lib.mjs";
import { validatePatchMetadata } from "./patch-validator.mjs";
import { assertCommandOutputSafe, deriveExpectedTree, makeRtoRpoDiagnostic, parseOptions, runGitWithFrozenPatch } from "./runner.mjs";
import { assertUniqueAuthorityPorts, databaseUrlForName, resourceAuthority, validateCleanupResult } from "./runtime-control.mjs";
import { proveBuildFlags } from "./flags-proof.mjs";
import { cleanDeclaredBuildOutput } from "./build-output.mjs";
import { enumerateAuthorityProcesses, initializeRuntimeLease, readBoundRuntimeLease, terminateAuthorityProcesses, writeRuntimeLeaseAtomic } from "./runtime-lease.mjs";
import { anchorPasses, assertBaselineSemanticAnchors, captureImmutableTestFiles, evaluateRollbackSemanticContract, immutableSyntheticAnchorId, readSemanticFilesFromGitTree } from "./semantic-contract.mjs";
import { checkConfig } from "./check-config.mjs";
import { appendServiceDiagnostic, assertServiceProcessRunning, combineServiceSmokeErrors, formatServiceSmokeFailure, runServiceSmokeStep, serviceAuthorityEnvironment, waitReady } from "./service-smoke.mjs";

const FINAL_SHA = "1234567890abcdef1234567890abcdef12345678";
const RUN_ID = "rollback-20260805T180000Z-1234567890ab";

test("profile freezes 19 cases and complete formal matrix", () => {
  const { profile } = loadProfile();
  assert.equal(profile.cases.filter(({ kind }) => kind === "backend-closure").length, 17);
  assert.equal(profile.cases.filter(({ kind }) => kind === "frontend-group").length, 2);
  assert.deepEqual(profile.requiredGateIds, [...COMMAND_IDS]);
  assert.equal(assertBaselineSemanticAnchors(profile), true);
  const treeSha = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  assert.equal(assertBaselineSemanticAnchors(profile, { root: repoRoot, treeSha }), true);
});

test("Next config semantic anchor rejects comments and behavior drift", () => {
  const { profile } = loadProfile();
  const anchor = profile.cases
    .flatMap(({ rollbackSemanticContract }) => rollbackSemanticContract.protectedExternalPaths)
    .find(({ id }) => id === "offline-next-config");
  const baseline = readFileSync(resolve(repoRoot, anchor.path), "utf8");
  assert.equal(anchorPasses(anchor, baseline), true);
  assert.equal(anchorPasses(anchor, `// review-only comment\n${baseline.replace("const apiTarget", "const   apiTarget")}`), false);
  const alwaysEnabled = baseline.replace('value?.trim().toLowerCase() === "true" ? "true" : "false"', '"true"');
  assert.equal(anchorPasses(anchor, alwaysEnabled), false);
  const commentedMappings = baseline
    .replace("NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: deploymentFlag(process.env.PROPERTY_OFFLINE_DRAFTS_V1)", 'NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: "false"')
    .replace("NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1)", 'NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: "false"')
    .replace("  env: {", `  // NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: deploymentFlag(process.env.PROPERTY_OFFLINE_DRAFTS_V1)\n  // NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1)\n  env: {`);
  assert.equal(anchorPasses(anchor, commentedMappings), false);
  const duplicateMapping = baseline.replace(
    "NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1)",
    'NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1),\n    NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: "true"'
  );
  assert.equal(anchorPasses(anchor, duplicateMapping), false);
  const shadowedFlag = baseline
    .replace("const nextConfig: NextConfig = {", "const nextConfig: NextConfig = (() => {\n  const deploymentFlag = () => \"true\" as const;\n  return ({")
    .replace("\n};\n\nexport default nextConfig;", "\n  });\n})();\n\nexport default nextConfig;");
  assert.equal(anchorPasses(anchor, shadowedFlag), false);
  const cwdAlias = baseline
    .replace('path.resolve(__dirname, "../../packages/shared/src/index.ts")', 'path.resolve( process.cwd(), "../../packages/shared/src/index.ts")')
    .replace('  webpack(config) {', '  // "@jinhu/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")\n  webpack(config) {');
  assert.equal(anchorPasses(anchor, cwdAlias), false);
  const indirectCwdAlias = baseline
    .replace('path.resolve(__dirname, "../../packages/shared/src/index.ts")', 'path.resolve(globalThis.process.cwd(), "../../packages/shared/src/index.ts")');
  assert.equal(anchorPasses(anchor, indirectCwdAlias), false);
  assert.equal(anchorPasses(anchor, `const __dirname = "/wrong-root";\n${baseline}`), false);
  const computedOverride = baseline.replace(
    "NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1)",
    'NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1),\n    ["NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_" + "V1"]: "true"'
  );
  assert.equal(anchorPasses(anchor, computedOverride), false);
  assert.equal(anchorPasses(anchor, baseline.replace("../../packages/shared/src/index.ts", "../../packages/shared/src/index .ts")), false);
  assert.equal(anchorPasses(anchor, `${baseline}\nconst broken = {;`), false);
});

test("baseline semantic gate rejects historical profile drift but permits must-change shells", () => {
  const { profile } = loadProfile();
  const mutateAnchor = (caseId, collection, anchorId, token) => {
    const changed = JSON.parse(JSON.stringify(profile)); const rehearsalCase = changed.cases.find(({ id }) => id === caseId);
    const anchor = rehearsalCase.rollbackSemanticContract[collection].find(({ id }) => id === anchorId);
    anchor.mustContain.push(token); return changed;
  };
  for (const [caseId, anchorId, token] of [
    ["homestay-dashboard", "hs-dashboard-shell", "nightly_rate"],
    ["homestay-turnover", "hs-turnover-shell", "released_at"],
    ["homestay-finance", "hs-finance-shell", "ON CONFLICT"]
  ]) assert.throws(() => assertBaselineSemanticAnchors(mutateAnchor(caseId, "retainedShell", anchorId, token)), /baseline semantic anchors/u);
  const externalCase = profile.cases.find(({ rollbackSemanticContract }) => rollbackSemanticContract.protectedExternalPaths.length > 0);
  const external = externalCase.rollbackSemanticContract.protectedExternalPaths[0];
  assert.throws(() => assertBaselineSemanticAnchors(mutateAnchor(externalCase.id, "protectedExternalPaths", external.id, "impossible-protected-token")), /baseline semantic anchors/u);
  const duplicateMatcher = JSON.parse(JSON.stringify(profile));
  const digestAnchor = duplicateMatcher.cases.flatMap(({ rollbackSemanticContract }) => rollbackSemanticContract.protectedExternalPaths).find(({ id }) => id === "offline-next-config");
  digestAnchor.astMatchers.push({ ...digestAnchor.astMatchers[0] });
  assert.throws(() => assertBaselineSemanticAnchors(duplicateMatcher), /invalid protected external anchor/u);
  assert.equal(assertBaselineSemanticAnchors(mutateAnchor("housing-tenant", "retainedShell", "housing-tenant-projection-shell", "expected-post-rollback-only-token")), true);
});

test("semantic Git-tree reads distinguish committed blobs, missing paths, and directories", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-semantic-tree-"));
  try {
    const git = (args) => execFileSync("/usr/bin/git", args, { cwd: temp, encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC", GIT_AUTHOR_NAME: "rollback-test", GIT_AUTHOR_EMAIL: "rollback@test.invalid", GIT_COMMITTER_NAME: "rollback-test", GIT_COMMITTER_EMAIL: "rollback@test.invalid" } }).trim();
    git(["init", "-q"]); const tracked = resolve(temp, "tracked/file.ts"); mkdirSync(resolve(tracked, ".."), { recursive: true }); writeFileSync(tracked, "committed\n"); git(["add", "--", "tracked/file.ts"]); const treeSha = git(["write-tree"]);
    writeFileSync(tracked, "dirty\n"); rmSync(tracked);
    const files = readSemanticFilesFromGitTree({ cwd: temp, treeSha, paths: ["tracked/file.ts", "tracked/file.ts", "missing.ts"] });
    assert.deepEqual(files, { "tracked/file.ts": "committed\n", "missing.ts": null });
    assert.throws(() => readSemanticFilesFromGitTree({ cwd: temp, treeSha, paths: ["tracked"] }), /not a regular blob/u);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("formal config check advances past the now-frozen 19 semantic contracts", async () => {
  await assert.rejects(checkConfig({ finalSha: FINAL_SHA, requireClean: false }), /invalid reference|semantic tree object/u);
});

test("all runner-owned commands materialize to executable absolute paths", async () => {
  const { profile } = loadProfile();
  const worktree = repoRoot;
  const backendSpecs = buildCommandSpecs(profile, profile.cases[0]);
  for (const spec of backendSpecs) {
    const argv = materializeCommand(spec, worktree);
    assert(isAbsolute(argv[0]));
    assert.equal(argv.some((value) => value.includes("$NODE") || value.includes("$TSC") || value.includes("$NEXT") || value.includes("$TS_NODE_REGISTER") || value.includes("$WORKTREE") || value.includes("$ROLLBACK_HARNESS")), false);
    assert(!argv.includes("/bin/true"));
    assert(!argv.includes("echo"));
  }
  const backendTarget = backendSpecs.find(({ id }) => id === "targeted-regression");
  const backendEnv = safeChildEnvironment({ needsDatabaseCredential: false, typescriptTestProject: backendTarget.typescriptTestProject, worktree });
  assert.equal(backendEnv.TS_NODE_PROJECT, resolve(worktree, "apps/api/tsconfig.json"));
  assert.equal(backendEnv.TS_NODE_COMPILER_OPTIONS, '{"module":"CommonJS","moduleResolution":"Node"}');
  const frontendCase = profile.cases.find(({ kind }) => kind === "frontend-group");
  const frontendTarget = buildCommandSpecs(profile, frontendCase).find(({ id }) => id === "targeted-regression");
  const frontendEnv = safeChildEnvironment({ needsDatabaseCredential: false, typescriptTestProject: frontendTarget.typescriptTestProject, worktree });
  assert.equal(frontendEnv.TS_NODE_PROJECT, resolve(worktree, "apps/web/tsconfig.json"));
  assert.throws(() => safeChildEnvironment({ needsDatabaseCredential: false, typescriptTestProject: "../escape.json", worktree }), /escapes/u);
  assert.equal((await probeCommandRuntime()).status, "PASS");
});

test("command token materialization never rescans replacement path text", () => {
  const worktree = mkdtempSync(resolve(tmpdir(), "rollback-$TSC-$NEXT-"));
  try {
    mkdirSync(resolve(worktree, "apps/api"), { recursive: true });
    mkdirSync(resolve(worktree, "apps/web"), { recursive: true });
    symlinkSync(resolve(repoRoot, "node_modules"), resolve(worktree, "node_modules"));
    symlinkSync(resolve(repoRoot, "apps/api/node_modules"), resolve(worktree, "apps/api/node_modules"));
    symlinkSync(resolve(repoRoot, "apps/web/node_modules"), resolve(worktree, "apps/web/node_modules"));
    const { profile } = loadProfile();
    const sharedBuild = buildCommandSpecs(profile, profile.cases[0]).find(({ id }) => id === "shared-build");
    const argv = materializeCommand(sharedBuild, worktree);
    assert.equal(argv[3], resolve(worktree, "packages/shared/tsconfig.json"));
    assert.equal(materializeCommand({ executable: "$NODE", args: ["$TSCish"] }, worktree)[1], "$TSCish");
    for (const value of ["x$TSC", "$TSC/extra", "$WORKTREE/a/$NEXT"]) {
      assert.throws(() => materializeCommand({ executable: "$NODE", args: [value] }, worktree), /runtime token/u);
    }
  } finally { rmSync(worktree, { recursive: true, force: true }); }
});

test("strict CLI rejects unknown and duplicate options and supports default check", () => {
  assert.deepEqual(parseOptions([]), { mode: "--check", options: {} });
  assert.throws(() => parseOptions(["--check", "--wat", "x"]), /unknown option/u);
  assert.throws(() => parseOptions(["--execute", "--case", "a", "--case", "b"]), /duplicate/u);
});

test("database target URL preserves authority and changes only encoded database path", () => {
  const target = new URL(databaseUrlForName("postgresql://user:p%40ss@127.0.0.1:5432/postgres?sslmode=require", "jinhu_rollback_abc123"));
  assert.equal(target.username, "user"); assert.equal(target.password, "p%40ss");
  assert.equal(target.pathname, "/jinhu_rollback_abc123"); assert.equal(target.search, "");
});

test("secret scanner catches bearer, JWT, raw provider token and credential argv", () => {
  for (const value of ["Bearer abcdefghijklmnop", "eyJabcde.abcdefgh.ijklmnop", "ghp_abcdefghijklmnopqrstuvwxyz", ["node", "--database-url=x"], "password=Correct#2026", '{"token":"plain-secret-value"}', 'token: getAccessToken() || "plain-secret-value"', "token: getAccessToken() ?? `plain-secret-value`", 'token: getAccessToken()\n || "plain-secret-value"', "token: session.getAccessToken()\n ?? `plain-secret-value`", 'token: getAccessToken()\n + "plain-secret-value"', 'token: getAccessToken()\n ? "plain-secret-value" : undefined', 'token: getTokenFactory()\n ("plain-secret-value")', 'token: getTokenContainer()\n ["plain-secret-value"]', 'token: getTokenTag()\n `plain-secret-value`', '+ token: getAccessToken()\n+  + "plain-secret-value"', '+ token: getAccessToken()\n+  ? "plain-secret-value" : undefined', '+ token: getTokenFactory()\n+  ("plain-secret-value")', '+ token: getTokenContainer()\n+  ["plain-secret-value"]', 'token ||= "plain-secret-value"', 'token ??= "plain-secret-value"', 'token &&= "plain-secret-value"', 'token += "plain-secret-value"', 'token -= "plain-secret-value"', 'token *= "plain-secret-value"', 'token /= "plain-secret-value"', 'token %= "plain-secret-value"', "token: decodeSecret(123456789)", "token: decodeSecret(process.env.SECRET)"]) assert.throws(() => assertNoSensitiveData(value), /credential|secret/u);
  for (const source of ["+ const headers = { token: getAccessToken() };", "- const headers = { token: session.getAccessToken() };", "+ const optional = { token: undefined };", "+ const fallback = { token: getAccessToken() ?? undefined };"]) assert.equal(assertNoSensitiveData(source), source);
});

test("Next build output permits only exact frozen public documentation URLs", () => {
  const docs = "https://nextjs.org/docs/app/api-reference/config/eslint";
  const docsMigration = "https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config";
  const outputCaveats = "https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats";
  const telemetry = "https://nextjs.org/telemetry";
  for (const id of ["baseline-web-clean-production-build", "web-clean-production-build"]) {
    const result = { stdout: `docs ${docs}.\r\nmigration ${docsMigration}\noutput ${outputCaveats}\ntelemetry (${telemetry}),\ncolored \u001b[36m${docs}\u001b[0m\n`, stderr: "" };
    assert.equal(assertCommandOutputSafe(result, id), result);
  }
  for (const value of [
    `${docs}?token=value`, `${docs}#fragment`, `${docs}/`, "http://nextjs.org/docs/app/api-reference/config/eslint",
    "https://user@nextjs.org/docs/app/api-reference/config/eslint", "https://nextjs.org:443/docs/app/api-reference/config/eslint",
    "https://nextjs.org.evil/docs/app/api-reference/config/eslint", "https://docs.nextjs.org/app/api-reference/config/eslint",
    "https://nextjs.org/docs/app/api-reference/config/unknown", "postgresql://user:password@example.invalid/database",
    `${docsMigration}?token=value`, `${docsMigration}/`, `${docsMigration}-suffix`,
    `${outputCaveats}?token=value`, `${outputCaveats}/`, "http://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats",
    "https://user@nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats",
    "https://nextjs.org:443/docs/app/api-reference/config/next-config-js/output#caveats",
    "https://nextjs.org.evil/docs/app/api-reference/config/next-config-js/output#caveats",
    "https://nextjs.org/docs/app/api-reference/config/next-config-js/output#other",
    "postgresql:\\/\\/user:password@example.invalid/database", "https:\\/\\/evil.example/path",
    "https:\\\\/\\\\/evil.example/path", "https:\\u002f\\u002fevil.example/path",
    "https:/\\/evil.example/path", "https:\\//evil.example/path",
    "https:/\\u002Fevil.example/path", "https:\\u002F/evil.example/path",
    `https:\u001b[0m\\/\\/evil.example/path`, `https:\\/\u001b[0m\\/evil.example/path`,
    `${telemetry}\\evil`, `${telemetry}\u001b[0m?x=value`, `${telemetry}\u001b[0m#fragment`,
    `${telemetry}\u0085?x=value`, `${telemetry}\u009b?x=value`
  ]) assert.throws(() => assertCommandOutputSafe({ stdout: value, stderr: "" }, "web-clean-production-build"), /URL|credential|secret|control/u);
  assert.throws(() => assertCommandOutputSafe({ stdout: docs, stderr: "" }, "api-build"), /URL/u);
  assert.throws(() => assertCommandOutputSafe({ stdout: "postgresql:\\/\\/user:password@example.invalid/database", stderr: "" }, "api-build"), /URL/u);
  assert.throws(() => assertCommandOutputSafe({ stdout: `${docs}\nBearer abcdefghijklmnop`, stderr: "" }, "web-clean-production-build"), /credential|secret/u);
});

test("service smoke failures preserve safe diagnostics without file URLs or secrets", () => {
  const fileFailure = formatServiceSmokeFailure(new Error("service readiness failed at file:///tmp/private/service-smoke.mjs:12"));
  assert.match(fileFailure, /service readiness failed at <redacted-url>/u);
  assert.doesNotMatch(fileFailure, /file:\/\//u);
  assert.doesNotThrow(() => assertNoSensitiveData(fileFailure));
  const secretFailure = formatServiceSmokeFailure(new Error("password=not-for-output"));
  assert.match(secretFailure, /redacted sensitive details/u);
  assert.doesNotMatch(secretFailure, /not-for-output/u);
  assert.doesNotThrow(() => assertNoSensitiveData(secretFailure));
  for (const sensitive of [
    "database_url=postgresql://user:password@example.invalid/database",
    "Bearer abcdefghijklmnop",
    "eyJabcde.abcdefgh.ijklmnop"
  ]) {
    const output = formatServiceSmokeFailure(sensitive);
    assert.match(output, /redacted/u);
    assert.doesNotThrow(() => assertNoSensitiveData(output));
  }
  const cliFailure = spawnSync(process.execPath, [resolve(repoRoot, "scripts/e2e/property-remediation/rollback/service-smoke.mjs")], { encoding: "utf8" });
  assert.equal(cliFailure.status, 1);
  assert.equal(cliFailure.stdout, "");
  const payload = JSON.parse(cliFailure.stderr.trim());
  assert.equal(payload.schemaVersion, "property-track-c-service-smoke-error-v1");
  assert.equal(payload.status, "FAIL");
  assert.match(payload.error, /usage: service-smoke/u);
  assert.doesNotThrow(() => assertNoSensitiveData(cliFailure.stderr));
});

test("service smoke diagnostics identify the failing bounded step", async () => {
  await assert.rejects(
    runServiceSmokeStep("web-rewrite-homestay-dashboard", async () => { throw new Error("fetch failed"); }),
    /service smoke web-rewrite-homestay-dashboard failed: fetch failed/u
  );
  await assert.rejects(
    runServiceSmokeStep("not-a-real-step", async () => undefined),
    /unsupported service smoke step/u
  );
  let wrapped;
  const original = new Error("startup failed at /etc/private/api.js and C:\\private\\api.js");
  try {
    await runServiceSmokeStep("api-health", async () => {
      throw original;
    });
  } catch (error) {
    wrapped = error;
  }
  assert.equal(wrapped.cause, original);
  const output = formatServiceSmokeFailure(wrapped);
  assert.match(output, /service smoke api-health failed/u);
  assert.match(output, /<redacted-path>/u);
  assert.doesNotMatch(output, /\/etc\/private|C:\\private/u);
  assert.doesNotThrow(() => assertNoSensitiveData(output));
  let sensitiveWrapped;
  try {
    await runServiceSmokeStep("api-ready", async () => {
      throw new Error("password=not-for-output Bearer abcdefghijklmnop");
    });
  } catch (error) {
    sensitiveWrapped = error;
  }
  const sensitiveOutput = formatServiceSmokeFailure(sensitiveWrapped);
  assert.match(sensitiveOutput, /service smoke api-ready failed with redacted sensitive details/u);
  assert.doesNotMatch(sensitiveOutput, /not-for-output|abcdefghijklmnop/u);
  assert.doesNotThrow(() => assertNoSensitiveData(sensitiveOutput));
});

test("service readiness retries transient Web startup failures within a fixed budget", async () => {
  let requests = 0;
  let delays = 0;
  const response = { status: 200, json: async () => ({ data: { status: "ok" } }) };
  const requestImplementation = async () => {
    requests += 1;
    if (requests < 3) throw new TypeError("fetch failed");
    return response;
  };
  const delayImplementation = async () => { delays += 1; };
  assert.equal(await waitReady("http://127.0.0.1:50000/login", null, undefined, {
    attempts: 3, intervalMilliseconds: 0, requestImplementation, delayImplementation
  }), response);
  assert.equal(requests, 3);
  assert.equal(delays, 2);

  requests = 0;
  await assert.rejects(waitReady("http://127.0.0.1:50000/login", null, undefined, {
    attempts: 3,
    intervalMilliseconds: 0,
    requestImplementation: async () => { requests += 1; throw new TypeError("fetch failed"); },
    delayImplementation
  }), /service readiness failed: fetch failed/u);
  assert.equal(requests, 3);
});

test("service readiness fails immediately when a child exits before listening", async () => {
  const exited = { role: "web", spawnError: null, exited: true, exitCode: 1, signal: null, stderrTail: "" };
  appendServiceDiagnostic(exited, "next startup failed safely\n");
  assert.throws(() => assertServiceProcessRunning(exited), /web service process exited before readiness \(exit code 1\); web stderr tail: next startup failed safely/u);
  appendServiceDiagnostic(exited, `prefix-${"x".repeat(9 * 1024)}-tail`);
  assert.equal(Buffer.byteLength(exited.stderrTail, "utf8") <= 8 * 1024, true);
  assert.match(exited.stderrTail, /-tail$/u);
  assert.doesNotMatch(exited.stderrTail, /prefix-/u);
  const safeDiagnostic = formatServiceSmokeFailure(new Error(`service smoke web-login-page failed: ${exited.stderrTail}`));
  assert.doesNotThrow(() => assertNoSensitiveData(safeDiagnostic));
  let requests = 0;
  await assert.rejects(waitReady("http://127.0.0.1:50000/login", null, undefined, {
    attempts: 3,
    intervalMilliseconds: 0,
    processState: exited,
    requestImplementation: async () => { requests += 1; return { status: 200 }; },
    delayImplementation: async () => undefined
  }), /web service process exited before readiness/u);
  assert.equal(requests, 0);
  assert.throws(() => assertServiceProcessRunning({ ...exited, exited: false, spawnError: true }), /web service process failed to start/u);
});

test("service smoke authority reaches child services and cleanup diagnostics are cumulative", () => {
  const commandSpecSha256 = sha256("service-smoke-command-spec");
  const authority = {
    runtimeNonce: "runtime-nonce", commandSpecSha256,
    labels: { "jinhu.rollback.run_id": RUN_ID, "jinhu.rollback.final_sha": FINAL_SHA, "jinhu.rollback.case_id": "homestay-dashboard" }
  };
  assert.deepEqual(serviceAuthorityEnvironment(authority, process.execPath), {
    ROLLBACK_RUNTIME_NONCE: "runtime-nonce", ROLLBACK_RUN_ID: RUN_ID, ROLLBACK_FINAL_SHA: FINAL_SHA,
    ROLLBACK_CASE_ID: "homestay-dashboard", ROLLBACK_EXPECTED_EXECUTABLE: process.execPath, ROLLBACK_COMMAND_SPEC_SHA256: commandSpecSha256
  });
  const combined = combineServiceSmokeErrors(new Error("primary"), [new Error("web stop"), new Error("port busy"), new Error("lease write")]);
  assert.match(combined.message, /primary; service cleanup failed: web stop; port busy; lease write/u);
  assert.equal(combineServiceSmokeErrors(null, []), null);
});

test("RTO/RPO failures produce a hash-bound detail-free diagnostic", () => {
  const diagnostic = makeRtoRpoDiagnostic({
    runId: RUN_ID, finalSha: FINAL_SHA, profileSha256: sha256("profile"), caseId: "homestay-dashboard",
    durableComparison: { identical: false, changedTables: ["biz_property_occupancy"], rpoCommittedRows: 1, beforeSha256: sha256("before"), afterSha256: sha256("after") },
    rtoStartedAt: "2026-08-05T00:00:00.000Z", rtoFinishedAt: "2026-08-05T00:00:01.000Z",
    monotonicStarted: 10n, monotonicFinished: 1_000_000_010n, rtoMilliseconds: 1000, rtoTargetMilliseconds: 1_800_000
  });
  assert.deepEqual(diagnostic.terminal.reasonCodes, ["DURABLE_MISMATCH"]);
  assert.equal(diagnostic.rto.withinTarget, true);
  assert.equal(diagnostic.durable.changedTables[0], "biz_property_occupancy");
  assert.equal(diagnostic.diagnosticSha256, canonicalSha256(Object.fromEntries(Object.entries(diagnostic).filter(([key]) => key !== "diagnosticSha256"))));
  assert.doesNotThrow(() => assertNoSensitiveData(diagnostic));
  const combined = makeRtoRpoDiagnostic({
    runId: RUN_ID, finalSha: FINAL_SHA, profileSha256: sha256("profile"), caseId: "homestay-dashboard",
    durableComparison: { identical: false, changedTables: ["biz_property_occupancy"], rpoCommittedRows: 1, beforeSha256: sha256("before"), afterSha256: sha256("after") },
    rtoStartedAt: "2026-08-05T00:00:00.000Z", rtoFinishedAt: "2026-08-05T00:30:00.001Z",
    monotonicStarted: 0n, monotonicFinished: 1_800_001_000_000n, rtoMilliseconds: 1_800_001, rtoTargetMilliseconds: 1_800_000
  });
  assert.deepEqual(combined.terminal.reasonCodes, ["DURABLE_MISMATCH", "RTO_EXCEEDED"]);
  assert.equal(combined.rto.withinTarget, false);
  const timedOut = makeRtoRpoDiagnostic({
    runId: RUN_ID, finalSha: FINAL_SHA, profileSha256: sha256("profile"), caseId: "homestay-dashboard",
    durableComparison: { identical: true, changedTables: [], rpoCommittedRows: 0, beforeSha256: sha256("same"), afterSha256: sha256("same") },
    rtoStartedAt: "2026-08-05T00:00:00.000Z", rtoFinishedAt: "2026-08-05T00:30:00.000Z",
    monotonicStarted: 0n, monotonicFinished: 1_800_000_000_000n, rtoMilliseconds: 1_800_000, rtoTargetMilliseconds: 1_800_000, timedOut: true
  });
  assert.deepEqual(timedOut.terminal.reasonCodes, ["RTO_TIMEOUT"]);
  assert.equal(timedOut.rto.withinTarget, false);
  assert.throws(() => makeRtoRpoDiagnostic({
    runId: RUN_ID, finalSha: FINAL_SHA, profileSha256: sha256("profile"), caseId: "homestay-dashboard",
    durableComparison: { identical: true, changedTables: [], rpoCommittedRows: 0, beforeSha256: sha256("same"), afterSha256: sha256("same") },
    rtoStartedAt: "2026-08-05T00:00:00.000Z", rtoFinishedAt: "2026-08-05T00:00:01.000Z",
    monotonicStarted: 0n, monotonicFinished: 1_000_000_000n, rtoMilliseconds: 1000, rtoTargetMilliseconds: 1_800_000
  }), /requires a failed target/u);
});

test("unapplicable original reverse intent can use a reviewed manual forward-port while undeclared deviations fail", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-patch-"));
  try {
    const runRoot = resolve(temp, "run"); const input = resolve(runRoot, "inputs/patches"); mkdirSync(input, { recursive: true });
    const loaded = loadProfile(); const profileSha256 = loaded.profileSha256; const baseCase = loaded.profile.cases[0];
    const contract = {
      mustChangeProductionPaths: ["apps/api/src/modules/homestay/a.ts"],
      postApply: [{ id: "production-anchor", intentGroupId: "production-intent", path: "apps/api/src/modules/homestay/a.ts", pathState: "present", mustContain: ["manual-compatible-shell"], mustNotContain: [], mustMatch: [], mustNotMatch: [], astMatchers: [] }],
      retainedShell: [], protectedExternalPaths: [], immutableTestPaths: ["apps/api/src/modules/homestay/**/*.spec.ts"],
      allowedInvariantIds: ["INV-CANONICAL-PORT"], allowedGateIds: ["targeted-regression"]
    };
    const rehearsalCase = { ...baseCase, allowedPatchPrefixes: ["apps/api/src/modules/homestay/a.ts", "apps/api/src/modules/homestay/a.spec.ts"], rollbackSemanticContract: contract }; const profile = { ...loaded.profile, cases: loaded.profile.cases.map((entry) => entry.id === rehearsalCase.id ? rehearsalCase : entry) };
    const originalReverse = "original reverse no longer applies to the final tree\n";
    const patch = "diff --git a/apps/api/src/modules/homestay/a.ts b/apps/api/src/modules/homestay/a.ts\n--- a/apps/api/src/modules/homestay/a.ts\n+++ b/apps/api/src/modules/homestay/a.ts\n@@ -1 +1 @@\n-current-final\n+manual-compatible-shell\n";
    const patchPath = resolve(input, "case.patch"); writeFileSync(patchPath, patch);
    const immutablePath = "apps/api/src/modules/homestay/a.spec.ts"; const touchedPaths = ["apps/api/src/modules/homestay/a.ts", immutablePath];
    const closure = { commits: [{ commitRef: rehearsalCase.commits[0], fullSha: rehearsalCase.commits[0], reverseDiffSha256: sha256(originalReverse) }], touchedPaths, touchedPathsSha256: canonicalSha256(touchedPaths), reversePatchSha256: sha256(originalReverse) };
    const deviationManifest = [
      { path: "apps/api/src/modules/homestay/a.ts", action: "modified", reason: "original reverse no longer applies", preservedInvariant: "INV-CANONICAL-PORT", test: "targeted-regression", contractAnchorId: "production-anchor" },
      { path: immutablePath, action: "intentionally-omitted", reason: "immutable verification is preserved", preservedInvariant: "INV-CANONICAL-PORT", test: "apps/api/src/modules/homestay/**/*.spec.ts", contractAnchorId: immutableSyntheticAnchorId(immutablePath) }
    ];
    const metadata = { schemaVersion: "property-track-c-reviewed-rollback-patch-v2", runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, caseId: rehearsalCase.id, commits: rehearsalCase.commits, closureBindingSha256: canonicalSha256(closure), patchMode: "reviewed-manual-forward-port", originalReverseSha256: sha256(originalReverse), touchedPathsSha256: closure.touchedPathsSha256, patchPath: "case.patch", manualPatchSha256: sha256(readFileSync(patchPath)), deviationManifest, author: "patch-author", reviewer: "independent-reviewer", reviewedAt: new Date().toISOString(), approved: true };
    assert.equal(validatePatchMetadata({ metadata, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }).sha256, sha256(patch));
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, deviationManifest: [] }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /deviation manifest/u);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, deviationManifest: [{ ...deviationManifest[0], path: "apps/api/src/modules/housing/undeclared.ts" }] }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /invalid|undeclared/u);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, deviationManifest: [deviationManifest[0], { ...deviationManifest[1], contractAnchorId: "immutable-test:free-text" }] }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /invalid/u);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, deviationManifest: [deviationManifest[0], { ...deviationManifest[1], action: "modified" }] }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /invalid/u);
    const omissionAnchor = { ...contract.postApply[0], id: "omission-anchor", astMatchers: [{ kind: "identifier", name: "manual", source: "", owner: "", enclosingOwner: "", minCount: 0, maxCount: 1 }], allowsIntentionalOmission: true }; const omissionCase = { ...rehearsalCase, rollbackSemanticContract: { ...contract, retainedShell: [omissionAnchor] } }; const omissionProfile = { ...profile, cases: profile.cases.map((entry) => entry.id === omissionCase.id ? omissionCase : entry) };
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, deviationManifest: [{ ...deviationManifest[0], action: "intentionally-omitted", contractAnchorId: omissionAnchor.id }, deviationManifest[1]] }, rehearsalCase: omissionCase, profile: omissionProfile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /invalid/u);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, author: metadata.reviewer }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /independent/u);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, author: "Patch-Author", reviewer: "ＰＡＴＣＨ－ＡＵＴＨＯＲ" }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /independent/u);
    const protectedPatch = patch.replaceAll("a.ts", "a.spec.ts"); writeFileSync(patchPath, protectedPatch);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, manualPatchSha256: sha256(protectedPatch) }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /protected/u);
    const commentPatch = patch.replace("-current-final\n+manual-compatible-shell", "-// old comment\n+// new comment"); writeFileSync(patchPath, commentPatch);
    assert.throws(() => validatePatchMetadata({ metadata: { ...metadata, manualPatchSha256: sha256(commentPatch) }, rehearsalCase, profile, runRoot, runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } }), /comments or whitespace/u);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("validated patch bytes stay frozen across a baseline-window input swap", async () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-patch-freeze-"));
  try {
    const worktree = resolve(temp, "worktree"); const caseRoot = resolve(temp, "case"); mkdirSync(resolve(worktree, "apps/api/src/modules/homestay"), { recursive: true }); mkdirSync(resolve(caseRoot, "logs"), { recursive: true });
    const productionPath = "apps/api/src/modules/homestay/a.ts"; writeFileSync(resolve(worktree, productionPath), "current-final\n");
    const git = (args) => execFileSync("/usr/bin/git", args, { cwd: worktree, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" }, encoding: "utf8" }).trim();
    git(["init", "-q"]); git(["add", "--", productionPath]); const finalTree = git(["write-tree"]);
    const safePatch = `diff --git a/${productionPath} b/${productionPath}\n--- a/${productionPath}\n+++ b/${productionPath}\n@@ -1 +1 @@\n-current-final\n+manual-compatible-shell\n`;
    const inputPath = resolve(temp, "run/inputs/patches/case.patch"); mkdirSync(resolve(inputPath, ".."), { recursive: true }); writeFileSync(inputPath, safePatch);
    const profileSha256 = sha256("self-contained-profile"); const contract = { mustChangeProductionPaths: [productionPath], postApply: [{ id: "production-anchor", intentGroupId: "production-intent", path: productionPath, pathState: "present", mustContain: ["manual-compatible-shell"], mustNotContain: [], mustMatch: [], mustNotMatch: [], astMatchers: [] }], retainedShell: [], protectedExternalPaths: [], immutableTestPaths: ["apps/api/src/modules/homestay/a.spec.ts"], allowedInvariantIds: ["INV"], allowedGateIds: ["gate"] };
    const rehearsalCase = { id: "frozen-patch-case", commits: [], targetedTestFiles: [], allowedPatchPrefixes: ["apps/api/src/modules/homestay/"], rollbackSemanticContract: contract }; const profile = { forbiddenBlindRevertCommits: [], cases: [rehearsalCase], commandSpec: { postgresqlFiles: [], canonicalPortFile: "packages/shared/src/unused.ts", contractFile: "packages/shared/src/unused-contract.ts" } }; const closure = { commits: [], touchedPaths: [productionPath], touchedPathsSha256: canonicalSha256([productionPath]), reversePatchSha256: sha256("reverse") };
    const metadata = { schemaVersion: "property-track-c-reviewed-rollback-patch-v2", runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, caseId: rehearsalCase.id, commits: [], closureBindingSha256: canonicalSha256(closure), patchMode: "reviewed-manual-forward-port", originalReverseSha256: closure.reversePatchSha256, touchedPathsSha256: closure.touchedPathsSha256, patchPath: "case.patch", manualPatchSha256: sha256(safePatch), deviationManifest: [{ path: productionPath, action: "modified", reason: "safe frozen forward port", preservedInvariant: "INV", test: "gate", contractAnchorId: "production-anchor" }], author: "patch-author", reviewer: "patch-reviewer", reviewedAt: new Date().toISOString(), approved: true };
    const frozen = validatePatchMetadata({ metadata, rehearsalCase, profile, runRoot: resolve(temp, "run"), runId: RUN_ID, finalSha: FINAL_SHA, profileSha256, runCreatedAt: new Date(Date.now() - 1000).toISOString(), sourceBinding: { closures: { [rehearsalCase.id]: closure } } });
    const evilPath = "apps/api/src/modules/homestay/unauthorized-command.mjs"; const marker = resolve(temp, "unauthorized-executed"); const evilPatch = `diff --git a/${evilPath} b/${evilPath}\nnew file mode 100644\n--- /dev/null\n+++ b/${evilPath}\n@@ -0,0 +1 @@\n+require('node:fs').writeFileSync('${marker}', 'executed')\n`;
    writeFileSync(inputPath, evilPatch); // Simulates replacement while the flags-on baseline is running.
    const artifacts = []; await deriveExpectedTree({ finalSha: finalTree, patchBytes: frozen.bytes, worktree, indexFile: resolve(temp, "derived.index"), caseRoot, artifacts });
    writeFileSync(inputPath, safePatch); // Simulates restoration before the final evidence gate.
    for (const args of [["apply", "--check", "--index", "-"], ["apply", "--index", "-"]]) { const result = await runGitWithFrozenPatch(args, worktree, { patchBytes: frozen.bytes }); assert.equal(result.exitCode, 0, result.stderr); }
    assert.equal(readFileSync(resolve(worktree, productionPath), "utf8"), "manual-compatible-shell\n"); assert.equal(existsSync(resolve(worktree, evilPath)), false); assert.equal(existsSync(marker), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("durable snapshot comparison enforces RPO zero", () => {
  const { profile } = loadProfile(); const tables = durableTableNames(profile).map((table) => ({ table, count: 1, contentSha256: sha256(table) }));
  const before = makeDurableSnapshot(tables, "2026-08-05T00:00:00Z"); const after = makeDurableSnapshot(tables, "2026-08-05T00:01:00Z");
  assert.equal(compareDurableSnapshots(before, after, profile).identical, true);
});

test("semantic contract freezes immutable globs and enforces structured AST/external/deletion anchors", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-semantic-"));
  try {
    const productionPath = "apps/api/src/modules/homestay/service.ts"; const immutablePath = "apps/api/src/modules/homestay/test/service.spec.ts"; const loginPath = "apps/web/app/login/page.tsx";
    for (const path of [productionPath, immutablePath, loginPath]) mkdirSync(resolve(temp, path, ".."), { recursive: true });
    const validProduction = 'import { Module } from "@nestjs/common";\nimport { Port } from "./port";\nexport class Service { constructor(private port: Port) {} async run() { await this.port.execute(); } }\n@Module({ providers: [Service] }) export class FeatureModule {}\n';
    writeFileSync(resolve(temp, productionPath), validProduction);
    writeFileSync(resolve(temp, immutablePath), "test('frozen', () => {});\n"); writeFileSync(resolve(temp, loginPath), "const completeLogin = useCallback(async () => { await setSession(); }, []);\n");
    const astMatchers = [
      { kind: "import", name: "Port", source: "./port", owner: "", enclosingOwner: "", minCount: 1, maxCount: 1 }, { kind: "class", name: "Service", source: "", owner: "", enclosingOwner: "", minCount: 1, maxCount: 1 },
      { kind: "provider", name: "Service", source: "", owner: "", enclosingOwner: "", minCount: 1, maxCount: 1 }, { kind: "constructorParameter", name: "port", source: "", owner: "Service", enclosingOwner: "", minCount: 1, maxCount: 1 },
      { kind: "awaitedCall", name: "execute", source: "", owner: "this.port", enclosingOwner: "run", minCount: 1, maxCount: 1 }, { kind: "export", name: "Service", source: "", owner: "", enclosingOwner: "", minCount: 1, maxCount: 1 }
    ];
    const rollbackSemanticContract = {
      mustChangeProductionPaths: [productionPath], postApply: [{ id: "service-anchor", intentGroupId: "service-intent", path: productionPath, pathState: "present", mustContain: ["await this.port.execute()"], mustNotContain: ["ConcreteService"], mustMatch: ["providers:\\s*\\[Service\\]"], mustNotMatch: ["new\\s+ConcreteService"], astMatchers }],
      retainedShell: [], protectedExternalPaths: [{ id: "login-anchor", intentGroupId: "login-invariant", path: loginPath, pathState: "present", mustContain: ["await setSession()"], mustNotContain: [], mustMatch: [], mustNotMatch: [], astMatchers: [{ kind: "awaitedCall", name: "setSession", source: "", owner: "", enclosingOwner: "completeLogin", minCount: 1, maxCount: 1 }], allowsIntentionalOmission: true }],
      immutableTestPaths: ["apps/api/src/modules/homestay/**/*.spec.ts"], allowedInvariantIds: ["INV"], allowedGateIds: ["targeted-regression"]
    };
    const rehearsalCase = { id: "case", rollbackSemanticContract }; const immutableBefore = captureImmutableTestFiles(temp, rehearsalCase);
    const patch = { paths: [productionPath], semanticChangedPaths: [productionPath], sha256: sha256("patch"), deviations: [{ path: productionPath, action: "modified", contractAnchorId: "service-anchor" }] };
    assert.equal(evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }).result.status, "PASS");
    writeFileSync(resolve(temp, loginPath), "const completeLogin = Promise.resolve().then(async () => { await setSession(); });\n");
    assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /protected external/u);
    writeFileSync(resolve(temp, loginPath), "const completeLogin = attacker.useCallback(async () => { await setSession(); }, []);\n");
    assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /protected external/u);
    writeFileSync(resolve(temp, loginPath), "const completeLogin = useCallback?.(async () => { await setSession(); }, []);\n");
    assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /protected external/u);
    writeFileSync(resolve(temp, loginPath), "const completeLogin = React?.useCallback(async () => { await setSession(); }, []);\n");
    assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /protected external/u);
    writeFileSync(resolve(temp, loginPath), "const completeLogin = useCallback(async () => { await setSession(); }, []);\n");
    writeFileSync(resolve(temp, productionPath), validProduction.replace('{ Port } from "./port"', '{ PortMalicious } from "./port"')); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /anchor/u);
    writeFileSync(resolve(temp, productionPath), validProduction.replace('{ Port } from "./port"', '{ PortMalicious as Port } from "./port"')); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /anchor/u);
    writeFileSync(resolve(temp, productionPath), validProduction.replace("@Module({ providers: [Service] })", "const decoy = { providers: [Service] };\n@Module({ providers: [] })")); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /anchor/u);
    writeFileSync(resolve(temp, productionPath), validProduction.replace("providers: [Service]", "providers: [Service, Service]")); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /anchor/u);
    writeFileSync(resolve(temp, productionPath), validProduction);
    writeFileSync(resolve(temp, immutablePath), "changed\n"); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /immutable/u);
    writeFileSync(resolve(temp, immutablePath), "test('frozen', () => {});\n"); const added = "apps/api/src/modules/homestay/test/replacement.spec.ts"; writeFileSync(resolve(temp, added), "replacement\n");
    assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /immutable/u);
    rmSync(resolve(temp, productionPath));
    const deletionCase = { ...rehearsalCase, rollbackSemanticContract: { ...rollbackSemanticContract, postApply: [{ id: "service-anchor", intentGroupId: "service-intent", path: productionPath, pathState: "absent", mustContain: [], mustNotContain: ["ConcreteService"], mustMatch: [], mustNotMatch: [], astMatchers: [] }] } };
    rmSync(resolve(temp, added)); writeFileSync(resolve(temp, productionPath), ""); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase: deletionCase, patch, immutableBefore }), /post-apply/u);
    rmSync(resolve(temp, productionPath)); assert.equal(evaluateRollbackSemanticContract({ root: temp, rehearsalCase: deletionCase, patch, immutableBefore }).result.status, "PASS");
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("retained-shell structural anchors reject required tokens hidden only in comments", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-retained-shell-"));
  try {
    const productionPath = "apps/api/src/modules/homestay/facade.ts"; const shellPath = "apps/api/src/modules/homestay/extracted.ts"; const immutablePath = "apps/api/src/modules/homestay/facade.spec.ts";
    for (const path of [productionPath, shellPath, immutablePath]) mkdirSync(resolve(temp, path, ".."), { recursive: true });
    writeFileSync(resolve(temp, productionPath), "export const facade = 'rolled-back';\n"); writeFileSync(resolve(temp, immutablePath), "test('immutable', () => {});\n");
    const shell = { id: "shell-anchor", intentGroupId: "facade-intent", path: shellPath, pathState: "present", mustContain: ["ExtractedService"], mustNotContain: [], mustMatch: [], mustNotMatch: [], astMatchers: [{ kind: "class", name: "ExtractedService", source: "", owner: "", enclosingOwner: "", minCount: 1, maxCount: 1 }], allowsIntentionalOmission: true };
    const rehearsalCase = { id: "retained-shell", rollbackSemanticContract: { mustChangeProductionPaths: [productionPath], postApply: [{ id: "facade-anchor", intentGroupId: "facade-intent", path: productionPath, pathState: "present", mustContain: ["rolled-back"], mustNotContain: [], mustMatch: [], mustNotMatch: [], astMatchers: [] }], retainedShell: [shell], protectedExternalPaths: [], immutableTestPaths: [immutablePath], allowedInvariantIds: ["INV"], allowedGateIds: ["gate"] } };
    const patch = { paths: [productionPath], semanticChangedPaths: [productionPath], sha256: sha256("patch"), deviations: [{ path: productionPath, action: "modified", contractAnchorId: "facade-anchor" }, { path: shellPath, action: "retained-shell", contractAnchorId: "shell-anchor" }] }; const immutableBefore = captureImmutableTestFiles(temp, rehearsalCase);
    writeFileSync(resolve(temp, shellPath), "// export class ExtractedService {}\nexport const unrelated = true;\n"); assert.throws(() => evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }), /retained-shell|intent group/u);
    writeFileSync(resolve(temp, shellPath), "export class ExtractedService {}\n"); assert.equal(evaluateRollbackSemanticContract({ root: temp, rehearsalCase, patch, immutableBefore }).result.status, "PASS");
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("child environment is allowlisted and cleanup schema is consistent", () => {
  const env = safeChildEnvironment({ needsDatabaseCredential: false }); assert.equal(env.HOME, undefined); assert.equal(env.DATABASE_URL, undefined);
  const commandSpecSha256 = sha256("service-smoke-command-spec");
  const bound = safeChildEnvironment({
    needsDatabaseCredential: false,
    authority: {
      apiPort: 41001, webPort: 51001, runtimeNonce: "runtime-nonce", runtimeManifest: "/tmp/runtime-manifest.json", commandSpecSha256,
      labels: { "jinhu.rollback.run_id": RUN_ID, "jinhu.rollback.final_sha": FINAL_SHA, "jinhu.rollback.case_id": "homestay-dashboard" }
    }
  });
  assert.equal(bound.ROLLBACK_COMMAND_SPEC_SHA256, commandSpecSha256);
  const residual = { containers: 0, networks: 0, volumes: 0, databases: 0, processGroups: 0, ports: 0, worktrees: 0, tempFiles: 0, secretFiles: 0 }; const authoritySha256 = sha256("authority"); const projection = { attempted: true, authoritySha256, residual, errors: [] };
  assert.equal(validateCleanupResult({ schemaVersion: "property-track-c-runner-cleanup-v1", status: "PASS", ...projection, manifestSha256: canonicalSha256(projection) }).status, "PASS");
});

test("dynamic process env cannot make a fabricated .next tree pass authoritative flag proof", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-fake-next-"));
  try {
    const next = resolve(temp, "apps/web/.next"); mkdirSync(next, { recursive: true }); writeFileSync(resolve(next, "BUILD_ID"), "fake");
    assert.throws(() => proveBuildFlags({ worktree: temp, expectedValue: "false", env: { PROPERTY_OFFLINE_DRAFTS_V1: "false", PROPERTY_UPLOAD_QUEUE_V1: "false", NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: "false", NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: "false", ROLLBACK_API_PORT: "44444" } }), /incomplete|ENOENT/u);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("baseline and rollback shared/API build specs delete stale dist JavaScript before compilation", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-api-dist-"));
  try {
    const staleApi = resolve(temp, "apps/api/dist/deleted-controller.js"); const staleShared = resolve(temp, "packages/shared/dist/deleted-contract.js");
    for (const stale of [staleApi, staleShared]) { mkdirSync(resolve(stale, ".."), { recursive: true }); writeFileSync(stale, "stale"); }
    const { profile } = loadProfile(); const specs = buildCommandSpecs(profile, profile.cases[0]); const apiBuild = specs.find(({ id }) => id === "api-build"); const sharedBuild = specs.find(({ id }) => id === "shared-build");
    assert.equal(apiBuild.cleanPath, "apps/api/dist"); assert.equal(sharedBuild.cleanPath, "packages/shared/dist"); cleanDeclaredBuildOutput(temp, sharedBuild); cleanDeclaredBuildOutput(temp, apiBuild); assert.equal(existsSync(staleApi), false); assert.equal(existsSync(staleShared), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("runtime authority allocates service listeners outside the default Linux ephemeral range", () => {
  const authority = resourceAuthority({
    runId: "rollback-20260805T010000Z-abcdef123456",
    finalSha: FINAL_SHA,
    caseId: "homestay-dashboard",
    runRoot: "/tmp/rollback-authority-port-contract",
    executionNonce: "c".repeat(64),
    commandSpecSha256: sha256("spec")
  });
  assert.ok(authority.apiPort >= 20_000 && authority.apiPort < 25_000);
  assert.ok(authority.webPort >= 25_000 && authority.webPort < 30_000);
  assert.throws(
    () => assertUniqueAuthorityPorts({
      first: authority,
      second: { ...authority, apiPort: authority.apiPort, webPort: authority.webPort + 1 }
    }),
    /rollback authority port collision/u
  );
});

test("runtime authority cleanup reaches residual zero at API spawn, Web spawn, and manifest-update interruption points", async () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-runtime-lease-")); const children = [];
  try {
    const runId = "rollback-20260805T010000Z-abcdef123456"; const finalSha = FINAL_SHA; const caseId = "homestay-dashboard"; const executionNonce = "c".repeat(64); const commandSpecSha256 = sha256("spec");
    const authority = resourceAuthority({ runId, finalSha, caseId, runRoot: temp, executionNonce, commandSpecSha256 });
    mkdirSync(authority.worktree, { recursive: true }); mkdirSync(resolve(authority.runtimeManifest, ".."), { recursive: true });
    const node = realpathSync(process.execPath); const marker = resolve(authority.worktree, "tagged-child.mjs"); writeFileSync(marker, "setInterval(() => {}, 1000);\n");
    const baseEnv = { PATH: process.env.PATH, ROLLBACK_RUNTIME_NONCE: authority.runtimeNonce, ROLLBACK_RUN_ID: runId, ROLLBACK_FINAL_SHA: finalSha, ROLLBACK_CASE_ID: caseId, ROLLBACK_EXPECTED_EXECUTABLE: node, ROLLBACK_COMMAND_SPEC_SHA256: commandSpecSha256, ROLLBACK_COMMAND_MARKER: marker };
    for (const point of ["api-spawn", "web-spawn", "manifest-update"]) {
      let lease = initializeRuntimeLease({ authority, commandSpecSha256, expectedExecutable: node }); const role = point === "web-spawn" ? "web" : "api";
      const child = spawn(node, [marker], { cwd: authority.worktree, detached: true, stdio: "ignore", env: { ...baseEnv, ROLLBACK_PROCESS_ROLE: role } }); children.push(child); child.unref(); await delay(50);
      if (point !== "api-spawn") { lease = { ...lease, status: "RUNNING", groups: { ...lease.groups, [role]: { role, pid: child.pid, pgid: child.pid, executable: node, cwd: authority.worktree, commandMarker: marker } } }; writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority); }
      if (point === "manifest-update") writeFileSync(`${authority.runtimeManifest}.next-interrupted`, "{half");
      assert.equal(await terminateAuthorityProcesses(authority, enumerateAuthorityProcesses(authority)), 0); assert.equal(enumerateAuthorityProcesses(authority).length, 0);
    }
    const impostor = spawn(node, [marker], { cwd: authority.worktree, detached: true, stdio: "ignore", env: { ...baseEnv, ROLLBACK_COMMAND_SPEC_SHA256: sha256("wrong-spec"), ROLLBACK_PROCESS_ROLE: "api" } });
    children.push(impostor); impostor.unref(); await delay(50);
    assert.throws(() => enumerateAuthorityProcesses(authority), /refusing to kill unverified authority-tagged process/u);
    try { process.kill(-impostor.pid, "SIGKILL"); } catch { /* already exited */ }
    await delay(50);
  } finally { for (const child of children) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already cleaned */ } } rmSync(temp, { recursive: true, force: true }); }
});

test("malicious PID lease and symlink output cannot kill or delete unrelated targets", async () => {
  const temp = mkdtempSync(resolve(tmpdir(), "rollback-runtime-malicious-")); let unrelated;
  try {
    const commandSpecSha256 = sha256("spec");
    const authority = resourceAuthority({ runId: "rollback-20260805T010001Z-abcdef123456", finalSha: FINAL_SHA, caseId: "homestay-dashboard", runRoot: temp, executionNonce: "d".repeat(64), commandSpecSha256 });
    mkdirSync(authority.worktree, { recursive: true }); mkdirSync(resolve(authority.runtimeManifest, ".."), { recursive: true }); const node = realpathSync(process.execPath);
    const marker = resolve(authority.worktree, "unrelated.mjs"); writeFileSync(marker, "setInterval(() => {}, 1000);\n"); unrelated = spawn(node, [marker], { cwd: authority.worktree, detached: true, stdio: "ignore", env: { PATH: process.env.PATH } }); unrelated.unref();
    let lease = initializeRuntimeLease({ authority, commandSpecSha256, expectedExecutable: node }); lease = { ...lease, groups: { api: { role: "api", pid: unrelated.pid, pgid: unrelated.pid, executable: node, cwd: authority.worktree, commandMarker: marker }, web: null } }; writeRuntimeLeaseAtomic(authority.runtimeManifest, lease, authority); readBoundRuntimeLease(authority);
    assert.equal(enumerateAuthorityProcesses(authority).length, 0); await terminateAuthorityProcesses(authority, []); assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
    const outside = resolve(temp, "outside"); mkdirSync(outside); writeFileSync(resolve(outside, "keep"), "safe"); const dist = resolve(authority.worktree, "apps/api/dist"); mkdirSync(resolve(dist, ".."), { recursive: true }); symlinkSync(outside, dist);
    assert.throws(() => cleanDeclaredBuildOutput(authority.worktree, { cleanPath: "apps/api/dist" }), /symlink/u); assert.equal(readFileSync(resolve(outside, "keep"), "utf8"), "safe");
  } finally { if (unrelated?.pid) { try { process.kill(-unrelated.pid, "SIGKILL"); } catch { /* already exited */ } } rmSync(temp, { recursive: true, force: true }); }
});
