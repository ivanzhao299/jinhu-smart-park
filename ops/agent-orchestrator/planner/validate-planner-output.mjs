#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const plannerDir = dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = join(plannerDir, "planner-output.schema.json");
const defaultInputPath = join(plannerDir, "generated", "PLAN-GOAL-AGENT-STUDIO-98.json");

const FIELD_DEFS = {
  topLevel: "properties",
  summary: "$defs.summary.properties",
  taskCandidate: "$defs.taskCandidate.properties",
  agentAssignment: "$defs.agentAssignment.properties",
  riskAssessment: "$defs.riskAssessment.properties",
  expectedOutput: "$defs.expectedOutput.properties",
  dispatchPlanItem: "$defs.dispatchPlanItem.properties"
};

function usage() {
  console.error(`Usage:
  node ops/agent-orchestrator/planner/validate-planner-output.mjs
  node ops/agent-orchestrator/planner/validate-planner-output.mjs --input ops/agent-orchestrator/planner/generated/PLAN-GOAL-AGENT-STUDIO-98.json`);
}

function parseArgs(argv) {
  const args = {
    input: defaultInputPath,
    schema: defaultSchemaPath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--schema") {
      args.schema = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input || !args.schema) {
    usage();
    throw new Error("Missing --input or --schema value.");
  }

  return {
    input: resolve(process.cwd(), args.input),
    schema: resolve(process.cwd(), args.schema)
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function requiredFields(schema, defName) {
  return new Set(getPath(schema, `$defs.${defName}.required`) ?? []);
}

function allowedFields(schema, defName) {
  const path = FIELD_DEFS[defName] ?? `$defs.${defName}.properties`;
  return new Set(Object.keys(getPath(schema, path) ?? {}));
}

function enumValues(schema, defName) {
  return new Set(getPath(schema, `$defs.${defName}.enum`) ?? []);
}

function assertObject(value, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  return true;
}

function checkRequired(value, required, label, errors) {
  for (const field of required) {
    if (value[field] === undefined) {
      errors.push(`${label} missing required field: ${field}`);
    }
  }
}

function checkNoExtra(value, allowed, label, errors) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(`${label} has undeclared field: ${field}`);
    }
  }
}

function checkString(value, label, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must be a non-empty string.`);
  }
}

function checkStringList(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    return;
  }
  value.forEach((item, index) => checkString(item, `${label}[${index}]`, errors));
}

function checkEnum(value, allowed, label, errors) {
  if (!allowed.has(value)) {
    errors.push(`${label} has unsupported value: ${value}`);
  }
}

function matchesPath(pattern, path) {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith("*")) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return path === pattern;
}

function pathMatchesAny(path, patterns) {
  return patterns.some((pattern) => matchesPath(pattern, path));
}

function commandLooksWritey(command) {
  const lowered = command.toLowerCase();
  const blockedTokens = [
    "--apply",
    "prod:deploy",
    "db:migrate",
    "db:seed",
    "db:down",
    "complete-task.mjs",
    "git merge",
    "git push",
    " reset",
    " truncate",
    " prune",
    " cleanup"
  ];
  return blockedTokens.some((token) => lowered.includes(token)) && !lowered.includes("--dry-run");
}

function checkSummary(schema, summary, label, errors) {
  if (!assertObject(summary, label, errors)) return;
  checkRequired(summary, requiredFields(schema, "summary"), label, errors);
  checkNoExtra(summary, allowedFields(schema, "summary"), label, errors);
  checkString(summary.title, `${label}.title`, errors);
  checkString(summary.body, `${label}.body`, errors);
  checkStringList(summary.non_goals, `${label}.non_goals`, errors);
}

function checkTask(schema, task, index, output, errors) {
  const label = `tasks[${index}]`;
  if (!assertObject(task, label, errors)) return;

  checkRequired(task, requiredFields(schema, "taskCandidate"), label, errors);
  checkNoExtra(task, allowedFields(schema, "taskCandidate"), label, errors);

  const agents = enumValues(schema, "agent");
  const priorities = enumValues(schema, "priority");
  const risks = enumValues(schema, "riskLevel");
  const statuses = enumValues(schema, "taskStatus");

  checkString(task.task_id, `${label}.task_id`, errors);
  checkString(task.batch_id, `${label}.batch_id`, errors);
  checkString(task.source_goal_id, `${label}.source_goal_id`, errors);
  checkString(task.title, `${label}.title`, errors);
  checkEnum(task.owner, agents, `${label}.owner`, errors);
  checkString(task.owner_assignment_reason, `${label}.owner_assignment_reason`, errors);
  checkString(task.domain, `${label}.domain`, errors);
  checkEnum(task.priority, priorities, `${label}.priority`, errors);
  checkEnum(task.status, statuses, `${label}.status`, errors);
  checkEnum(task.risk, risks, `${label}.risk`, errors);
  checkStringList(task.allowed_paths, `${label}.allowed_paths`, errors);
  checkStringList(task.forbidden_paths, `${label}.forbidden_paths`, errors);
  checkStringList(task.acceptance, `${label}.acceptance`, errors);
  checkStringList(task.validation_commands, `${label}.validation_commands`, errors);
  checkStringList(task.expected_output_files, `${label}.expected_output_files`, errors);
  checkString(task.created_at, `${label}.created_at`, errors);
  checkString(task.updated_at, `${label}.updated_at`, errors);

  if (task.source_goal_id !== output.source_goal_id) {
    errors.push(`${label}.source_goal_id must match planner source_goal_id.`);
  }
  if (typeof task.requires_human_approval !== "boolean") {
    errors.push(`${label}.requires_human_approval must be boolean.`);
  }
  for (const file of task.expected_output_files ?? []) {
    if (!pathMatchesAny(file, task.allowed_paths ?? [])) {
      errors.push(`${label}.expected_output_files includes path outside allowed_paths: ${file}`);
    }
    if (pathMatchesAny(file, task.forbidden_paths ?? [])) {
      errors.push(`${label}.expected_output_files includes forbidden path: ${file}`);
    }
  }
  for (const command of task.validation_commands ?? []) {
    if (commandLooksWritey(command)) {
      errors.push(`${label}.validation_commands contains write-risk command without --dry-run: ${command}`);
    }
  }
}

function validatePlannerOutput(schema, output) {
  const errors = [];
  if (!assertObject(output, "planner output", errors)) return errors;

  const topRequired = new Set(schema.required ?? []);
  const topAllowed = new Set(Object.keys(schema.properties ?? {}));
  checkRequired(output, topRequired, "planner output", errors);
  checkNoExtra(output, topAllowed, "planner output", errors);
  checkString(output.planner_output_id, "planner_output_id", errors);
  checkString(output.source_goal_id, "source_goal_id", errors);
  checkSummary(schema, output.req_summary, "req_summary", errors);
  checkSummary(schema, output.tech_summary, "tech_summary", errors);
  checkStringList(output.validation_commands, "validation_commands", errors);
  checkString(output.created_at, "created_at", errors);

  if (!Array.isArray(output.tasks) || output.tasks.length === 0) {
    errors.push("tasks must be a non-empty array.");
  }
  if (!Array.isArray(output.agent_assignments) || output.agent_assignments.length === 0) {
    errors.push("agent_assignments must be a non-empty array.");
  }
  if (!Array.isArray(output.expected_outputs) || output.expected_outputs.length === 0) {
    errors.push("expected_outputs must be a non-empty array.");
  }

  const tasks = output.tasks ?? [];
  tasks.forEach((task, index) => checkTask(schema, task, index, output, errors));
  const tasksById = new Map(tasks.map((task) => [task.task_id, task]));
  if (tasksById.size !== tasks.length) {
    errors.push("tasks must have unique task_id values.");
  }

  const agents = enumValues(schema, "agent");
  for (const [index, assignment] of (output.agent_assignments ?? []).entries()) {
    const label = `agent_assignments[${index}]`;
    if (!assertObject(assignment, label, errors)) continue;
    checkRequired(assignment, requiredFields(schema, "agentAssignment"), label, errors);
    checkNoExtra(assignment, allowedFields(schema, "agentAssignment"), label, errors);
    checkEnum(assignment.agent, agents, `${label}.agent`, errors);
    checkStringList(assignment.task_ids, `${label}.task_ids`, errors);
    checkString(assignment.reason, `${label}.reason`, errors);
    for (const taskId of assignment.task_ids ?? []) {
      const task = tasksById.get(taskId);
      if (!task) {
        errors.push(`${label}.task_ids references unknown task: ${taskId}`);
      } else if (task.owner !== assignment.agent) {
        errors.push(`${label}.task_ids references task owned by ${task.owner}: ${taskId}`);
      }
    }
  }

  const expectedSeen = new Set();
  for (const [index, item] of (output.expected_outputs ?? []).entries()) {
    const label = `expected_outputs[${index}]`;
    if (!assertObject(item, label, errors)) continue;
    checkRequired(item, requiredFields(schema, "expectedOutput"), label, errors);
    checkNoExtra(item, allowedFields(schema, "expectedOutput"), label, errors);
    checkString(item.task_id, `${label}.task_id`, errors);
    checkString(item.path, `${label}.path`, errors);
    const task = tasksById.get(item.task_id);
    if (!task) {
      errors.push(`${label}.task_id references unknown task: ${item.task_id}`);
    } else if (!task.expected_output_files.includes(item.path)) {
      errors.push(`${label}.path is not listed by task ${item.task_id}: ${item.path}`);
    }
    expectedSeen.add(`${item.task_id}\n${item.path}`);
  }

  for (const task of tasks) {
    for (const path of task.expected_output_files ?? []) {
      if (!expectedSeen.has(`${task.task_id}\n${path}`)) {
        errors.push(`expected_outputs missing path for ${task.task_id}: ${path}`);
      }
    }
  }

  const risks = enumValues(schema, "riskLevel");
  const risk = output.risk_assessment;
  if (assertObject(risk, "risk_assessment", errors)) {
    checkRequired(risk, requiredFields(schema, "riskAssessment"), "risk_assessment", errors);
    checkNoExtra(risk, allowedFields(schema, "riskAssessment"), "risk_assessment", errors);
    checkEnum(risk.overall_risk, risks, "risk_assessment.overall_risk", errors);
    if (typeof risk.requires_human_approval !== "boolean") {
      errors.push("risk_assessment.requires_human_approval must be boolean.");
    }
    checkStringList(risk.blocked_paths, "risk_assessment.blocked_paths", errors);
    checkStringList(risk.notes, "risk_assessment.notes", errors);
  }

  for (const [index, item] of (output.dispatch_plan ?? []).entries()) {
    const label = `dispatch_plan[${index}]`;
    if (!assertObject(item, label, errors)) continue;
    checkRequired(item, requiredFields(schema, "dispatchPlanItem"), label, errors);
    checkNoExtra(item, allowedFields(schema, "dispatchPlanItem"), label, errors);
    checkString(item.task_id, `${label}.task_id`, errors);
    checkEnum(item.owner, agents, `${label}.owner`, errors);
    checkString(item.mode, `${label}.mode`, errors);
    const task = tasksById.get(item.task_id);
    if (!task) {
      errors.push(`${label}.task_id references unknown task: ${item.task_id}`);
    } else if (task.owner !== item.owner) {
      errors.push(`${label}.owner does not match task owner for ${item.task_id}.`);
    }
  }

  for (const command of output.validation_commands ?? []) {
    if (commandLooksWritey(command)) {
      errors.push(`validation_commands contains write-risk command without --dry-run: ${command}`);
    }
  }

  return errors;
}

function printSummary({ input, schema, output }) {
  console.log("# Planner Output Validation");
  console.log("");
  console.log(`input: ${input}`);
  console.log(`schema: ${schema}`);
  console.log(`planner_output_id: ${output.planner_output_id}`);
  console.log(`source_goal_id: ${output.source_goal_id}`);
  console.log(`task candidates checked: ${(output.tasks ?? []).length}`);
  console.log("");
  console.log("## Owner Assignment And Expected Outputs");
  for (const task of output.tasks ?? []) {
    console.log(`- ${task.task_id} -> ${task.owner}`);
    console.log(`  owner reason: ${task.owner_assignment_reason}`);
    console.log(`  expected outputs: ${task.expected_output_files.join(", ")}`);
  }
  console.log("");
  console.log("No queue, event, lock, result, prompt, business, deploy, or environment files were written.");
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const [schema, output] = await Promise.all([
  readJson(args.schema),
  readJson(args.input)
]);
const errors = validatePlannerOutput(schema, output);

if (errors.length > 0) {
  console.error("# Planner Output Validation Failed");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

printSummary({ input: args.input, schema: args.schema, output });
