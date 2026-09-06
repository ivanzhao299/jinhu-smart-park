import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { observeProductionRuntimeRevision as observe } from "../diagnose-production-runtime-revision.mjs";

const root = resolve(import.meta.dirname, "../.."), commit = "a".repeat(40), old = "b".repeat(40);
const read = path => readFileSync(join(root, path), "utf8");
function fake(change = () => {}) {
  const names = new Map(), ids = { api: "1".repeat(64), web: "2".repeat(64) }, calls = [];
  return { calls, now: () => new Date("2026-09-06T01:00:00Z"), runDocker: args => {
    calls.push(args); const identity = args.at(-1), service = identity.includes("api") || identity === ids.api || identity === `sha256:${"3".repeat(64)}` ? "api" : "web";
    const imageId = `sha256:${(service === "api" ? "3" : "4").repeat(64)}`;
    if (args[0] === "image") {
      assert.match(identity, /^sha256:[0-9a-f]{64}$/u);
      const value = [imageId, commit, service]; change({ type: "image", service, value, args }); return JSON.stringify(value);
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
const rejects = (options, code) => assert.throws(() => observe(commit, options), error => error.code === `PRODUCTION_RUNTIME_${code}` && error.message === error.code);
test("observes exact immutable image labels through full container IDs with read-only stable identities", () => {
  const options = fake(), result = observe(commit, options);
  assert.equal(result.status, "PASS"); assert.equal(result.productionImport, "HOLD"); assert.equal(result.authorizationGranted, false);
  assert.deepEqual(result.observations.map(row => row.revision), [commit, commit]);
  assert.equal(result.evidenceScope, "running_container_image_revisions");
  assert.ok(options.calls.every(args => ["container", "image"].includes(args[0]) && args[1] === "inspect"));
  assert.equal(options.calls.filter(args => args[0] === "image").length, 2);
  assert.ok(options.calls.every(args => !args.join(" ").includes(".Env") && !args.join(" ").includes(".Source")));
  assert.equal(Object.hasOwn(result, "runtimeCodeSha"), false); assert.equal(Object.hasOwn(result, "expiresAt"), false);
});
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
    const result = spawnSync(process.execPath, stdin ? ["--input-type=module", "-", "--expected-commit", commit] : [join(root, "scripts/diagnose-production-runtime-revision.mjs"), "--expected-commit", commit],
      { input: stdin ? read("scripts/diagnose-production-runtime-revision.mjs") : undefined, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, "PRODUCTION_RUNTIME_COMMAND_FAILED\n");
  }
});

test("build argument is frozen before env load, correct for full/narrow builds and absent for non-build modes", t => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-build-synthetic-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "scripts")); mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "scripts/prod-deploy.sh"), read("scripts/prod-deploy.sh"));
  for (const name of ["db-migrate", "diagnose-000189-asset-scope", "repair-000194-retired-runtime-owner", "diagnose-000194-runtime-control", "prod-healthcheck", "prod-docker-cleanup"]) writeFileSync(join(dir, `scripts/${name}.sh`), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  writeFileSync(join(dir, "bin/docker"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$TEST_LOG\"\n", { mode: 0o700 });
  const envPath = join(dir, "synthetic.env"); writeFileSync(envPath, `RELEASE_COMMIT=${old}\nRUN_PRODUCTION_SEED=no\n`);
  for (const mode of ["full", "api", "web", "database"]) for (const supplied of [commit, ""]) {
    const log = join(dir, `${mode}-${supplied || "none"}.log`);
    const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, ENV_FILE: envPath, COMPOSE_FILE: join(dir, "unused.yml"), TEST_LOG: log, PROD_DEPLOY_MODE: mode, RELEASE_COMMIT: supplied, PRUNE_DOCKER_AFTER_DEPLOY: "no" };
    const result = spawnSync("sh", [join(dir, "scripts/prod-deploy.sh")], { encoding: "utf8", env }); assert.equal(result.status, 0, result.stderr);
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
  assert.match(workflow, /group: deploy-production\n  cancel-in-progress: false/);
  const diagnostic = workflow.slice(workflow.indexOf("      - name: Diagnose production runtime image revisions"), workflow.indexOf("      - name: Diagnose 000189"));
  assert.match(diagnostic, /node --input-type=module - --expected-commit '\$GITHUB_SHA'/);
  assert.match(diagnostic, /case "\$runtime_error" in/); assert.match(diagnostic, /actions\/upload-artifact@v6/);
  assert.doesNotMatch(diagnostic, /(?:rsync|\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|docker (?:build|create|up|restart|prune))/);
  for (const step of workflow.split("      - name: ").slice(1)) if (["Resolve deployment mode", "Enforce verified deployment scope", "Ensure required production secrets", "Enforce 000189", "Repair retired", "Enforce 000194", "Write release marker", "Deploy\n", "Verify protected"].some(name => step.startsWith(name))) assert.ok(step.split("\n")[1].includes(`inputs.deploy_mode != '${mode}'`), step.split("\n")[0]);
  assert.match(workflow, /build api web --build-arg RELEASE_COMMIT=;/);
  assert.match(workflow, /RELEASE_COMMIT='\$GITHUB_SHA' PROD_DEPLOY_MODE=/);
  const collector = read("scripts/diagnose-production-runtime-revision.mjs");
  assert.ok(collector.includes('"--host", "unix:///var/run/docker.sock"')); assert.doesNotMatch(collector, /\.release\.json|\.Config\.Env|\.Source/);
});

test("actual diagnose shell preserves only a complete allowlisted collector code, never raw SSH stderr", t => {
  const dir = mkdtempSync(join(tmpdir(), "runtime-diagnose-synthetic-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "ssh"), "#!/bin/sh\nprintf '%s\\n' \"$TEST_REMOTE_STDERR\" >&2\nexit 1\n", { mode: 0o700 });
  const workflow = read(".github/workflows/deploy-production.yml");
  const step = workflow.slice(workflow.indexOf("      - name: Diagnose production runtime image revisions"), workflow.indexOf("      - name: Retain production runtime image observation"));
  const script = step.split("        run: |\n")[1].split("\n").map(line => line.replace(/^          /u, "")).join("\n");
  for (const [stderr, expected] of [["PRODUCTION_RUNTIME_REVISION_UNAVAILABLE", "PRODUCTION_RUNTIME_REVISION_UNAVAILABLE"],
    ["PRODUCTION_RUNTIME_APPLICATION_MOUNT_OVERRIDE", "PRODUCTION_RUNTIME_APPLICATION_MOUNT_OVERRIDE"],
    ["sensitive credential host path", "PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED"],
    ["PRODUCTION_RUNTIME_COMMAND_FAILED\nsensitive credential host path", "PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED"],
    ["PRODUCTION_RUNTIME_UNREVIEWED_CODE", "PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED"]]) {
    const result = spawnSync("sh", ["-s"], { cwd: root, input: script, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
      GITHUB_SHA: commit, PROD_SSH_HOST: "synthetic-host", PROD_SSH_USER: "synthetic-user", PROD_SSH_PORT: "22", TEST_REMOTE_STDERR: stderr } });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, `${expected}\n`);
  }
});
