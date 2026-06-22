#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VALID_AGENTS = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const rulesPath = join(orchestratorDir, "agent-router-rules.json");

function usage() {
  console.error('Usage: node ops/agent-orchestrator/scripts/route-natural-language-task.mjs --text "..." --dry-run');
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
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const deduped = [];

  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}

function domainTerms(domain) {
  return String(domain ?? "")
    .split(/[-_/\s]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function matchedKeywords(text, keywords) {
  const normalizedText = normalize(text);
  return (keywords ?? []).filter((keyword) => {
    const normalizedKeyword = normalize(keyword).trim();
    return normalizedKeyword && normalizedText.includes(normalizedKeyword);
  });
}

function matchedDomainTerms(text, domain) {
  const normalizedText = normalize(text);
  return domainTerms(domain).filter((term) => normalizedText.includes(normalize(term)));
}

function confidenceFor(score, fallbackUsed) {
  if (fallbackUsed) return "low";
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function routeTask(text, rules) {
  const agentEntries = Object.entries(rules.agents ?? {})
    .filter(([agent]) => VALID_AGENTS.includes(agent));

  const candidates = agentEntries.map(([agent, rule]) => {
    const keywords = matchedKeywords(text, rule.keywords);
    const domains = matchedDomainTerms(text, rule.domain);
    return {
      owner: agent,
      domain: rule.domain,
      matched_keywords: keywords,
      matched_domains: domains.length > 0 ? [rule.domain] : [],
      matched_domain_terms: domains,
      fallback_priority: Number(rule.fallback_priority ?? 999),
      score: (keywords.length * 10) + domains.length
    };
  });

  const matched = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.fallback_priority !== b.fallback_priority) return a.fallback_priority - b.fallback_priority;
      return a.owner.localeCompare(b.owner);
    });

  if (matched.length > 0) {
    const selected = matched[0];
    return {
      input_text: text,
      selected_owner: selected.owner,
      matched_domains: [selected.domain],
      matched_keywords: uniqueCaseInsensitive(selected.matched_keywords),
      confidence: confidenceFor(selected.score, false),
      fallback_used: false,
      reason: `Selected ${selected.owner} because the input matched ${selected.matched_keywords.length} keyword(s) for ${selected.domain}.`,
      all_matches: matched.map((candidate) => ({
        owner: candidate.owner,
        domain: candidate.domain,
        matched_keywords: uniqueCaseInsensitive(candidate.matched_keywords),
        matched_domain_terms: uniqueCaseInsensitive(candidate.matched_domain_terms),
        score: candidate.score
      }))
    };
  }

  const fallback = (rules.fallback_rules ?? []).find((rule) => rule.match === "unknown")
    ?? { owner: "agent-5", domain: "planning", reason: "Unknown requirement routes to agent-5 planning." };

  return {
    input_text: text,
    selected_owner: fallback.owner,
    matched_domains: [fallback.domain].filter(Boolean),
    matched_keywords: [],
    confidence: confidenceFor(0, true),
    fallback_used: true,
    reason: fallback.reason,
    all_matches: []
  };
}

function printResult(result) {
  console.log("# Natural Language Task Route dry-run");
  console.log("");
  console.log(`input text: ${result.input_text}`);
  console.log(`selected owner: ${result.selected_owner}`);
  console.log(`matched domains: ${result.matched_domains.length > 0 ? result.matched_domains.join(", ") : "none"}`);
  console.log(`matched keywords: ${result.matched_keywords.length > 0 ? result.matched_keywords.join(", ") : "none"}`);
  console.log(`confidence: ${result.confidence}`);
  console.log(`fallback used: ${result.fallback_used ? "yes" : "no"}`);
  console.log(`reason: ${result.reason}`);
  console.log("");
  console.log("all matches:");
  if (result.all_matches.length === 0) {
    console.log("- none");
    return;
  }

  for (const match of result.all_matches) {
    const keywords = match.matched_keywords.length > 0 ? match.matched_keywords.join(", ") : "none";
    const domainTerms = match.matched_domain_terms.length > 0 ? match.matched_domain_terms.join(", ") : "none";
    console.log(`- ${match.owner} | ${match.domain} | score=${match.score} | keywords=${keywords} | domain_terms=${domainTerms}`);
  }
}

const args = parseArgs(process.argv.slice(2));

if (!args.dryRun) {
  usage();
  console.error("This router smoke tool is dry-run only. Pass --dry-run to confirm no queue or event writes.");
  process.exit(1);
}

if (!args.text.trim()) {
  usage();
  console.error("Missing --text value.");
  process.exit(1);
}

const rules = await readJson(rulesPath);
const result = routeTask(args.text, rules);
printResult(result);
