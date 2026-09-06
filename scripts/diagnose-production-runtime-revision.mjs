#!/usr/bin/env node
/** Standalone stdin-capable, local Docker read-only observation. No receipt authority. */
import { execFileSync } from "node:child_process";
import { resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/u, ID = /^[0-9a-f]{64}$/u, IMAGE = /^sha256:[0-9a-f]{64}$/u;
const services = ["api", "web"];
const containerFormat = '[{{json .Id}},{{json .Image}},{{json .State.Running}},{{json .State.Paused}},{{json .State.Restarting}},{{json .State.StartedAt}},{{json .RestartCount}},{{json .Name}}]';
const imageFormat = '[{{json .Id}},{{json (index .Config.Labels "org.opencontainers.image.revision")}},{{json (index .Config.Labels "cn.jinhu.runtime.component")}}]';
export class ProductionRuntimeObservationError extends Error {
  constructor(code) { super(code); this.name = "ProductionRuntimeObservationError"; this.code = code; }
}
const fail = suffix => { throw new ProductionRuntimeObservationError(`PRODUCTION_RUNTIME_${suffix}`); };
const docker = args => execFileSync("docker", ["--host", "unix:///var/run/docker.sock", ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] });
export function observeProductionRuntimeRevision(expectedCommit, { runDocker = docker, now = () => new Date() } = {}) {
  try {
    if (typeof expectedCommit !== "string" || !SHA.test(expectedCommit)) fail("EXPECTED_COMMIT_INVALID");
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
      if (image[1] !== expectedCommit) fail("REVISION_MISMATCH");
      const destinations = call(["container", "inspect", "--format", "{{range .Mounts}}{{json .Destination}}{{println}}{{end}}", item.containerId]);
      for (const line of destinations ? destinations.split("\n") : []) {
        let path; try { path = JSON.parse(line); } catch { fail("MOUNT_METADATA_INVALID"); }
        if (typeof path !== "string" || !path.startsWith("/") || path !== posix.normalize(path) || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) fail("MOUNT_METADATA_INVALID");
        // Only destinations are requested; never inspect or expose host Source.
        if (path === "/" || path === "/app" || path.startsWith("/app/")) fail("APPLICATION_MOUNT_OVERRIDE");
      }
      return { ...item, revision: image[1] };
    });
    for (const item of before) {
      const after = inspect(`jinhu-smart-park-prod-${item.service}`, item.service);
      if (after.containerId !== item.containerId || after.imageId !== item.imageId || after.startedAt !== item.startedAt || after.restartCount !== item.restartCount) fail("CONTAINER_CHANGED");
    }
    const observedAt = now().toISOString();
    return { formatVersion: 1, artifactKind: "jinhu_production_runtime_image_observation", status: "PASS", expectedCommit,
      observedAt, observations, evidenceScope: "running_container_image_revisions", productionImport: "HOLD", authorizationGranted: false };
  } catch (error) {
    if (error instanceof ProductionRuntimeObservationError) throw error;
    fail("OBSERVATION_FAILED");
  }
}
if (process.argv[1] === "-" || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--expected-commit") fail("ARGUMENT_INVALID");
    process.stdout.write(JSON.stringify(observeProductionRuntimeRevision(args[1])) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionRuntimeObservationError ? error.code : "PRODUCTION_RUNTIME_OBSERVATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
