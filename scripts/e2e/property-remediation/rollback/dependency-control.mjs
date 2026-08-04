import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { execFileBounded, TIMEOUTS } from "./timeout.mjs";
import { repoRoot } from "./lib.mjs";
import { typescriptTestEnvironment } from "./command-spec.mjs";

const INSTALL_TIMEOUT = 10 * 60_000;

export function resolvePnpmJsCli() {
  const candidate = resolve(dirname(realpathSync(process.execPath)), "../lib/node_modules/corepack/dist/pnpm.js");
  const path = realpathSync(candidate);
  if (!lstatSync(path).isFile()) throw new Error("absolute pnpm JS CLI is unavailable");
  return path;
}

function inside(parent, child) {
  const delta = relative(realpathSync(parent), realpathSync(child));
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== "..");
}

async function pnpm(args, cwd, signal, timeout = TIMEOUTS.command) {
  const node = realpathSync(process.execPath);
  return execFileBounded(node, [resolvePnpmJsCli(), ...args], { cwd, env: { PATH: `${dirname(node)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: "C.UTF-8", TZ: "UTC", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" } }, { timeout, label: `pnpm ${args[0]}`, signal });
}

export async function materializeWorktreeDependencies({ worktree, signal }) {
  const version = (await pnpm(["--version"], worktree, signal, TIMEOUTS.probe)).stdout.trim();
  if (version !== "9.12.0") throw new Error(`pnpm version differs from packageManager: ${version}`);
  await pnpm(["install", "--offline", "--frozen-lockfile"], worktree, signal, INSTALL_TIMEOUT);
  const { stdout } = await pnpm(["store", "path", "--silent"], worktree, signal, TIMEOUTS.probe);
  const store = realpathSync(stdout.trim());
  const virtualStore = realpathSync(resolve(worktree, "node_modules/.pnpm"));
  const entries = {
    tsc: resolve(worktree, "node_modules/typescript/bin/tsc"),
    tsNodeRegister: resolve(worktree, "apps/api/node_modules/ts-node/register/index.js"),
    next: resolve(worktree, "apps/web/node_modules/next/dist/bin/next")
  };
  for (const [name, path] of Object.entries(entries)) {
    if (!existsSync(path) || !inside(virtualStore, path)) throw new Error(`${name} dependency does not resolve inside the trusted pnpm virtual store`);
  }
  return { pnpmVersion: version, pnpmCli: resolvePnpmJsCli(), pnpmCliSha256: (await import("./lib.mjs")).hashFile(resolvePnpmJsCli()).sha256, store, virtualStore, entries: Object.fromEntries(Object.entries(entries).map(([name, path]) => [name, realpathSync(path)])) };
}

async function git(args, cwd, signal) {
  return execFileBounded("/usr/bin/git", args, { cwd, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" } }, { timeout: TIMEOUTS.git, label: `dependency probe git ${args[0]}`, signal });
}

const SPARSE_PATTERNS = [
  "/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/tsconfig.json", "/tsconfig.base.json",
  "/apps/api/", "/apps/web/", "/packages/shared/", "/packages/ui/", "/packages/config/",
  "/scripts/e2e/property-remediation/evidence/"
];

export async function addSparseWorktree({ worktree, finalSha, signal }) {
  let registered = false;
  try {
    await git(["worktree", "add", "--no-checkout", "--detach", worktree, finalSha], repoRoot, signal); registered = true;
    await git(["sparse-checkout", "set", "--no-cone", ...SPARSE_PATTERNS], worktree, signal);
    await git(["checkout", "--detach", finalSha], worktree, signal);
  } catch (error) {
    if (registered) await git(["worktree", "remove", "--force", worktree], repoRoot, signal).catch(() => {});
    throw error;
  }
}

export async function probeDependencyWorktree({ finalSha, signal }) {
  const probeRoot = resolve(repoRoot, "artifacts/property-remediation");
  mkdirSync(probeRoot, { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(resolve(probeRoot, "rollback-dependency-probe-"));
  const worktree = resolve(temp, "worktree");
  let added = false;
  try {
    await addSparseWorktree({ worktree, finalSha, signal }); added = true;
    const dependency = await materializeWorktreeDependencies({ worktree, signal });
    const node = realpathSync(process.execPath);
    const env = { PATH: `${dirname(node)}:/usr/bin:/bin`, LANG: "C.UTF-8", TZ: "UTC" };
    await execFileBounded(node, [dependency.entries.tsc, "--showConfig", "-p", resolve(worktree, "apps/api/tsconfig.build.json")], { cwd: worktree, env }, { timeout: TIMEOUTS.command, label: "API tsc showConfig", signal });
    await execFileBounded(node, [dependency.entries.tsc, "--showConfig", "-p", resolve(worktree, "apps/web/tsconfig.json")], { cwd: worktree, env }, { timeout: TIMEOUTS.command, label: "Web tsc showConfig", signal });
    await execFileBounded(node, ["--require", dependency.entries.tsNodeRegister, "--eval", "process.stdout.write('ts-node-load-ok')"], { cwd: worktree, env }, { timeout: TIMEOUTS.probe, label: "ts-node load", signal });
    await execFileBounded(node, [dependency.entries.tsc, "-p", resolve(worktree, "packages/shared/tsconfig.json")], { cwd: worktree, env }, { timeout: TIMEOUTS.command, label: "shared build", signal });
    await execFileBounded(node, ["--test", "--require", dependency.entries.tsNodeRegister, resolve(worktree, "apps/api/src/modules/property-operations/property-occupancy.port.spec.ts")], { cwd: worktree, env: { ...env, NODE_ENV: "test", ...typescriptTestEnvironment(worktree, "apps/api/tsconfig.json") } }, { timeout: TIMEOUTS.command, label: "API ts-node test", signal });
    await execFileBounded(node, ["--test", "--require", dependency.entries.tsNodeRegister, resolve(worktree, "apps/web/features/property-shared/offline/property-reliability-flags.spec.ts"), resolve(worktree, "apps/web/features/property-shared/offline/property-draft-store.spec.ts"), resolve(worktree, "apps/web/features/property-shared/offline/property-upload-queue.spec.ts")], { cwd: worktree, env: { ...env, NODE_ENV: "test", ...typescriptTestEnvironment(worktree, "apps/web/tsconfig.json"), PROPERTY_OFFLINE_DRAFTS_V1: "false", PROPERTY_UPLOAD_QUEUE_V1: "false", NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: "false", NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: "false" } }, { timeout: TIMEOUTS.command, label: "Web ts-node tests", signal });
    const configLoader = pathToFileURL(resolve(dirname(dependency.entries.next), "../server/config.js")).href;
    const phaseModule = pathToFileURL(resolve(dirname(dependency.entries.next), "../shared/lib/constants.js")).href;
    const script = `import * as configModule from ${JSON.stringify(configLoader)}; import { PHASE_PRODUCTION_BUILD } from ${JSON.stringify(phaseModule)}; const loadConfig=configModule.default?.default??configModule.default; const c=await loadConfig(PHASE_PRODUCTION_BUILD,${JSON.stringify(resolve(worktree, "apps/web"))}); if(!Array.isArray(await c.rewrites())) throw new Error('next rewrites missing');`;
    await execFileBounded(node, ["--input-type=module", "--eval", script], { cwd: resolve(worktree, "apps/web"), env: { ...env, NEXT_PUBLIC_API_TARGET: "http://127.0.0.1:39999", PROPERTY_OFFLINE_DRAFTS_V1: "false", PROPERTY_UPLOAD_QUEUE_V1: "false" } }, { timeout: TIMEOUTS.command, label: "Next production config load", signal });
    return { status: "PASS", probes: ["pnpm-offline-frozen", "api-tsc-showConfig", "web-tsc-showConfig", "ts-node-load", "shared-build", "api-ts-node-test", "web-ts-node-tests", "next-production-config"], pnpmCliSha256: dependency.pnpmCliSha256 };
  } finally {
    if (added) await git(["worktree", "remove", "--force", worktree], repoRoot, signal).catch(() => {});
    if (existsSync(temp)) rmSync(temp, { recursive: true, force: true });
  }
}
