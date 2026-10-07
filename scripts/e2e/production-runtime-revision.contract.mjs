import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, realpathSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { observeProductionRuntimeRevision as observe } from "../diagnose-production-runtime-revision.mjs";

const root = resolve(import.meta.dirname, "../.."), commit = "a".repeat(40), old = "b".repeat(40);
const read = path => readFileSync(join(root, path), "utf8");
test("narrow deploy transfers every manifest entry even when SSH would drain stdin", t => {
  const dir = mkdtempSync(join(tmpdir(), "narrow-transfer-stdin-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin"), log = join(dir, "transfers.log"), manifest = join(dir, "manifest");
  mkdirSync(bin);
  // Reproduce OpenSSH's default behavior: a foreground SSH process forwards
  // inherited stdin even when its remote mkdir command never reads those bytes.
  writeFileSync(join(bin, "ssh"), '#!/bin/sh\nif [ "${1-}" != "-n" ]; then cat >/dev/null; fi\n', { mode: 0o700 });
  writeFileSync(join(bin, "rsync"), '#!/bin/sh\nprintf "transfer\\n" >> "$TEST_LOG"\n', { mode: 0o700 });
  const match = read(".github/workflows/deploy-production.yml").match(/while IFS=: read -r kind path; do[\s\S]*?done < "\$manifest"/u);
  assert.ok(match, "actual production transfer loop is present");
  const run = loop => {
    writeFileSync(log, "");
    const content = spawnSync(process.execPath, ["scripts/production-deploy-transfer-manifest.mjs", "web"], { cwd: root, encoding: "utf8" });
    assert.equal(content.status, 0);
    writeFileSync(manifest, content.stdout);
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", loop], { cwd: root, encoding: "utf8", env: {
      PATH: `${bin}:${process.env.PATH}`, TEST_LOG: log, manifest, SSH_OPTS: "",
      PROD_SSH_USER: "synthetic", PROD_SSH_HOST: "synthetic", PROD_DEPLOY_PATH: "/synthetic/deploy",
    } });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(log, "utf8").trim().split("\n").length;
  };
  const legacy = match[0].replace("ssh -n $SSH_OPTS", "ssh $SSH_OPTS");
  assert.equal(run(legacy), 1, "unfixed loop silently transfers only the release marker");
  assert.equal(run(match[0]), 5, "fixed loop transfers the marker and all four Web/package directories");
});
function fake(change = () => {}, revisions = { api: commit, web: commit }) {
  const names = new Map(), ids = { api: "1".repeat(64), web: "2".repeat(64) }, calls = [];
  return { calls, now: () => new Date("2026-09-06T01:00:00Z"), runDocker: args => {
    calls.push(args); const identity = args.at(-1), service = identity.includes("api") || identity === ids.api || identity === `sha256:${"3".repeat(64)}` ? "api" : "web";
    const imageId = `sha256:${(service === "api" ? "3" : "4").repeat(64)}`;
    if (args[0] === "image") {
      assert.match(identity, /^sha256:[0-9a-f]{64}$/u);
      const value = [imageId, revisions[service], service]; change({ type: "image", service, value, args }); return JSON.stringify(value);
    }
    assert.equal(args[0], "container"); assert.equal(args[1], "inspect");
    if (args[3].includes(".Mounts")) {
      assert.match(identity, /^[0-9a-f]{64}$/u);
      const value = service === "api" ? ["/var/lib/jinhu/files"] : [];
      change({ type: "mount", service, value, args }); return value.map(value => JSON.stringify(value)).join("\n");
    }
    assert.ok(args[3].includes(".State.Running")); assert.ok(!args[3].includes(".Config.Labels"));
    if (identity.startsWith("jinhu-")) names.set(service, (names.get(service) ?? 0) + 1);
    const value = [ids[service], imageId, true, false, false, "2026-09-06T00:00:00.123456789Z", 0, `/jinhu-smart-park-prod-${service}`];
    change({ type: "container", service, value, args, final: identity.startsWith("jinhu-") && names.get(service) === 2 }); return JSON.stringify(value);
  } };
}
const rejects = (options, code, expected = {}) => assert.throws(() => observe(commit, { ...options, ...expected }), error => error.code === `PRODUCTION_RUNTIME_${code}` && error.message === error.code);
test("observes exact immutable image labels through full container IDs with read-only stable identities", () => {
  const options = fake(), result = observe(commit, options);
  assert.equal(result.status, "PASS"); assert.equal(result.formatVersion, 2); assert.equal(result.productionImport, "HOLD"); assert.equal(result.authorizationGranted, false);
  assert.equal(result.expectedApiCommit, commit); assert.equal(result.expectedWebCommit, commit); assert.equal(result.observerCodeCommit, commit);
  assert.deepEqual(result.observations.map(row => row.revision), [commit, commit]);
  assert.equal(result.evidenceScope, "running_container_image_revisions");
  assert.ok(options.calls.every(args => ["container", "image"].includes(args[0]) && args[1] === "inspect"));
  assert.equal(options.calls.filter(args => args[0] === "image").length, 2);
  assert.ok(options.calls.every(args => !args.join(" ").includes(".Env") && !args.join(" ").includes(".Source")));
  assert.equal(Object.hasOwn(result, "runtimeCodeSha"), false); assert.equal(Object.hasOwn(result, "expiresAt"), false);
});
test("accepts explicit mixed service revisions and reports observer code separately", () => {
  const options = fake(() => {}, { api: old, web: commit });
  const result = observe(commit, { ...options, expectedApiCommit: old, expectedWebCommit: commit, observerCodeCommit: "c".repeat(40) });
  assert.equal(result.status, "PASS"); assert.equal(result.formatVersion, 2);
  assert.equal(result.expectedApiCommit, old); assert.equal(result.expectedWebCommit, commit);
  assert.equal(result.observerCodeCommit, "c".repeat(40));
  assert.deepEqual(result.observations.map(row => row.revision), [old, commit]);
  assert.equal(result.productionImport, "HOLD"); assert.equal(result.authorizationGranted, false);
});
test("omitted per-service expectations keep the original strict same-commit comparison", () => {
  for (const service of ["api", "web"]) rejects(fake(() => {}, { api: service === "api" ? old : commit, web: service === "web" ? old : commit }), "REVISION_MISMATCH");
});
for (const [name, options, code] of [
  ["stale API", { expectedApiCommit: old }, "REVISION_MISMATCH"],
  ["stale Web", { expectedWebCommit: old }, "REVISION_MISMATCH"],
  ["malformed API expectation", { expectedApiCommit: "ABC" }, "EXPECTED_API_COMMIT_INVALID"],
  ["malformed Web expectation", { expectedWebCommit: "$(touch /tmp/nope)" }, "EXPECTED_WEB_COMMIT_INVALID"],
  ["malformed observer revision", { observerCodeCommit: "x" }, "OBSERVER_CODE_COMMIT_INVALID"],
]) test(`rejects ${name}`, () => rejects(fake(), code, options));
for (const [name, change, code] of [
  ["mixed narrow revision", ({ type, service, value }) => { if (type === "image" && service === "web") value[1] = old; }, "REVISION_MISMATCH"],
  ["missing label", ({ type, value }) => { if (type === "image") value[1] = null; }, "REVISION_UNAVAILABLE"],
  ["empty development label", ({ type, value }) => { if (type === "image") value[1] = ""; }, "REVISION_UNAVAILABLE"],
  ["malformed label", ({ type, value }) => { if (type === "image") value[1] = "not-a-commit"; }, "REVISION_UNAVAILABLE"],
  ["wrong immutable image", ({ type, value }) => { if (type === "image") value[0] = `sha256:${"9".repeat(64)}`; }, "IMAGE_METADATA_INVALID"],
  ["wrong component", ({ type, value }) => { if (type === "image") value[2] = "other"; }, "IMAGE_METADATA_INVALID"],
  ["stopped", ({ type, value }) => { if (type === "container") value[2] = false; }, "CONTAINER_NOT_RUNNING"],
  ["paused", ({ type, value }) => { if (type === "container") value[3] = true; }, "CONTAINER_NOT_RUNNING"],
  ["restarting", ({ type, value }) => { if (type === "container") value[4] = true; }, "CONTAINER_NOT_RUNNING"],
  ["replacement", ({ final, value }) => { if (final) value[0] = "5".repeat(64); }, "CONTAINER_CHANGED"],
  ["image replacement", ({ final, value }) => { if (final) value[1] = `sha256:${"5".repeat(64)}`; }, "CONTAINER_CHANGED"],
  ["restart across observation", ({ final, value }) => { if (final) value[6]++; }, "CONTAINER_CHANGED"],
  ["malformed metadata", ({ type, value }) => { if (type === "container") value[0] = "short"; }, "METADATA_INVALID"],
  ["app bind mount", ({ type, value }) => { if (type === "mount") value.push("/app"); }, "APPLICATION_MOUNT_OVERRIDE"],
  ["app code volume", ({ type, value }) => { if (type === "mount") value.push("/app/apps/api/dist"); }, "APPLICATION_MOUNT_OVERRIDE"],
  ["root overlay", ({ type, value }) => { if (type === "mount") value.push("/"); }, "APPLICATION_MOUNT_OVERRIDE"],
  ["mount path aliases", ({ type, value }) => { if (type === "mount") value.push("//app"); }, "MOUNT_METADATA_INVALID"],
]) test(`rejects ${name}`, () => rejects(fake(change), code));

test("command, JSON and argument failures expose only stable codes", () => {
  rejects({ runDocker: () => { throw new Error("sensitive command credential path"); } }, "COMMAND_FAILED");
  rejects({ runDocker: () => "sensitive invalid JSON" }, "METADATA_INVALID");
  rejects({ runDocker: () => "x".repeat(65537) }, "METADATA_INVALID");
  assert.throws(() => observe("wrong", fake()), { code: "PRODUCTION_RUNTIME_EXPECTED_COMMIT_INVALID" });
});

test("actual standalone and SSH-stdin CLIs suppress subprocess sensitive stderr", t => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-revision-synthetic-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "docker"), "#!/bin/sh\nprintf 'sensitive stderr value\\n' >&2\nexit 12\n", { mode: 0o700 });
  for (const stdin of [false, true]) {
    const result = spawnSync(process.execPath, stdin ? ["--input-type=module", "-", "--expected-commit", commit, "--expected-api-commit", old, "--expected-web-commit", commit, "--observer-code-commit", "c".repeat(40)] : [join(root, "scripts/diagnose-production-runtime-revision.mjs"), "--expected-commit", commit],
      { input: stdin ? read("scripts/diagnose-production-runtime-revision.mjs") : undefined, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, "PRODUCTION_RUNTIME_COMMAND_FAILED\n");
  }
  for (const [args, stderr] of [
    [["--expected-commit", commit, "--expected-commit", old], "PRODUCTION_RUNTIME_ARGUMENT_INVALID\n"],
    [["--expected-commit", commit, "--unknown", old], "PRODUCTION_RUNTIME_ARGUMENT_INVALID\n"],
    [["--expected-commit", commit, "--expected-api-commit"], "PRODUCTION_RUNTIME_ARGUMENT_INVALID\n"],
    [["--expected-commit", "$(touch /tmp/runtime-revision-injected)"], "PRODUCTION_RUNTIME_EXPECTED_COMMIT_INVALID\n"],
  ]) {
    const result = spawnSync(process.execPath, [join(root, "scripts/diagnose-production-runtime-revision.mjs"), ...args], { encoding: "utf8" });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, stderr);
  }
});

test("build argument is frozen before env load, correct for full/narrow builds and absent for non-build modes", t => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "runtime-build-synthetic-")));
  const dir = join(parent,"deploy"); mkdirSync(dir);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  mkdirSync(join(dir, "scripts")); mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "scripts/prod-deploy.sh"), read("scripts/prod-deploy.sh"));
  mkdirSync(join(dir,"scripts/hr-cutover"));
  writeFileSync(join(dir,"scripts/hr-cutover/ensure-profile-private-root.mjs"),read("scripts/hr-cutover/ensure-profile-private-root.mjs"));
  for (const name of ["db-migrate", "diagnose-000189-asset-scope", "repair-000194-retired-runtime-owner", "diagnose-000194-runtime-control", "prod-healthcheck", "prod-docker-cleanup"]) writeFileSync(join(dir, `scripts/${name}.sh`), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  writeFileSync(join(dir, "bin/docker"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$TEST_LOG\"\n", { mode: 0o700 });
  const envPath = join(dir, "synthetic.env"); writeFileSync(envPath, `RELEASE_COMMIT=${old}\nRUN_PRODUCTION_SEED=no\n`);
  for (const mode of ["full", "api", "web", "database"]) for (const supplied of [commit, ""]) {
    const log = join(dir, `${mode}-${supplied || "none"}.log`);
    const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, ENV_FILE: envPath, COMPOSE_FILE: join(dir, "unused.yml"), TEST_LOG: log, PROD_DEPLOY_MODE: mode, RELEASE_COMMIT: supplied, PRUNE_DOCKER_AFTER_DEPLOY: "no" };
    const result = spawnSync("sh", [join(dir, "scripts/prod-deploy.sh")], { encoding: "utf8", env }); assert.equal(result.status, 0, result.stderr);
    assert.equal(lstatSync(join(parent,".jinhu-hr-private-profile-input")).mode & 0o777,0o700);
    const commands = readFileSync(log, "utf8"), builds = commands.split("\n").filter(line => line.includes(" build "));
    assert.equal(builds.length, mode === "database" ? 0 : 1);
    if (builds.length) { assert.ok(builds[0].endsWith(`--build-arg RELEASE_COMMIT=${supplied}`)); assert.ok(!builds[0].includes(old)); }
  }
  const invalid = spawnSync("sh", [join(dir, "scripts/prod-deploy.sh")], { encoding: "utf8", env: { ...process.env, RELEASE_COMMIT: "sensitive-invalid" } });
  assert.equal(invalid.status, 1); assert.equal(invalid.stderr, "PRODUCTION_RELEASE_COMMIT_INVALID\n");
});

test("Docker runtime labels and production diagnose routing preserve read-only and rollback boundaries", () => {
  for (const service of ["api", "web"]) {
    const file = read(`infra/docker/Dockerfile.${service}`).split("FROM node:22-bookworm-slim AS runtime")[1];
    assert.match(file, /ARG RELEASE_COMMIT=\n/); assert.ok(file.includes('!/^[0-9a-f]{40}$/.test(v)'));
    assert.ok(file.includes(`LABEL org.opencontainers.image.revision="$RELEASE_COMMIT" cn.jinhu.runtime.component="${service}"`));
  }
  const workflow = read(".github/workflows/deploy-production.yml"), mode = "diagnose-production-runtime-revision";
  assert.ok(workflow.includes(`- ${mode}`)); assert.ok(workflow.includes(`${mode}|diagnose-000189-scope`));
  assert.match(workflow, /group: deploy-production\n {2}cancel-in-progress: false/);
  const validation = workflow.slice(workflow.indexOf("      - name: Validate runtime revision expectations"), workflow.indexOf("      - name: Start SSH agent"));
  assert.ok(validation.length > 0); assert.ok(workflow.indexOf("Validate runtime revision expectations") < workflow.indexOf("Start SSH agent"));
  assert.match(validation, /inputs\.expected_api_commit/); assert.match(validation, /inputs\.expected_web_commit/);
  assert.match(validation, /\$\{EXPECTED_API_COMMIT_INPUT:-\$GITHUB_SHA\}/); assert.match(validation, /\$\{EXPECTED_WEB_COMMIT_INPUT:-\$GITHUB_SHA\}/);
  assert.ok(validation.includes('[ "${#1}" -eq 40 ]')); assert.ok(validation.includes("*[!0123456789abcdef]*")); assert.doesNotMatch(validation, /grep\s+-Eq/u); assert.match(validation, /\$GITHUB_OUTPUT/);
  const diagnostic = workflow.slice(workflow.indexOf("      - name: Diagnose production runtime image revisions"), workflow.indexOf("      - name: Diagnose 000189"));
  assert.match(diagnostic, /--expected-api-commit '\$EXPECTED_API_COMMIT'/); assert.match(diagnostic, /--expected-web-commit '\$EXPECTED_WEB_COMMIT'/);
  assert.match(diagnostic, /--observer-code-commit '\$OBSERVER_CODE_COMMIT'/);
  assert.match(diagnostic, /case "\$runtime_error" in/); assert.match(diagnostic, /actions\/upload-artifact@v6/);
  assert.doesNotMatch(diagnostic, /(?:rsync|\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|docker (?:build|create|up|restart|prune))/);
  for (const step of workflow.split("      - name: ").slice(1)) if (["Resolve deployment mode", "Enforce verified deployment scope", "Ensure required production secrets", "Enforce 000189", "Repair retired", "Enforce 000194", "Write release marker", "Deploy\n", "Verify protected"].some(name => step.startsWith(name))) assert.ok(step.split("\n")[1].includes(`inputs.deploy_mode != '${mode}'`), step.split("\n")[0]);
  assert.match(workflow, /build api web --build-arg RELEASE_COMMIT=;/);
  assert.match(workflow, /RELEASE_COMMIT='\$GITHUB_SHA' PROD_DEPLOY_MODE=/);
  const collector = read("scripts/diagnose-production-runtime-revision.mjs");
  assert.ok(collector.includes('"--host", "unix:///var/run/docker.sock"')); assert.doesNotMatch(collector, /\.release\.json|\.Config\.Env|\.Source/);
});

test("workflow validates runtime overrides before any SSH and defaults omitted values to observer SHA", () => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-revision-inputs-"));
  try {
    const workflow = read(".github/workflows/deploy-production.yml");
    const step = workflow.slice(workflow.indexOf("      - name: Validate runtime revision expectations"), workflow.indexOf("      - name: Start SSH agent"));
    const script = step.split("        run: |\n")[1].split("\n").map(line => line.replace(/^ {10}/u, "")).join("\n");
    const run = (api = "", web = "", observer = commit) => {
      const output = join(dir, "github-output"); writeFileSync(output, "");
      return { output, result: spawnSync("sh", ["-s"], { cwd: root, input: script, encoding: "utf8", env: { ...process.env,
        GITHUB_SHA: observer, GITHUB_OUTPUT: output, EXPECTED_API_COMMIT_INPUT: api, EXPECTED_WEB_COMMIT_INPUT: web } }) };
    };
    let { output, result } = run();
    assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync(output, "utf8"), `api=${commit}\nweb=${commit}\nobserver=${commit}\n`);
    ({ output, result } = run(old, commit, "c".repeat(40)));
    assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync(output, "utf8"), `api=${old}\nweb=${commit}\nobserver=${"c".repeat(40)}\n`);
    for (const [api, web, observer, expected] of [
      ["ABC", "", commit, "PRODUCTION_RUNTIME_EXPECTED_API_COMMIT_INVALID\n"],
      ["", "$(touch /tmp/runtime-revision-injected)", commit, "PRODUCTION_RUNTIME_EXPECTED_WEB_COMMIT_INVALID\n"],
      [`${commit}\n' --observer-code-commit '${old}`, "", commit, "PRODUCTION_RUNTIME_EXPECTED_API_COMMIT_INVALID\n"],
      [`${commit}\n${old}`, "", commit, "PRODUCTION_RUNTIME_EXPECTED_API_COMMIT_INVALID\n"],
      ["", "", "bad-observer", "PRODUCTION_RUNTIME_OBSERVER_CODE_COMMIT_INVALID\n"],
    ]) {
      ({ output, result } = run(api, web, observer));
      assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, expected); assert.equal(readFileSync(output, "utf8"), "");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("malformed multiline and quote-bearing workflow values never reach SSH", () => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-revision-ssh-boundary-"));
  try {
    const workflow = read(".github/workflows/deploy-production.yml");
    const validation = workflow.slice(workflow.indexOf("      - name: Validate runtime revision expectations"), workflow.indexOf("      - name: Start SSH agent"));
    const script = validation.split("        run: |\n")[1].split("\n").map(line => line.replace(/^ {10}/u, "")).join("\n");
    const diagnostic = workflow.slice(workflow.indexOf("      - name: Diagnose production runtime image revisions"), workflow.indexOf("      - name: Retain production runtime image observation"));
    const diagnosticScript = diagnostic.split("        run: |\n")[1].split("\n").map(line => line.replace(/^ {10}/u, "")).join("\n");
    const sshPath = join(dir, "ssh"), marker = join(dir, "ssh-called");
    writeFileSync(sshPath, `#!/bin/sh\nprintf called > '${marker}'\nexit 99\n`, { mode: 0o700 });
    for (const api of [`${commit}\n${old}`, `${commit}\n' --observer-code-commit '${old}`]) {
      const output = join(dir, "github-output"); writeFileSync(output, "");
      const result = spawnSync("sh", ["-c", "set -e; sh -s <<'VALIDATE'\n" + script + "\nVALIDATE\nsh -s <<'DIAGNOSE'\n" + diagnosticScript + "\nDIAGNOSE\n"], {
        cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
          GITHUB_SHA: commit, GITHUB_OUTPUT: output, EXPECTED_API_COMMIT_INPUT: api, EXPECTED_WEB_COMMIT_INPUT: "",
          EXPECTED_API_COMMIT: "", EXPECTED_WEB_COMMIT: "", OBSERVER_CODE_COMMIT: "", PROD_SSH_HOST: "synthetic-host",
          PROD_SSH_USER: "synthetic-user", PROD_SSH_PORT: "22" },
      });
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "PRODUCTION_RUNTIME_EXPECTED_API_COMMIT_INVALID\n");
      assert.equal(existsSync(marker), false);
      assert.equal(readFileSync(output, "utf8"), "");
    }
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("actual diagnose shell preserves only a complete allowlisted collector code, never raw SSH stderr", t => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-diagnose-synthetic-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "ssh"), "#!/bin/sh\nprintf '%s\\n' \"$TEST_REMOTE_STDERR\" >&2\nexit 1\n", { mode: 0o700 });
  const workflow = read(".github/workflows/deploy-production.yml");
  const step = workflow.slice(workflow.indexOf("      - name: Diagnose production runtime image revisions"), workflow.indexOf("      - name: Retain production runtime image observation"));
  const script = step.split("        run: |\n")[1].split("\n").map(line => line.replace(/^ {10}/u, "")).join("\n");
  for (const [stderr, expected] of [["PRODUCTION_RUNTIME_REVISION_UNAVAILABLE", "PRODUCTION_RUNTIME_REVISION_UNAVAILABLE"],
    ["PRODUCTION_RUNTIME_APPLICATION_MOUNT_OVERRIDE", "PRODUCTION_RUNTIME_APPLICATION_MOUNT_OVERRIDE"],
    ["sensitive credential host path", "PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED"],
    ["PRODUCTION_RUNTIME_COMMAND_FAILED\nsensitive credential host path", "PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED"],
    ["PRODUCTION_RUNTIME_UNREVIEWED_CODE", "PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED"]]) {
    const result = spawnSync("sh", ["-s"], { cwd: root, input: script, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
      GITHUB_SHA: commit, EXPECTED_API_COMMIT: old, EXPECTED_WEB_COMMIT: commit, OBSERVER_CODE_COMMIT: commit,
      PROD_SSH_HOST: "synthetic-host", PROD_SSH_USER: "synthetic-user", PROD_SSH_PORT: "22", TEST_REMOTE_STDERR: stderr } });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, `${expected}\n`);
  }
});
