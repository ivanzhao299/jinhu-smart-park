#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repoStatus } from "./lib/git-utils.mjs";
import {
  detectCodexCli,
  normalizeAgentConfig,
  readJson,
  taskById
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const runsDir = join(orchestratorDir, "runs");
const runPlanPath = join(runsDir, "agent-run-plan.md");

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  if (apply && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  return { apply, dryRun };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function promptFileFor(taskId, agentId) {
  return {
    relative: `ops/agent-orchestrator/runs/${taskId}-${agentId}.prompt.md`,
    absolute: join(repoRoot, "ops", "agent-orchestrator", "runs", `${taskId}-${agentId}.prompt.md`)
  };
}

function inspectWorktree(path) {
  if (!path) {
    return { clean: false, detail: "missing worktree path" };
  }

  if (!existsSync(path)) {
    return { clean: false, detail: "worktree path does not exist" };
  }

  try {
    const status = repoStatus(path);
    return {
      clean: status.clean,
      detail: status.clean ? "clean" : status.statusOutput,
      branch: status.branch,
      head: status.head
    };
  } catch (error) {
    return { clean: false, detail: error.message };
  }
}

function suggestedCommand(item) {
  if (!item.codex.found) {
    return "Codex CLI not found; cannot auto-run agents";
  }

  return [
    shellQuote(item.codex.path),
    "exec",
    "--ask-for-approval",
    "on-request",
    "--sandbox",
    "workspace-write",
    "-C",
    shellQuote(item.worktreePath),
    "-",
    "<",
    shellQuote(item.promptFileAbsolute)
  ].join(" ");
}

function buildRunPlan({ generatedAt, mode, codex, runnable, skipped }) {
  const runnableRows = runnable.length === 0
    ? "| _none_ | | | | | | |"
    : runnable.map((item) =>
      `| ${item.task.task_id} | ${item.task.owner} | ${item.worktreePath} | ${item.promptFileRelative} | ${item.branch ?? ""} | ${item.clean ? "yes" : "no"} | \`${item.command}\` |`
    ).join("\n");

  const skippedRows = skipped.length === 0
    ? "| _none_ | | |"
    : skipped.map((item) => `| ${item.owner} | ${item.task_id ?? ""} | ${item.reason} |`).join("\n");

  const commands = runnable.length === 0
    ? "- none"
    : runnable.map((item) => `- ${item.task.owner} / ${item.task.task_id}\n\n  \`\`\`bash\n  cd ${shellQuote(item.worktreePath)}\n  ${item.command}\n  \`\`\``).join("\n");

  return `# Agent Run Plan

Generated at: ${generatedAt}

Mode: ${mode}

Codex CLI: ${codex.found ? "found" : "not found"}

Codex CLI path: ${codex.path || "(not found)"}

Codex CLI source: ${codex.source}

Codex CLI version: ${codex.version || "(unavailable)"}
${codex.warning ? `\nCodex CLI warning: ${codex.warning}` : ""}

Auto-run capability: ${codex.found ? "plan-ready (absolute CLI path available)" : "cannot auto-run"}

This plan is generated from CLAIMED tasks with active locks. It does not execute Codex, does not modify agent worktrees, does not merge, does not push, and does not run production operations.

## Runnable Claimed Tasks

| Task ID | Owner | Worktree | Prompt File | Branch | Clean | Suggested Command |
|---|---|---|---|---|---|---|
${runnableRows}

## Skipped Items

| Owner | Task ID | Reason |
|---|---|---|
${skippedRows}

## Suggested Commands

${commands}

## Guardrails

- Treat these commands as operator-reviewed plans until Codex CLI automation is explicitly approved.
- Do not use unattended deploy, push, migration, seed, backup, restore, rollback, Docker cleanup, or production data operations.
- Each agent must still obey the generated prompt, task allowed_paths, forbidden_paths, validation_commands, and complete-task result recording.
`;
}

function claimedLocks(queue, locks) {
  const tasks = taskById(queue);
  const seen = new Set();
  const claimed = [];
  const skipped = [];

  for (const lock of locks.locks ?? []) {
    const key = `${lock.task_id}:${lock.agent}`;
    if (seen.has(key)) {
      skipped.push({ owner: lock.agent, task_id: lock.task_id, reason: "duplicate lock entry" });
      continue;
    }
    seen.add(key);

    const task = tasks.get(lock.task_id);
    if (!task) {
      skipped.push({ owner: lock.agent, task_id: lock.task_id, reason: "task not found in queue" });
      continue;
    }

    if (task.status !== "CLAIMED") {
      skipped.push({ owner: lock.agent, task_id: lock.task_id, reason: `task status is ${task.status}, not CLAIMED` });
      continue;
    }

    if (task.owner !== lock.agent) {
      skipped.push({ owner: lock.agent, task_id: lock.task_id, reason: `lock agent does not match task owner ${task.owner}` });
      continue;
    }

    claimed.push({ lock, task });
  }

  return { claimed, skipped };
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const codex = detectCodexCli();
if (args.apply && !codex.found) {
  console.error("Codex CLI not found; cannot auto-run agents");
  process.exit(1);
}

const queue = await readJson(queuePath);
const locks = await readJson(locksPath);
const agents = normalizeAgentConfig(await readJson(agentsConfigPath));
const generatedAt = new Date().toISOString();
const { claimed, skipped } = claimedLocks(queue, locks);
const runnable = [];

for (const item of claimed) {
  const agent = agents.get(item.task.owner);
  if (!agent) {
    skipped.push({ owner: item.task.owner, task_id: item.task.task_id, reason: "missing agent config" });
    continue;
  }

  const promptFile = promptFileFor(item.task.task_id, item.task.owner);
  if (!existsSync(promptFile.absolute)) {
    skipped.push({ owner: item.task.owner, task_id: item.task.task_id, reason: `missing prompt file ${promptFile.relative}` });
    continue;
  }

  const worktree = inspectWorktree(agent.path);
  if (!worktree.clean) {
    skipped.push({ owner: item.task.owner, task_id: item.task.task_id, reason: `worktree not clean or unavailable: ${worktree.detail}` });
    continue;
  }

  const runItem = {
    task: item.task,
    worktreePath: agent.path,
    promptFileRelative: promptFile.relative,
    promptFileAbsolute: promptFile.absolute,
    branch: worktree.branch,
    head: worktree.head,
    clean: worktree.clean,
    codex
  };
  runItem.command = suggestedCommand(runItem);
  runnable.push(runItem);
}

const mode = args.apply ? "apply-plan (no agent execution in this version)" : "dry-run";
const plan = buildRunPlan({ generatedAt, mode, codex, runnable, skipped });

await mkdir(runsDir, { recursive: true });
await writeFile(runPlanPath, plan);

console.log(`# Claimed Agent Prompt Runner ${mode}`);
console.log("");
console.log(`Codex CLI: ${codex.found ? "found" : "not found"}`);
console.log(`Codex CLI path: ${codex.path || "(not found)"}`);
console.log(`Codex CLI source: ${codex.source}`);
console.log(`Codex CLI version: ${codex.version || "(unavailable)"}`);
if (codex.warning) {
  console.log(`Codex CLI warning: ${codex.warning}`);
}
if (!codex.found && codex.reason) {
  console.log(`Codex CLI reason: ${codex.reason}`);
}
console.log(`Run plan: ops/agent-orchestrator/runs/agent-run-plan.md`);
console.log("");
console.log("Runnable claimed tasks:");
if (runnable.length === 0) {
  console.log("- none");
} else {
  for (const item of runnable) {
    console.log(`- ${item.task.task_id} | ${item.task.owner} | ${item.worktreePath} | ${item.promptFileRelative}`);
    console.log(`  command: ${item.command}`);
  }
}
console.log("");
console.log("Skipped items:");
if (skipped.length === 0) {
  console.log("- none");
} else {
  for (const item of skipped) {
    console.log(`- ${item.owner}: ${item.task_id ?? ""} ${item.reason}`);
  }
}

console.log("");
if (args.apply) {
  console.log("Apply requested, but this first version is plan-first only; no Codex agent was executed.");
} else {
  console.log("Dry-run: no Codex agent was executed and no agent worktree was modified.");
}
