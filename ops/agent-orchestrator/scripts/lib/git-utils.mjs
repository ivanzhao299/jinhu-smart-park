import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { cp, mkdir, rm } from "node:fs/promises";

export const RUNTIME_DIRS = ["storage", ".next", "coverage", "tmp"];
export const QUEUE_CONFLICT_FILES = new Set([
  "ops/agent-orchestrator/queue/task-queue.json",
  "ops/agent-orchestrator/queue/task-locks.json",
  "ops/agent-orchestrator/queue/task-results.json"
]);

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio ?? "pipe"
  });

  if (result.error && !options.allowFailure) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function git(worktreePath, args, options = {}) {
  return run("git", ["-C", worktreePath, ...args], options);
}

export function gitRoot(worktreePath) {
  return git(worktreePath, ["rev-parse", "--show-toplevel"]).stdout.trim();
}

export function branchName(worktreePath) {
  return git(worktreePath, ["branch", "--show-current"]).stdout.trim();
}

export function headLine(worktreePath) {
  return git(worktreePath, ["log", "--oneline", "-1"]).stdout.trim();
}

export function statusShort(worktreePath) {
  return git(worktreePath, ["status", "--short"]).stdout;
}

export function parseStatusShort(output) {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      const renameParts = rawPath.split(" -> ");
      return {
        code: line.slice(0, 2),
        path: renameParts[renameParts.length - 1]
      };
    });
}

export function isRuntimePath(path) {
  const normalized = String(path ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
  return RUNTIME_DIRS.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

export function splitRuntimeStatus(entries) {
  const runtime = [];
  const nonRuntime = [];

  for (const entry of entries) {
    if (isRuntimePath(entry.path)) {
      runtime.push(entry);
    } else {
      nonRuntime.push(entry);
    }
  }

  return { runtime, nonRuntime };
}

export function aheadBehind(worktreePath, base = "origin/main", head = "HEAD") {
  const result = git(worktreePath, ["rev-list", "--left-right", "--count", `${base}...${head}`], {
    allowFailure: true
  });

  if (result.status !== 0) {
    return { behind: null, ahead: null, raw: result.stderr.trim() };
  }

  const [behind, ahead] = result.stdout.trim().split(/\s+/).map((value) => Number.parseInt(value, 10));
  return { behind, ahead, raw: result.stdout.trim() };
}

export function isAncestor(worktreePath, maybeAncestor, descendant = "origin/main") {
  const result = git(worktreePath, ["merge-base", "--is-ancestor", maybeAncestor, descendant], {
    allowFailure: true
  });
  return result.status === 0;
}

export function commitsNotIn(worktreePath, base = "origin/main", head = "HEAD") {
  const result = git(worktreePath, ["log", "--oneline", `${base}..${head}`], { allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function changedFilesAgainst(worktreePath, base = "origin/main", head = "HEAD") {
  const result = git(worktreePath, ["diff", "--name-only", `${base}...${head}`], { allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function changedFilesNameStatus(worktreePath, base = "origin/main", head = "HEAD") {
  const result = git(worktreePath, ["diff", "--name-status", `${base}...${head}`], { allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function headSha(worktreePath, ref = "HEAD") {
  const result = git(worktreePath, ["rev-parse", ref], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : "";
}

export function isSameHeadAsMain(agentPath, mainPath) {
  const agentHead = headSha(agentPath, "HEAD");
  const mainHead = headSha(mainPath, "HEAD");
  return Boolean(agentHead && mainHead && agentHead === mainHead);
}

export function commitsInAgentNotInLocalMain(agentPath, mainPath, head = "HEAD") {
  const mainHead = headSha(mainPath, "HEAD");
  if (!mainHead) return [];
  return commitsNotIn(agentPath, mainHead, head);
}

export function changedFilesInAgentNotInLocalMain(agentPath, mainPath, head = "HEAD") {
  const mainHead = headSha(mainPath, "HEAD");
  if (!mainHead) return [];
  return changedFilesAgainst(agentPath, mainHead, head);
}

export function changedFilesNameStatusInAgentNotInLocalMain(agentPath, mainPath, head = "HEAD") {
  const mainHead = headSha(mainPath, "HEAD");
  if (!mainHead) return [];
  return changedFilesNameStatus(agentPath, mainHead, head);
}

export function getIntegrationCandidatesAgainstLocalMain(agents, mainPath, options = {}) {
  const classifyRisk = options.classifyRisk ?? classifyAgentResultRisk;
  const mainHead = headSha(mainPath, "HEAD");
  if (!mainHead) return [];

  const candidates = [];
  for (const agent of agents) {
    const agentHead = headSha(agent.path, "HEAD");
    if (!agentHead || agentHead === mainHead) continue;

    const commits = commitsInAgentNotInLocalMain(agent.path, mainPath, "HEAD");
    if (commits.length === 0) continue;

    const files = changedFilesInAgentNotInLocalMain(agent.path, mainPath, "HEAD");
    const nameStatus = changedFilesNameStatusInAgentNotInLocalMain(agent.path, mainPath, "HEAD");
    candidates.push({
      agent,
      commits,
      files,
      nameStatus,
      risk: classifyRisk(files),
      baseline: "local main",
      baselineHead: mainHead,
      agentHead,
      remote: aheadBehind(agent.path, "origin/main", "HEAD")
    });
  }

  return candidates;
}

export function localBranches(worktreePath) {
  const result = git(worktreePath, ["branch", "--format=%(refname:short)"], { allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function isBranchMergedInto(worktreePath, branch, target = "main") {
  return isAncestor(worktreePath, branch, target);
}

export function classifyRisk(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));

  const high = normalized.some((file) =>
    file.startsWith("apps/api/") ||
    file.startsWith("apps/web/") ||
    file.startsWith("packages/") ||
    file.startsWith("database/") ||
    file.startsWith("infra/") ||
    file.startsWith(".github/") ||
    file.includes("docker") ||
    file.includes("Docker") ||
    file.includes("deploy") ||
    file.includes("auth") ||
    file.includes("wechat") ||
    file.includes("sms")
  );
  if (high) return "HIGH";

  const medium = normalized.some((file) =>
    file.startsWith("scripts/e2e/") ||
    file.startsWith("ops/agent-orchestrator/")
  );
  if (medium) return "MEDIUM";

  const low = normalized.every((file) =>
    file.startsWith("docs/") ||
    file.startsWith("ops/agent-orchestrator/reports/")
  );
  return low ? "LOW" : "MEDIUM";
}

export function classifyAgentResultRisk(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/").replace(/^\.\//, ""));

  const high = normalized.some((file) =>
    file.startsWith("apps/") ||
    file.startsWith("packages/") ||
    file.startsWith("database/") ||
    file.startsWith("infra/") ||
    file.startsWith(".github/") ||
    file === "Dockerfile" ||
    file.startsWith("Dockerfile.") ||
    file.startsWith("docker-compose") ||
    file.includes("auth") ||
    file.includes("deploy")
  );
  if (high) return "HIGH";

  const medium = normalized.some((file) =>
    file.startsWith("ops/agent-orchestrator/queue/") ||
    file.startsWith("ops/agent-orchestrator/scripts/") ||
    file.startsWith("docs/testing/") ||
    file.startsWith("scripts/e2e/")
  );
  if (medium) return "MEDIUM";

  const low = normalized.length > 0 && normalized.every((file) =>
    file.startsWith("docs/") ||
    file.startsWith("ops/agent-orchestrator/reports/") ||
    file.startsWith("ops/agent-orchestrator/results/")
  );
  return low ? "LOW" : "MEDIUM";
}

export function repoStatus(worktreePath) {
  const output = statusShort(worktreePath);
  const entries = parseStatusShort(output);
  const { runtime, nonRuntime } = splitRuntimeStatus(entries);
  const ab = aheadBehind(worktreePath);

  return {
    path: worktreePath,
    branch: branchName(worktreePath),
    head: headLine(worktreePath),
    clean: entries.length === 0,
    runtimeDirty: runtime,
    nonRuntimeDirty: nonRuntime,
    statusOutput: output.trim(),
    ahead: ab.ahead,
    behind: ab.behind,
    includedInOriginMain: isAncestor(worktreePath, "HEAD", "origin/main")
  };
}

export async function backupAndRemoveRuntimeEntry(worktreePath, entryPath, backupRoot) {
  const source = join(worktreePath, entryPath);
  const destination = join(backupRoot, entryPath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true, errorOnExist: false });
  await rm(source, { recursive: true, force: true });
  return {
    source,
    destination
  };
}

export function agentBackupRoot(baseDir, agentId, timestamp) {
  return join(baseDir, agentId, timestamp);
}

export function shortPath(path) {
  return basename(path) || path;
}
