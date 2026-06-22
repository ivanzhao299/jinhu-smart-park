#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { appendTaskEvent } from "./lib/event-store-utils.mjs";

const VALID_AGENTS = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];
const VALID_AGENT_SET = new Set(VALID_AGENTS);
const ACTIVE_LOCK_STATUSES = new Set(["CLAIMED", "IN_PROGRESS", "BLOCKED"]);
const PRIORITY_RANK = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3]
]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const promptTemplatePath = join(orchestratorDir, "prompts", "agent-worker-prompt.md");
const runsDir = join(orchestratorDir, "runs");
const dispatchReportPath = join(runsDir, "dispatch-report.md");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run")
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function priorityRank(priority) {
  return PRIORITY_RANK.has(priority) ? PRIORITY_RANK.get(priority) : 99;
}

function createdAtRank(task) {
  const ms = Date.parse(task.created_at ?? "");
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

function sortTasks(a, b) {
  const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
  if (byPriority !== 0) return byPriority;

  const byCreatedAt = createdAtRank(a) - createdAtRank(b);
  if (byCreatedAt !== 0) return byCreatedAt;

  return String(a.task_id).localeCompare(String(b.task_id));
}

function taskById(queue) {
  return new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
}

function hasActiveLock(agent, locks, queue) {
  const tasksById = taskById(queue);
  return (locks.locks ?? []).some((lock) => {
    if (lock.agent !== agent) return false;
    const lockedTask = tasksById.get(lock.task_id);
    return lockedTask ? ACTIVE_LOCK_STATUSES.has(lockedTask.status) : true;
  });
}

function normalizeAgentConfig(config) {
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

function worktreeStatus(path) {
  if (!path) {
    return { clean: false, reason: "missing worktree path", output: "" };
  }

  const result = spawnSync("git", ["-C", path, "status", "--short"], {
    encoding: "utf8"
  });

  if (result.error) {
    return { clean: false, reason: result.error.message, output: "" };
  }

  if (result.status !== 0) {
    return {
      clean: false,
      reason: (result.stderr || result.stdout || `git status exited ${result.status}`).trim(),
      output: result.stdout.trim()
    };
  }

  const output = result.stdout.trim();
  return {
    clean: output.length === 0,
    reason: output.length === 0 ? "" : "worktree is not clean",
    output
  };
}

function renderPrompt(template, { task, agentConfig, promptFile }) {
  const replacements = {
    "{{agent_id}}": task.owner,
    "{{agent_name}}": agentConfig.name ?? task.owner,
    "{{agent_role}}": agentConfig.role ?? "",
    "{{worktree_path}}": agentConfig.path ?? "",
    "{{branch}}": agentConfig.branch ?? "",
    "{{task_id}}": task.task_id,
    "{{batch_id}}": task.batch_id,
    "{{title}}": task.title,
    "{{domain}}": task.domain,
    "{{priority}}": task.priority,
    "{{risk}}": task.risk,
    "{{queue_path}}": "ops/agent-orchestrator/queue/task-queue.json",
    "{{locks_path}}": "ops/agent-orchestrator/queue/task-locks.json",
    "{{results_path}}": "ops/agent-orchestrator/queue/task-results.json",
    "{{prompt_file}}": promptFile,
    "{{allowed_paths}}": (task.allowed_paths ?? []).map((item) => `- ${item}`).join("\n"),
    "{{forbidden_paths}}": (task.forbidden_paths ?? []).map((item) => `- ${item}`).join("\n"),
    "{{acceptance}}": (task.acceptance ?? []).map((item, index) => `${index + 1}. ${item}`).join("\n"),
    "{{validation_commands}}": (task.validation_commands ?? []).map((item) => `- \`${item}\``).join("\n"),
    "{{task_json}}": JSON.stringify(task, null, 2)
  };

  let rendered = template;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(token, value);
  }
  return rendered;
}

function buildReport({ dryRun, claimed, skipped, generatedAt }) {
  const claimedRows = claimed.length > 0
    ? claimed.map((item) => `| ${item.task.task_id} | ${item.task.owner} | ${item.worktreePath} | ${item.promptFile} |`).join("\n")
    : "| _none_ | | | |";
  const skippedRows = skipped.length > 0
    ? skipped.map((item) => `| ${item.agent} | ${item.reason} |`).join("\n")
    : "| _none_ | |";

  return `# Dispatch Report

Generated at: ${generatedAt}

Mode: ${dryRun ? "dry-run" : "dispatch"}

## Claimed Tasks

| Task ID | Owner | Worktree | Prompt File |
|---|---|---|---|
${claimedRows}

## Skipped Agents

| Agent | Reason |
|---|---|
${skippedRows}

## Guardrails

- This dispatcher does not execute business development work.
- This dispatcher does not run e2e.
- This dispatcher does not merge.
- This dispatcher does not push.
- Dirty worktrees are skipped.
`;
}

const args = parseArgs(process.argv.slice(2));
const queue = await readJson(queuePath);
const locks = await readJson(locksPath);
const agentsConfig = normalizeAgentConfig(await readJson(agentsConfigPath));
const promptTemplate = await readFile(promptTemplatePath, "utf8");
const generatedAt = nowIso();
const readyTasksByAgent = new Map();
const claimed = [];
const skipped = [];

for (const task of queue.tasks ?? []) {
  if (task.status !== "READY") continue;
  if (!VALID_AGENT_SET.has(task.owner)) {
    skipped.push({ agent: task.owner ?? "(missing)", reason: `unsupported owner for task ${task.task_id}` });
    continue;
  }
  const group = readyTasksByAgent.get(task.owner) ?? [];
  group.push(task);
  readyTasksByAgent.set(task.owner, group);
}

for (const agent of VALID_AGENTS) {
  const agentTasks = readyTasksByAgent.get(agent) ?? [];
  const agentConfig = agentsConfig.get(agent);

  if (agentTasks.length === 0) {
    skipped.push({ agent, reason: "no READY task" });
    continue;
  }

  if (!agentConfig) {
    skipped.push({ agent, reason: "missing agent config" });
    continue;
  }

  if (hasActiveLock(agent, locks, queue)) {
    skipped.push({ agent, reason: "agent already has an active lock" });
    continue;
  }

  const status = worktreeStatus(agentConfig.path);
  if (!status.clean) {
    const detail = status.output ? `${status.reason}: ${status.output}` : status.reason;
    skipped.push({ agent, reason: detail || "worktree is not clean" });
    continue;
  }

  const task = [...agentTasks].sort(sortTasks)[0];
  const promptFile = `ops/agent-orchestrator/runs/${task.task_id}-${agent}.prompt.md`;
  claimed.push({
    task,
    agentConfig,
    worktreePath: agentConfig.path,
    promptFile
  });
}

if (!args.dryRun && claimed.length > 0) {
  await mkdir(runsDir, { recursive: true });
  locks.locks ??= [];

  for (const item of claimed) {
    const statusBefore = item.task.status;
    item.task.status = "CLAIMED";
    item.task.updated_at = generatedAt;
    const lock = {
      task_id: item.task.task_id,
      agent: item.task.owner,
      claimed_at: generatedAt
    };
    locks.locks.push(lock);

    await appendTaskEvent({
      event_type: "task.claimed",
      task_id: item.task.task_id,
      owner: item.task.owner,
      status_before: statusBefore,
      status_after: item.task.status,
      created_at: generatedAt,
      actor: "orchestrator",
      source: "dispatch-ready-agents.mjs",
      reason: "dispatch READY task to clean agent worktree",
      changed_files: [],
      metadata: {
        lock_snapshot: lock,
        prompt_file: item.promptFile,
        worktree_path: item.worktreePath,
        task_snapshot: item.task
      }
    });

    const promptPath = join(runsDir, `${item.task.task_id}-${item.task.owner}.prompt.md`);
    const prompt = renderPrompt(promptTemplate, item);
    await writeFile(promptPath, prompt);
  }

  queue.updated_at = generatedAt;
  locks.updated_at = generatedAt;
  await writeJson(queuePath, queue);
  await writeJson(locksPath, locks);
}

const report = buildReport({ dryRun: args.dryRun, claimed, skipped, generatedAt });

if (!args.dryRun) {
  await mkdir(runsDir, { recursive: true });
  await writeFile(dispatchReportPath, report);
}

console.log(`Dispatch mode: ${args.dryRun ? "dry-run" : "dispatch"}`);
console.log("");
console.log("Claimed tasks:");
if (claimed.length === 0) {
  console.log("- none");
} else {
  for (const item of claimed) {
    console.log(`- ${item.task.task_id} | ${item.task.owner} | ${item.worktreePath} | ${item.promptFile}`);
  }
}

console.log("");
console.log("Skipped agents:");
if (skipped.length === 0) {
  console.log("- none");
} else {
  for (const item of skipped) {
    console.log(`- ${item.agent}: ${item.reason}`);
  }
}

if (args.dryRun) {
  console.log("");
  console.log("Dry-run: task-queue.json and task-locks.json were not modified.");
} else {
  console.log("");
  console.log(`Dispatch report: ops/agent-orchestrator/runs/dispatch-report.md`);
}
