#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAgentResultRisk,
  git,
  parseStatusShort,
  statusShort
} from "./lib/git-utils.mjs";
import {
  isOrchestratorSystemFile,
  normalizeAgentConfig,
  pathMatches,
  readJson,
  taskById,
  VALID_AGENTS
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

const ACTIVE_TASK_STATUSES = new Set(["CLAIMED", "IN_PROGRESS", "DONE"]);
const COMMIT_MESSAGES = new Map([
  ["agent-2", "chore(agent-2): complete production finance gate"],
  ["agent-3", "chore(agent-3): complete production safety smoke gate"],
  ["agent-4", "chore(agent-4): complete production rbac menu gate"],
  ["agent-5", "chore(agent-5): complete production preflight gate"]
]);
const TASK_COMMIT_MESSAGES = new Map([
  ["AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX", "chore(agent-1): complete runtime docs index readiness"],
  ["AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK", "chore(agent-2): complete validation runbook readiness"]
]);

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  if (argv.includes("--dry-run") && apply) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  return { apply, dryRun };
}

function statusEntries(worktreePath) {
  return parseStatusShort(statusShort(worktreePath));
}

function dirtyFiles(entries) {
  return entries.map((entry) => entry.path);
}

function latestByTime(items, timeField) {
  return [...items].sort((a, b) => {
    const left = Date.parse(a?.[timeField] ?? "");
    const right = Date.parse(b?.[timeField] ?? "");
    const leftRank = Number.isNaN(left) ? 0 : left;
    const rightRank = Number.isNaN(right) ? 0 : right;
    return rightRank - leftRank;
  })[0];
}

function taskFromLock(agentId, locks, tasks) {
  const matches = (locks.locks ?? [])
    .filter((lock) => lock.agent === agentId)
    .map((lock) => ({ lock, task: tasks.get(lock.task_id) }))
    .filter((item) => item.task && item.task.owner === agentId && ACTIVE_TASK_STATUSES.has(item.task.status));
  const selected = latestByTime(matches.map((item) => ({ ...item, claimed_at: item.lock.claimed_at })), "claimed_at");
  return selected ? { source: "task-locks.json", task: selected.task } : null;
}

function taskFromResults(agentId, results, tasks) {
  const matches = (results.results ?? [])
    .filter((result) => result.agent === agentId && result.task_id && tasks.has(result.task_id))
    .map((result) => ({ result, task: tasks.get(result.task_id) }))
    .filter((item) => item.task?.owner === agentId);
  const selected = latestByTime(matches.map((item) => ({
    ...item,
    completed_at: item.result.completed_at ?? item.result.updated_at
  })), "completed_at");
  return selected ? { source: "task-results.json", task: selected.task } : null;
}

function taskFromQueue(agentId, queue) {
  const matches = (queue.tasks ?? [])
    .filter((task) => task.owner === agentId && ACTIVE_TASK_STATUSES.has(task.status));
  const selected = latestByTime(matches, "updated_at");
  return selected ? { source: "task-queue.json", task: selected } : null;
}

function currentTaskForAgent(agentId, { queue, locks, results, tasks }) {
  return taskFromLock(agentId, locks, tasks)
    ?? taskFromResults(agentId, results, tasks)
    ?? taskFromQueue(agentId, queue);
}

function boundaryFailures(task, files) {
  if (!task) {
    return files.length > 0 ? ["dirty files found but no claimed/done task could be resolved"] : [];
  }

  const allowedPaths = Array.isArray(task.allowed_paths) ? task.allowed_paths : [];
  const forbiddenPaths = Array.isArray(task.forbidden_paths) ? task.forbidden_paths : [];
  const failures = [];

  for (const file of files) {
    const forbiddenMatch = forbiddenPaths.find((forbiddenPath) => pathMatches(file, forbiddenPath));
    if (forbiddenMatch) {
      failures.push(`changed file hits forbidden_paths (${forbiddenMatch}): ${file}`);
      continue;
    }

    if (isOrchestratorSystemFile(file, task.task_id)) {
      continue;
    }

    const isAllowed = allowedPaths.some((allowedPath) => pathMatches(file, allowedPath));
    if (!isAllowed) {
      failures.push(`changed file outside allowed_paths: ${file}`);
    }
  }

  return failures;
}

function commitMessageFor(agentId, task) {
  return TASK_COMMIT_MESSAGES.get(task?.task_id) ?? COMMIT_MESSAGES.get(agentId) ?? `chore(${agentId}): complete claimed agent task`;
}

async function buildPlans() {
  const config = await readJson(agentsConfigPath);
  const queue = await readJson(queuePath);
  const locks = await readJson(locksPath);
  const results = await readJson(resultsPath);
  const tasks = taskById(queue);
  const agents = normalizeAgentConfig(config);
  const plans = [];

  for (const agentId of VALID_AGENTS) {
    const agent = agents.get(agentId);
    if (!agent) {
      plans.push({
        agentId,
        missing: true,
        dirtyFiles: [],
        entries: [],
        risk: "NONE",
        failures: ["missing agent config"],
        commitMessage: commitMessageFor(agentId)
      });
      continue;
    }

    const entries = statusEntries(agent.path);
    const files = dirtyFiles(entries);
    const taskRef = currentTaskForAgent(agentId, { queue, locks, results, tasks });
    const risk = files.length === 0 ? "NONE" : classifyAgentResultRisk(files);
    const failures = boundaryFailures(taskRef?.task, files);

    plans.push({
      agentId,
      agent,
      entries,
      dirtyFiles: files,
      task: taskRef?.task,
      taskSource: taskRef?.source ?? "none",
      risk,
      failures,
      commitMessage: commitMessageFor(agentId, taskRef?.task)
    });
  }

  return plans;
}

function printPlan(plans, mode) {
  console.log(`# Agent Result Commit ${mode}`);
  console.log("");
  console.log("Guardrails: no merge, no push, no deploy, no production operations.");
  console.log("");

  for (const plan of plans) {
    console.log(`## ${plan.agentId}`);
    console.log(`path: ${plan.agent?.path ?? "(missing)"}`);
    console.log(`task: ${plan.task?.task_id ?? "(none)"}`);
    console.log(`task source: ${plan.taskSource ?? "none"}`);
    console.log(`risk: ${plan.risk}`);
    console.log(`commit message: ${plan.commitMessage}`);
    console.log("dirty files:");
    if (plan.entries.length === 0) {
      console.log("- none");
    } else {
      for (const entry of plan.entries) {
        console.log(`- ${entry.code} ${entry.path}`);
      }
    }
    console.log("boundary check:");
    if (plan.failures.length === 0) {
      console.log("- pass");
    } else {
      for (const failure of plan.failures) {
        console.log(`- ${failure}`);
      }
    }
    console.log("");
  }
}

function applyPlans(plans) {
  const dirtyPlans = plans.filter((plan) => plan.dirtyFiles.length > 0);
  const blockers = dirtyPlans.filter((plan) => plan.risk === "HIGH" || plan.failures.length > 0);

  if (blockers.length > 0) {
    console.error("Commit blocked. No agent result commits were created.");
    for (const blocker of blockers) {
      console.error(`- ${blocker.agentId}: risk=${blocker.risk}; ${blocker.failures.join("; ") || "HIGH risk"}`);
    }
    process.exit(1);
  }

  if (dirtyPlans.length === 0) {
    console.log("No dirty agent results to commit.");
    return;
  }

  for (const plan of dirtyPlans) {
    if (!["LOW", "MEDIUM"].includes(plan.risk)) {
      throw new Error(`${plan.agentId} has unsupported commit risk: ${plan.risk}`);
    }

    console.log(`Committing ${plan.agentId}: ${plan.commitMessage}`);
    git(plan.agent.path, ["add", "--", ...plan.dirtyFiles], { stdio: "inherit" });
    git(plan.agent.path, ["commit", "-m", plan.commitMessage], { stdio: "inherit" });
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const plans = await buildPlans();
printPlan(plans, args.apply ? "apply" : "dry-run");

if (args.dryRun) {
  console.log("Dry-run: no agent result commit was created.");
} else {
  applyPlans(plans);
  console.log("Apply completed: agent result commits were created where eligible. No merge or push was performed.");
}
