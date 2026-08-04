import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

function files(root) {
  const result = [];
  const visit = (path) => {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`symlink in production artifact: ${path}`);
    if (info.isDirectory()) for (const name of readdirSync(path)) visit(resolve(path, name));
    else if (info.isFile()) result.push(path);
  };
  visit(root);
  return result.sort();
}

function digestArtifact(paths) {
  const hash = createHash("sha256");
  for (const path of paths) hash.update(path).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
}

export function proveBuildFlags({ worktree, expectedValue = "false", env = process.env }) {
  if (!new Set(["true", "false"]).has(expectedValue)) throw new Error("expected build flag must be true or false");
  const expected = ["PROPERTY_OFFLINE_DRAFTS_V1", "PROPERTY_UPLOAD_QUEUE_V1", "NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1", "NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1"];
  for (const name of expected) if (env[name] !== expectedValue) throw new Error(`flags proof requires ${name}=${expectedValue}`);
  const artifactRoot = resolve(worktree, "apps/web/.next");
  const paths = files(artifactRoot);
  if (paths.length < 10 || !paths.includes(resolve(artifactRoot, "BUILD_ID"))) throw new Error("clean production build artifact is incomplete");
  const required = JSON.parse(readFileSync(resolve(artifactRoot, "required-server-files.json"), "utf8"));
  const buildEnv = required?.config?.env;
  if (buildEnv?.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 !== expectedValue || buildEnv?.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 !== expectedValue) throw new Error(`Next authoritative build manifest does not freeze both public property flags to ${expectedValue}`);
  const routes = JSON.parse(readFileSync(resolve(artifactRoot, "routes-manifest.json"), "utf8"));
  const apiTarget = `http://127.0.0.1:${env.ROLLBACK_API_PORT}`;
  const rewrites = [...(routes.rewrites?.beforeFiles ?? []), ...(routes.rewrites?.afterFiles ?? []), ...(routes.rewrites?.fallback ?? [])];
  if (!rewrites.some(({ destination }) => typeof destination === "string" && destination.startsWith(`${apiTarget}/api/`))) throw new Error("Next routes manifest is not bound to the authority API port");
  return { status: "PASS", expectedValue, buildIdSha256: createHash("sha256").update(readFileSync(resolve(artifactRoot, "BUILD_ID"))).digest("hex"), artifactSha256: digestArtifact(paths), files: paths.length, rewriteTarget: apiTarget, manifestFlags: { NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: buildEnv.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1, NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: buildEnv.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 } };
}

function parse(argv) {
  if (argv.length !== 4 || argv[0] !== "--worktree" || argv[2] !== "--expected") throw new Error("usage: flags-proof.mjs --worktree <path> --expected <true|false>");
  return { worktree: argv[1], expectedValue: argv[3] };
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(`${JSON.stringify(proveBuildFlags(parse(process.argv.slice(2))))}\n`);
