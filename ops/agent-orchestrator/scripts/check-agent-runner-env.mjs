#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repoStatus } from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson,
  taskById,
  VALID_AGENTS
} from "./lib/queue-utils.mjs";

const ACTIVE_LOCK_STATUSES = new Set(["CLAIMED", "IN_PROGRESS", "BLOCKED"]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

function findCodex() {
  const path = commandOutput("sh", ["-lc", "command -v codex"]);
  if (!path) {
    return { found: false, path: "", version: "" };
  }

  return {
    found: true,
    path,
    version: commandOutput("codex", ["--version"]) ?? ""
  };
}

function formatRepo(path) {
  if (!path) {
    return { exists: false, clean: false, branch: "", head: "", detail: "missing path" };
  }

  if (!existsSync(path)) {
    return { exists: false, clean: false, branch: "", head: "", detail: "path does not exist" };
  }

  try {
    const status = repoStatus(path);
    return {
      exists: true,
      clean: status.clean,
      branch: status.branch,
      head: status.head,
      detail: status.clean ? "clean" : status.statusOutput
    };
  } catch (error) {
    return {
      exists: true,
      clean: false,
      branch: "",
      head: "",
      detail: error.message
    };
  }
}

function activeLocks(locks, queue) {
  const tasksById = taskById(queue);
  return (locks.locks ?? []).filter((lock) => {
    const task = tasksById.get(lock.task_id);
    return task ? ACTIVE_LOCK_STATUSES.has(task.status) : true;
  });
}

const config = await readJson(agentsConfigPath);
const queue = await readJson(queuePath);
const locks = await readJson(locksPath);
const agents = normalizeAgentConfig(config);
const codex = findCodex();
const active = activeLocks(locks, queue);

const repos = [
  { id: "main", path: config.main?.path ?? repoRoot },
  ...VALID_AGENTS.map((id) => ({ id, path: agents.get(id)?.path ?? "" }))
];

console.log("# Agent Runner Environment");
console.log("");
console.log(`Generated at: ${new Date().toISOString()}`);
console.log("");
console.log("## Runtime");
console.log(`- node: ${process.version}`);
console.log(`- codex CLI: ${codex.found ? `found (${codex.path}${codex.version ? `, ${codex.version}` : ""})` : "not found"}`);
console.log("");
console.log("## Worktrees");
for (const repo of repos) {
  const status = formatRepo(repo.path);
  console.log(`- ${repo.id}: ${status.exists ? "exists" : "missing"} | clean: ${status.clean ? "yes" : "no"} | path: ${repo.path || "(missing)"}`);
  if (status.branch || status.head || status.detail) {
    console.log(`  branch: ${status.branch || "(unknown)"}`);
    console.log(`  head: ${status.head || "(unknown)"}`);
    console.log(`  detail: ${status.detail || "n/a"}`);
  }
}
console.log("");
console.log("## Active Locks");
if (active.length === 0) {
  console.log("- none");
} else {
  for (const lock of active) {
    const task = taskById(queue).get(lock.task_id);
    console.log(`- ${lock.agent}: ${lock.task_id} | status: ${task?.status ?? "missing task"} | claimed_at: ${lock.claimed_at ?? ""}`);
  }
}
