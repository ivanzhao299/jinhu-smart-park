#!/usr/bin/env node
/** Standalone stdin-capable, local Docker read-only observation. No receipt authority. */
import { execFileSync } from "node:child_process";
import { resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const SHA = /^[0-9a-f]{40}$/u, ID = /^[0-9a-f]{64}$/u, IMAGE = /^sha256:[0-9a-f]{64}$/u;
const services = ["api", "web"];
const containerFormat = '[{{json .Id}},{{json .Image}},{{json .State.Running}},{{json .State.Paused}},{{json .State.Restarting}},{{json .State.StartedAt}},{{json .RestartCount}},{{json .Name}}]';
const imageFormat = '[{{json .Id}},{{json (index .Config.Labels "org.opencontainers.image.revision")}},{{json (index .Config.Labels "cn.jinhu.runtime.component")}}]';
export class ProductionRuntimeObservationError extends Error {
  constructor(code) { super(code); this.name = "ProductionRuntimeObservationError"; this.code = code; }
}
const fail = suffix => { throw new ProductionRuntimeObservationError(`PRODUCTION_RUNTIME_${suffix}`); };
const docker = args => execFileSync("docker", ["--host", "unix:///var/run/docker.sock", ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] });
export function observeHostWebSources(deployPath, runDocker = docker) {
  try {
    if (typeof deployPath !== "string" || !posix.isAbsolute(deployPath) || deployPath !== posix.normalize(deployPath) || deployPath.includes("\0")) fail("DEPLOY_PATH_INVALID");
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    const read = path => { if (statSync(path).size > 1024 * 1024) fail("WEB_BUILD_METADATA_INVALID"); return readFileSync(path); };
    const sourceAt = root => { const source = read(`${root}/apps/web/app/hr/employees/HrEmployeesClient.tsx`); return { sourceSha256: hash(source), managerCandidatesMarker: source.includes(Buffer.from("employeeStyles.managerCandidates")) }; };
    // Select only a literal path setting, never execute or disclose the env file.
    const envPath = `${deployPath}/.env.production`, env = read(envPath).toString("utf8");
    const match = env.match(/^(?:export\s+)?COMPOSE_FILE\s*=\s*(.*?)\s*$/mu);
    const configured = match ? match[1].replace(/^(['"])(.*)\1$/u, "$2") : `${deployPath}/infra/docker/docker-compose.prod.yml`;
    if (!configured || /[$`\r\n\0]/u.test(configured)) fail("DEPLOY_PATH_INVALID");
    const composePath = posix.resolve(deployPath, configured);
    const config = JSON.parse(runDocker(["compose", "--env-file", envPath, "-f", composePath, "config", "--format", "json"]));
    const context = config?.services?.web?.build?.context;
    if (typeof context !== "string" || !posix.isAbsolute(context) || context.includes("\0")) fail("WEB_BUILD_METADATA_INVALID");
    return { formatVersion: 1, deploymentSource: sourceAt(deployPath), buildSource: sourceAt(context),
      buildRootMatchesDeploymentRoot: realpathSync(context) === realpathSync(deployPath),
      composeFileSha256: hash(read(composePath)), buildRootSha256: hash(realpathSync(context)) };
  } catch (error) {
    if (error instanceof ProductionRuntimeObservationError) throw error;
    fail("WEB_BUILD_OBSERVATION_FAILED");
  }
}
// Hash only application code/build assets. Never inspect environment, storage,
// credentials or business rows. An image label alone does not prove build input.
export function observeEmployeeWebBuild(runDocker = docker) {
  const probe = `const fs=require('node:fs'),crypto=require('node:crypto');
const root='/app/apps/web', digest=b=>crypto.createHash('sha256').update(b).digest('hex');
let budget=24*1024*1024;
const read=p=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>8*1024*1024||(budget-=s.size)<0)throw Error('BOUNDS');return fs.readFileSync(p)};
const src=read(root+'/app/hr/employees/HrEmployeesClient.tsx');
const cssPath=root+'/app/hr/employees/employees.module.css',css=fs.existsSync(cssPath)?read(cssPath):null;
const dir=root+'/.next/static/chunks/app/hr/employees';
const chunks=fs.readdirSync(dir).filter(n=>/^page-[a-f0-9]+\\.js$/.test(n)).map(name=>{const bytes=read(dir+'/'+name);return{name,sha256:digest(bytes),managerCandidatesMarker:bytes.includes(Buffer.from('managerCandidates'))}});
if(chunks.length!==1)throw Error('CHUNK_COUNT');
console.log(JSON.stringify({formatVersion:1,artifactKind:'employee_web_build_observation',sourceSha256:digest(src),sourceManagerCandidatesMarker:src.includes(Buffer.from('employeeStyles.managerCandidates')),styleSha256:css?digest(css):null,styleManagerCandidatesMarker:css?css.includes(Buffer.from('.managerCandidates')):false,chunks}));`;
  try {
    const raw = runDocker(["exec", "jinhu-smart-park-prod-web", "node", "-e", probe]);
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 4096) fail("WEB_BUILD_METADATA_INVALID");
    const value = JSON.parse(raw);
    if (value?.formatVersion !== 1 || value?.artifactKind !== "employee_web_build_observation"
      || !ID.test(value.sourceSha256 ?? "") || !(value.styleSha256 === null || ID.test(value.styleSha256 ?? ""))
      || typeof value.sourceManagerCandidatesMarker !== "boolean" || typeof value.styleManagerCandidatesMarker !== "boolean"
      || !Array.isArray(value.chunks) || value.chunks.length !== 1
      || value.chunks.some(row => !/^page-[a-f0-9]+\.js$/u.test(row.name ?? "") || !ID.test(row.sha256 ?? "") || typeof row.managerCandidatesMarker !== "boolean")) fail("WEB_BUILD_METADATA_INVALID");
    return value;
  } catch (error) {
    if (error instanceof ProductionRuntimeObservationError) throw error;
    fail("WEB_BUILD_OBSERVATION_FAILED");
  }
}
export function observeProductionRuntimeRevision(expectedCommit, { expectedApiCommit = expectedCommit, expectedWebCommit = expectedCommit, observerCodeCommit = expectedCommit, inspectWebBuild = false, runDocker = docker, now = () => new Date() } = {}) {
  try {
    if (typeof expectedCommit !== "string" || !SHA.test(expectedCommit)) fail("EXPECTED_COMMIT_INVALID");
    if (typeof expectedApiCommit !== "string" || !SHA.test(expectedApiCommit)) fail("EXPECTED_API_COMMIT_INVALID");
    if (typeof expectedWebCommit !== "string" || !SHA.test(expectedWebCommit)) fail("EXPECTED_WEB_COMMIT_INVALID");
    if (typeof observerCodeCommit !== "string" || !SHA.test(observerCodeCommit)) fail("OBSERVER_CODE_COMMIT_INVALID");
    const call = args => {
      let result;
      try { result = runDocker(args); } catch { fail("COMMAND_FAILED"); }
      if (typeof result !== "string" || Buffer.byteLength(result) > 65536) fail("METADATA_INVALID");
      return result.trim();
    };
    const json = args => { try { return JSON.parse(call(args)); } catch (error) { if (error instanceof ProductionRuntimeObservationError) throw error; fail("METADATA_INVALID"); } };
    const inspect = (identity, service) => {
      const value = json(["container", "inspect", "--format", containerFormat, identity]);
      if (!Array.isArray(value) || value.length !== 8 || typeof value[0] !== "string" || typeof value[1] !== "string" || !ID.test(value[0]) || !IMAGE.test(value[1])
        || ![value[2], value[3], value[4]].every(item => typeof item === "boolean") || typeof value[5] !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value[5]) || !Number.isFinite(Date.parse(value[5]))
        || !Number.isSafeInteger(value[6]) || value[6] < 0 || value[7] !== `/jinhu-smart-park-prod-${service}`) fail("METADATA_INVALID");
      if (!value[2] || value[3] || value[4]) fail("CONTAINER_NOT_RUNNING");
      return { containerId: value[0], imageId: value[1], startedAt: value[5], restartCount: value[6] };
    };
    const before = services.map(service => ({ service, ...inspect(`jinhu-smart-park-prod-${service}`, service) }));
    const observations = before.map(item => {
      const identity = inspect(item.containerId, item.service);
      if (JSON.stringify(identity) !== JSON.stringify({ containerId: item.containerId, imageId: item.imageId, startedAt: item.startedAt, restartCount: item.restartCount })) fail("CONTAINER_CHANGED");
      // Read the immutable IMAGE object, never overrideable container labels/tags.
      const image = json(["image", "inspect", "--format", imageFormat, item.imageId]);
      if (!Array.isArray(image) || image.length !== 3 || image[0] !== item.imageId || image[2] !== item.service) fail("IMAGE_METADATA_INVALID");
      if (typeof image[1] !== "string" || !SHA.test(image[1])) fail("REVISION_UNAVAILABLE");
      const expectedRevision = item.service === "api" ? expectedApiCommit : expectedWebCommit;
      if (image[1] !== expectedRevision) fail("REVISION_MISMATCH");
      const destinations = call(["container", "inspect", "--format", "{{range .Mounts}}{{json .Destination}}{{println}}{{end}}", item.containerId]);
      for (const line of destinations ? destinations.split("\n") : []) {
        let path; try { path = JSON.parse(line); } catch { fail("MOUNT_METADATA_INVALID"); }
        if (typeof path !== "string" || !path.startsWith("/") || path !== posix.normalize(path) || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) fail("MOUNT_METADATA_INVALID");
        // Only destinations are requested; never inspect or expose host Source.
        if (path === "/" || path === "/app" || path.startsWith("/app/")) fail("APPLICATION_MOUNT_OVERRIDE");
      }
      return { ...item, revision: image[1] };
    });
    const webBuild = inspectWebBuild ? observeEmployeeWebBuild(runDocker) : null;
    for (const item of before) {
      const after = inspect(`jinhu-smart-park-prod-${item.service}`, item.service);
      if (after.containerId !== item.containerId || after.imageId !== item.imageId || after.startedAt !== item.startedAt || after.restartCount !== item.restartCount) fail("CONTAINER_CHANGED");
    }
    const observedAt = now().toISOString();
    return { formatVersion: 2, artifactKind: "jinhu_production_runtime_image_observation", status: "PASS", expectedApiCommit, expectedWebCommit, observerCodeCommit,
      observedAt, observations, ...(webBuild ? { webBuild } : {}), evidenceScope: "running_container_image_revisions", productionImport: "HOLD", authorizationGranted: false };
  } catch (error) {
    if (error instanceof ProductionRuntimeObservationError) throw error;
    fail("OBSERVATION_FAILED");
  }
}
if (process.argv[1] === "-" || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const values = new Map();
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      if (!["--expected-commit", "--expected-api-commit", "--expected-web-commit", "--observer-code-commit", "--deploy-path"].includes(flag)
        || values.has(flag) || typeof args[i + 1] !== "string" || args[i + 1].startsWith("--")) fail("ARGUMENT_INVALID");
      values.set(flag, args[i + 1]);
    }
    const expectedCommit = values.get("--expected-commit");
    if (!expectedCommit) fail("ARGUMENT_INVALID");
    const observation = observeProductionRuntimeRevision(expectedCommit, {
      expectedApiCommit: values.get("--expected-api-commit") ?? expectedCommit,
      expectedWebCommit: values.get("--expected-web-commit") ?? expectedCommit,
      observerCodeCommit: values.get("--observer-code-commit") ?? expectedCommit,
      inspectWebBuild: true,
    });
    if (values.has("--deploy-path")) observation.hostWebBuild = observeHostWebSources(values.get("--deploy-path"));
    process.stdout.write(JSON.stringify(observation) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionRuntimeObservationError ? error.code : "PRODUCTION_RUNTIME_OBSERVATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
