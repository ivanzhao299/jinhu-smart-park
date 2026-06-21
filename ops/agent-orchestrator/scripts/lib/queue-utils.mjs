import { readdir, readFile, writeFile } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const VALID_AGENTS = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];
export const VALID_AGENT_SET = new Set(VALID_AGENTS);

export const PRIORITY_RANK = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3]
]);

export const ORCHESTRATOR_BOOKKEEPING_FILES = new Set([
  "ops/agent-orchestrator/queue/task-queue.json",
  "ops/agent-orchestrator/queue/task-locks.json",
  "ops/agent-orchestrator/queue/task-results.json"
]);

export const DEFAULT_CODEX_APP_CLI_PATH = "/Applications/Codex.app/Contents/Resources/codex";

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function nowIso() {
  return new Date().toISOString();
}

export function priorityRank(priority) {
  return PRIORITY_RANK.has(priority) ? PRIORITY_RANK.get(priority) : 99;
}

export function createdAtRank(task) {
  const ms = Date.parse(task?.created_at ?? "");
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

export function sortTasks(a, b) {
  const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
  if (byPriority !== 0) return byPriority;

  const byCreatedAt = createdAtRank(a) - createdAtRank(b);
  if (byCreatedAt !== 0) return byCreatedAt;

  return String(a.task_id).localeCompare(String(b.task_id));
}

export function normalizePath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/\*\*$/, "/")
    .replace(/\/$/, "");
}

export function pathMatches(filePath, rulePath) {
  const file = normalizePath(filePath);
  const rule = normalizePath(rulePath);

  if (!file || !rule) {
    return false;
  }

  return file === rule || file.startsWith(`${rule}/`);
}

export function isOrchestratorBookkeepingFile(filePath) {
  return ORCHESTRATOR_BOOKKEEPING_FILES.has(normalizePath(filePath));
}

export function splitChangedFiles(changedFiles) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  return {
    agentChangedFiles: files.filter((file) => !isOrchestratorBookkeepingFile(file)),
    orchestratorChangedFiles: files.filter((file) => isOrchestratorBookkeepingFile(file))
  };
}

export function auditableChangedFiles(result) {
  if (Array.isArray(result?.agent_changed_files)) {
    return result.agent_changed_files;
  }
  return splitChangedFiles(result?.changed_files).agentChangedFiles;
}

export function auditChangedFiles(task, result) {
  const changedFiles = auditableChangedFiles(result);
  const allowedPaths = Array.isArray(task?.allowed_paths) ? task.allowed_paths : [];
  const forbiddenPaths = Array.isArray(task?.forbidden_paths) ? task.forbidden_paths : [];
  const failures = [];

  if (allowedPaths.length === 0 && changedFiles.length > 0) {
    failures.push("task has changed_files but no allowed_paths configured");
  }

  for (const file of changedFiles) {
    const isAllowed = allowedPaths.some((allowedPath) => pathMatches(file, allowedPath));
    if (!isAllowed) {
      failures.push(`changed file outside allowed_paths: ${file}`);
    }

    const forbiddenMatch = forbiddenPaths.find((forbiddenPath) => pathMatches(file, forbiddenPath));
    if (forbiddenMatch) {
      failures.push(`changed file hits forbidden_paths (${forbiddenMatch}): ${file}`);
    }
  }

  return failures;
}

export function latestResultFor(results, taskId) {
  return [...(results.results ?? [])].reverse().find((result) => result.task_id === taskId);
}

export function taskById(queue) {
  return new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
}

export function normalizeAgentConfig(config) {
  const agents = new Map();
  const rawAgents = Array.isArray(config.agents)
    ? config.agents
    : config.agents && typeof config.agents === "object"
      ? Object.entries(config.agents).map(([id, value]) => ({ id, ...value }))
      : [];

  for (const agent of rawAgents) {
    if (agent?.id && VALID_AGENT_SET.has(agent.id)) {
      agents.set(agent.id, agent);
    }
  }

  for (const id of VALID_AGENTS) {
    const topLevel = config[id];
    if (!agents.has(id) && topLevel && typeof topLevel === "object") {
      agents.set(id, { id, ...topLevel });
    }
  }

  return agents;
}

export function isExecutableFile(path) {
  if (!path) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function commandOutput(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

function codexVersion(path) {
  return commandOutput(path, ["--version"]) ?? "";
}

export function detectCodexCli(env = process.env) {
  const envPath = env.CODEX_CLI?.trim();
  let warning = "";
  if (envPath) {
    if (isExecutableFile(envPath)) {
      return {
        found: true,
        path: envPath,
        source: "CODEX_CLI",
        version: codexVersion(envPath)
      };
    }
    warning = `CODEX_CLI is set but is not executable: ${envPath}`;
  }

  const pathCodex = commandOutput("sh", ["-lc", "command -v codex"]);
  if (pathCodex && isExecutableFile(pathCodex)) {
    return {
      found: true,
      path: pathCodex,
      source: "PATH",
      version: codexVersion(pathCodex),
      warning
    };
  }

  if (isExecutableFile(DEFAULT_CODEX_APP_CLI_PATH)) {
    return {
      found: true,
      path: DEFAULT_CODEX_APP_CLI_PATH,
      source: "Codex.app",
      version: codexVersion(DEFAULT_CODEX_APP_CLI_PATH),
      warning
    };
  }

  return {
    found: false,
    path: "",
    source: "none",
    version: "",
    reason: warning || "Codex CLI not found"
  };
}

export async function readResultFiles(resultsDir) {
  let names = [];
  try {
    names = await readdir(resultsDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const results = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const result = await readJson(join(resultsDir, name));
    results.push(result);
  }
  return results;
}

export function mergeResultsByTask(...resultLists) {
  const byTask = new Map();
  for (const result of resultLists.flat()) {
    if (!result?.task_id) continue;
    const previous = byTask.get(result.task_id);
    const previousTime = Date.parse(previous?.completed_at ?? previous?.updated_at ?? "");
    const currentTime = Date.parse(result.completed_at ?? result.updated_at ?? "");
    if (!previous || Number.isNaN(previousTime) || (!Number.isNaN(currentTime) && currentTime >= previousTime)) {
      byTask.set(result.task_id, result);
    }
  }
  return [...byTask.values()];
}
