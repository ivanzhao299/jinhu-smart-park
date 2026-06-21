#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatusShort, repoStatus, statusShort } from "./lib/git-utils.mjs";
import {
  detectCodexCli,
  detectCodexExecOptions,
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
const runPlanRelativePath = "ops/agent-orchestrator/runs/agent-run-plan.md";

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const execute = argv.includes("--execute");
  const precheckOnly = argv.includes("--precheck-only");
  const writePlan = argv.includes("--write-plan");
  const noWrite = argv.includes("--no-write");
  const dryRun = argv.includes("--dry-run") || !apply;
  if (argv.includes("--dry-run") && (apply || execute)) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  if (execute && !apply) {
    throw new Error("--execute requires --apply.");
  }
  if (precheckOnly && (!apply || !execute)) {
    throw new Error("--precheck-only requires --apply --execute.");
  }
  if (writePlan && noWrite) {
    throw new Error("Use either --write-plan or --no-write, not both.");
  }

  const shouldWritePlan = !noWrite && (writePlan || (apply && !precheckOnly));
  return { apply, execute, precheckOnly, writePlan, dryRun, noWrite, shouldWritePlan };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function shellArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@+-]+$/.test(text) ? text : shellQuote(text);
}

function promptFileFor(taskId, agentId) {
  return {
    relative: `ops/agent-orchestrator/runs/${taskId}-${agentId}.prompt.md`,
    absolute: join(repoRoot, "ops", "agent-orchestrator", "runs", `${taskId}-${agentId}.prompt.md`)
  };
}

function runLogFileFor(taskId, agentId) {
  return {
    relative: `ops/agent-orchestrator/runs/${taskId}-${agentId}.run.log`,
    absolute: join(repoRoot, "ops", "agent-orchestrator", "runs", `${taskId}-${agentId}.run.log`)
  };
}

function normalizeRepoPath(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function inspectWorktree(path, options = {}) {
  if (!path) {
    return { clean: false, detail: "missing worktree path" };
  }

  if (!existsSync(path)) {
    return { clean: false, detail: "worktree path does not exist" };
  }

  try {
    const status = repoStatus(path);
    const ignoredPaths = new Set((options.ignoredPaths ?? []).map(normalizeRepoPath));
    const entries = parseStatusShort(statusShort(path));
    const blockingEntries = entries.filter((entry) => !ignoredPaths.has(normalizeRepoPath(entry.path)));
    const ignoredEntries = entries.filter((entry) => ignoredPaths.has(normalizeRepoPath(entry.path)));
    const clean = status.clean || (ignoredEntries.length > 0 && blockingEntries.length === 0);

    return {
      clean,
      detail: clean
        ? status.clean
          ? "clean"
          : `clean except ignored generated file(s): ${ignoredEntries.map((entry) => `${entry.code} ${entry.path}`).join("; ")}`
        : blockingEntries.map((entry) => `${entry.code} ${entry.path}`).join("\n"),
      branch: status.branch,
      head: status.head
    };
  } catch (error) {
    return { clean: false, detail: error.message };
  }
}

function isActiveClaimedLock(lock, task) {
  return Boolean(lock && task && task.status === "CLAIMED" && lock.agent === task.owner && lock.task_id === task.task_id);
}

function suggestedCommand(item) {
  if (!item.codex.found) {
    return "Codex CLI not found; cannot auto-run agents";
  }

  return [
    shellQuote(item.codex.path),
    "exec",
    ...item.execOptions.args.map(shellArg),
    "-C",
    shellQuote(item.worktreePath),
    "-",
    "<",
    shellQuote(item.promptFileAbsolute)
  ].join(" ");
}

function buildRunPlan({ generatedAt, mode, codex, runnable, skipped }) {
  const runnableRows = runnable.length === 0
    ? "| _none_ | | | | | | | |"
    : runnable.map((item) =>
      `| ${item.task.task_id} | ${item.task.owner} | ${item.worktreePath} | ${item.promptFileRelative} | ${item.logFileRelative} | ${item.branch ?? ""} | ${item.clean ? "yes" : "no"} | \`${item.command}\` |`
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

Codex exec approval: ${codex.execOptions.approval.note}

Codex exec sandbox: ${codex.execOptions.sandbox.note}

Auto-run capability: ${codex.found ? "plan-ready (absolute CLI path available)" : "cannot auto-run"}

This plan is generated from CLAIMED tasks with active locks. It does not execute Codex, does not modify agent worktrees, does not merge, does not push, and does not run production operations.

## Runnable Claimed Tasks

| Task ID | Owner | Worktree | Prompt File | Log File | Branch | Clean | Suggested Command |
|---|---|---|---|---|---|---|---|
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
- \`--apply --execute\` runs these tasks serially and writes one \`.run.log\` file per task; it does not merge, push, deploy, or mutate queue state.
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

    if (!isActiveClaimedLock(lock, task)) {
      skipped.push({ owner: lock.agent, task_id: lock.task_id, reason: "lock is not an active CLAIMED task" });
      continue;
    }

    claimed.push({ lock, task });
  }

  return { claimed, skipped };
}

function assertExecutePreconditions({ codex, mainStatus, runnable, skipped }) {
  const failures = [];

  if (!codex.found) {
    failures.push("Codex CLI not found; cannot auto-run agents");
  }

  if (!mainStatus.clean) {
    failures.push(`main worktree is not clean: ${mainStatus.detail}`);
  }

  if (runnable.length === 0) {
    failures.push("no runnable CLAIMED task with active lock");
  }

  if (skipped.length > 0) {
    failures.push(`cannot execute while skipped claimed items exist: ${skipped.map((item) => `${item.owner}/${item.task_id ?? ""} ${item.reason}`).join("; ")}`);
  }

  for (const item of runnable) {
    if (!item.clean) {
      failures.push(`${item.task.owner} worktree is not clean: ${item.worktreeDetail}`);
    }
    if (item.task.status !== "CLAIMED") {
      failures.push(`${item.task.task_id} status is ${item.task.status}, not CLAIMED`);
    }
    if (!item.lock || item.lock.task_id !== item.task.task_id || item.lock.agent !== item.task.owner) {
      failures.push(`${item.task.task_id} has no matching active lock`);
    }
    if (!existsSync(item.promptFileAbsolute)) {
      failures.push(`${item.task.task_id} prompt file is missing: ${item.promptFileRelative}`);
    }
    const expectedPrompt = `ops/agent-orchestrator/runs/${item.task.task_id}-${item.task.owner}.prompt.md`;
    if (item.promptFileRelative !== expectedPrompt) {
      failures.push(`${item.task.task_id} prompt file path does not match task_id / agent`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

async function runCodexTask(item) {
  const startedAt = new Date().toISOString();
  const prompt = await readFile(item.promptFileAbsolute, "utf8");
  let stdout = "";
  let stderr = "";

  console.log("");
  console.log(`Executing ${item.task.task_id} (${item.task.owner})`);
  console.log(`Command: ${item.command}`);
  console.log(`Log file: ${item.logFileRelative}`);

  const child = spawn(item.codex.path, [
    "exec",
    ...item.execOptions.args,
    "-C",
    item.worktreePath,
    "-"
  ], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  child.stdin.end(prompt);

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  const finishedAt = new Date().toISOString();
  const log = [
    `task_id: ${item.task.task_id}`,
    `agent: ${item.task.owner}`,
    `worktree: ${item.worktreePath}`,
    `prompt_file: ${item.promptFileRelative}`,
    `command: ${item.command}`,
    `started_at: ${startedAt}`,
    `finished_at: ${finishedAt}`,
    `exit_code: ${exitCode}`,
    "",
    "## STDOUT",
    stdout || "(empty)",
    "",
    "## STDERR",
    stderr || "(empty)",
    ""
  ].join("\n");

  await writeFile(item.logFileAbsolute, log);

  return {
    task_id: item.task.task_id,
    agent: item.task.owner,
    worktree: item.worktreePath,
    prompt_file: item.promptFileRelative,
    log_file: item.logFileRelative,
    exit_code: exitCode,
    success: exitCode === 0
  };
}

function printExecutionSummary(results) {
  console.log("");
  console.log("Execution summary:");
  if (results.length === 0) {
    console.log("- none");
    return;
  }

  for (const result of results) {
    console.log(`- ${result.task_id} | ${result.agent} | exit ${result.exit_code} | ${result.success ? "success" : "failed"}`);
    console.log(`  worktree: ${result.worktree}`);
    console.log(`  prompt: ${result.prompt_file}`);
    console.log(`  log: ${result.log_file}`);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const codex = detectCodexCli();
codex.execOptions = detectCodexExecOptions(codex.path);
if (args.execute && !codex.found) {
  console.error("Codex CLI not found; cannot auto-run agents");
  process.exit(1);
}

const queue = await readJson(queuePath);
const locks = await readJson(locksPath);
const agentsConfig = await readJson(agentsConfigPath);
const agents = normalizeAgentConfig(agentsConfig);
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
  const logFile = runLogFileFor(item.task.task_id, item.task.owner);
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
    worktreeDetail: worktree.detail,
    codex,
    execOptions: codex.execOptions,
    lock: item.lock,
    logFileRelative: logFile.relative,
    logFileAbsolute: logFile.absolute
  };
  runItem.command = suggestedCommand(runItem);
  runnable.push(runItem);
}

const mode = args.execute ? "execute (serial guarded)" : args.apply ? "apply-plan (no execution without --execute)" : "dry-run";
const plan = buildRunPlan({ generatedAt, mode, codex, runnable, skipped });

await mkdir(runsDir, { recursive: true });
if (args.shouldWritePlan) {
  await writeFile(runPlanPath, plan);
}

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
console.log(`Codex exec approval: ${codex.execOptions.approval.note}`);
console.log(`Codex exec sandbox: ${codex.execOptions.sandbox.note}`);
console.log(`Run plan: ${args.shouldWritePlan ? runPlanRelativePath : args.noWrite ? "(not written; --no-write)" : "(stdout only; pass --write-plan to write agent-run-plan.md)"}`);
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
  if (!args.execute) {
    console.log("Apply requested without --execute; plan-first only and no Codex agent was executed.");
  }
} else {
  console.log("Dry-run: no Codex agent was executed and no agent worktree was modified.");
}

if (!args.shouldWritePlan) {
  console.log("");
  console.log("## Agent Run Plan Document");
  console.log("");
  console.log(plan);
}

if (args.execute) {
  console.log("");
  console.log("Guardrails: serial execution only; no merge, no push, no deploy, no production operations, no database reset/seed/cleanup/migration.");
  const mainStatus = inspectWorktree(agentsConfig.main?.path ?? repoRoot, {
    ignoredPaths: [runPlanRelativePath]
  });
  try {
    assertExecutePreconditions({ codex, mainStatus, runnable, skipped });
  } catch (error) {
    console.error("");
    console.error("Execution precheck failed:");
    console.error(error.message);
    process.exit(1);
  }

  if (args.precheckOnly) {
    console.log("");
    console.log("Precheck-only: execution precheck passed; no Codex agent was executed.");
    process.exit(0);
  }

  const results = [];
  for (const item of runnable) {
    const result = await runCodexTask(item);
    results.push(result);
    if (!result.success) {
      console.error("");
      console.error(`${result.task_id} failed with exit code ${result.exit_code}; stopping remaining tasks.`);
      printExecutionSummary(results);
      process.exit(result.exit_code || 1);
    }
  }

  printExecutionSummary(results);
}
