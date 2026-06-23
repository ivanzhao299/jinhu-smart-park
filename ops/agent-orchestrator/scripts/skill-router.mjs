#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const skillRegistryPath = join(orchestratorDir, "skills", "skill-registry.json");
const skillRouterRulesPath = join(orchestratorDir, "skills", "skill-router-rules.json");

function usage() {
  console.error('Usage: node ops/agent-orchestrator/scripts/skill-router.mjs --text "..." --dry-run');
}

function parseArgs(argv) {
  const args = {
    text: "",
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--text") {
      args.text = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.text.trim()) {
    usage();
    throw new Error("Missing --text value.");
  }
  if (!args.dryRun) {
    usage();
    throw new Error("skill-router is dry-run only in the MVP. Pass --dry-run.");
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = normalize(value).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function matchKeywords(text, keywords = []) {
  const normalizedText = normalize(text);
  return (keywords ?? []).filter((keyword) => {
    const normalizedKeyword = normalize(keyword).trim();
    return normalizedKeyword && normalizedText.includes(normalizedKeyword);
  });
}

function skillMap(registry) {
  return new Map((registry.skills ?? []).map((skill) => [skill.skill_type, skill]));
}

function confidenceFor(score, fallbackUsed) {
  if (fallbackUsed) return 0.35;
  if (score >= 45) return 0.95;
  if (score >= 30) return 0.85;
  if (score >= 15) return 0.7;
  return 0.55;
}

export async function readSkillRouterConfig() {
  const [registry, rules] = await Promise.all([
    readJson(skillRegistryPath),
    readJson(skillRouterRulesPath)
  ]);
  return { registry, rules };
}

export function routeSkill(text, registry, rules) {
  const skillsByType = skillMap(registry);
  const candidates = (rules.rules ?? []).map((rule) => {
    const matched = matchKeywords(text, rule.keywords ?? []);
    const skill = skillsByType.get(rule.skill_type);
    const score = (matched.length * 10) + (matched.length > 0 ? Number(rule.confidence_boost ?? 0) : 0);
    return {
      rule,
      skill,
      matched_keywords: uniqueCaseInsensitive(matched),
      score
    };
  }).filter((candidate) => candidate.skill);

  const ranked = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.rule.rule_id).localeCompare(String(b.rule.rule_id));
    });

  const fallbackSkillType = rules.routing_policy?.fallback_skill_type ?? "code_development";
  const selected = ranked[0] ?? {
    rule: {
      rule_id: "RULE-FALLBACK",
      skill_type: fallbackSkillType,
      task_type: "planning",
      expected_output_type: "technical plan",
      runtime: rules.routing_policy?.fallback_runtime ?? "codex-cli",
      selected_agent: rules.routing_policy?.fallback_agent ?? "agent-5",
      reason: "No explicit skill keyword matched; fallback to code/planning."
    },
    skill: skillsByType.get(fallbackSkillType),
    matched_keywords: [],
    score: 0
  };

  const fallbackUsed = ranked.length === 0;
  const skill = selected.skill;
  const runtime = selected.rule.runtime ?? skill.default_runtime;
  const selectedAgent = selected.rule.selected_agent ?? skill.default_agent;
  const expectedOutputType = selected.rule.expected_output_type ?? skill.expected_output_types?.[0] ?? "report";

  return {
    input_text: text,
    detected_task_type: selected.rule.task_type ?? selected.rule.skill_type,
    selected_skill: selected.rule.skill_type,
    skill_id: skill.skill_id,
    selected_agent: selectedAgent,
    selected_runtime: runtime,
    confidence: confidenceFor(selected.score, fallbackUsed),
    required_inputs: skill.required_inputs ?? [],
    expected_outputs: [expectedOutputType],
    validation_commands: skill.validation_commands ?? [],
    risk_level: skill.risk_level ?? "MEDIUM",
    fallback_used: fallbackUsed,
    reason: selected.rule.reason ?? skill.purpose,
    matched_keywords: selected.matched_keywords,
    all_matches: ranked.map((candidate) => ({
      rule_id: candidate.rule.rule_id,
      skill_type: candidate.rule.skill_type,
      task_type: candidate.rule.task_type,
      selected_agent: candidate.rule.selected_agent ?? candidate.skill.default_agent,
      runtime: candidate.rule.runtime ?? candidate.skill.default_runtime,
      score: candidate.score,
      matched_keywords: candidate.matched_keywords
    }))
  };
}

export async function routeSkillForText(text) {
  const { registry, rules } = await readSkillRouterConfig();
  return routeSkill(text, registry, rules);
}

function printResult(result) {
  console.log("# Skill Route dry-run");
  console.log("");
  console.log(`input_text: ${result.input_text}`);
  console.log(`detected_task_type: ${result.detected_task_type}`);
  console.log(`selected_skill: ${result.selected_skill}`);
  console.log(`skill_id: ${result.skill_id}`);
  console.log(`selected_agent: ${result.selected_agent}`);
  console.log(`selected_runtime: ${result.selected_runtime}`);
  console.log(`confidence: ${result.confidence}`);
  console.log(`required_inputs: ${result.required_inputs.join(", ") || "none"}`);
  console.log(`expected_outputs: ${result.expected_outputs.join(", ") || "none"}`);
  console.log(`validation_commands: ${result.validation_commands.join(" ; ") || "none"}`);
  console.log(`risk_level: ${result.risk_level}`);
  console.log(`fallback_used: ${result.fallback_used ? "yes" : "no"}`);
  console.log(`reason: ${result.reason}`);
  console.log(`matched_keywords: ${result.matched_keywords.join(", ") || "none"}`);
  console.log("");
  console.log("all_matches:");
  if (result.all_matches.length === 0) {
    console.log("- none");
    return;
  }
  for (const match of result.all_matches) {
    console.log(`- ${match.rule_id} | ${match.skill_type}/${match.task_type} | agent=${match.selected_agent} | runtime=${match.runtime} | score=${match.score} | keywords=${match.matched_keywords.join(", ") || "none"}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await routeSkillForText(args.text);
  printResult(result);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
