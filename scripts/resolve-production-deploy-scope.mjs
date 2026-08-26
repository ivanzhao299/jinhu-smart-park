#!/usr/bin/env node

import { readFileSync } from "node:fs";

const MODES = new Set(["auto", "fast-css", "web", "api", "database", "full", "ops-only"]);
const requested = process.argv.find((arg) => arg.startsWith("--requested="))?.slice(12) || "auto";
const output = process.argv.includes("--github-output") ? "github" : "json";

if (!MODES.has(requested)) {
  throw new Error(`Unsupported deployment mode: ${requested}`);
}

const files = readFileSync(0, "utf8")
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

const isRuntimeCss = (file) => file === "apps/web/public/runtime-design-system.css";
const isGovernance = (file) =>
  /^(docs\/|\.trellis\/|README\.md$|AGENTS\.md$)/.test(file);
const isWeb = (file) => /^(apps\/web\/|packages\/ui\/)/.test(file);
const isApi = (file) => /^apps\/api\//.test(file) && !isDatabase(file);
function isDatabase(file) {
  return /^(database\/|scripts\/(db-migrate|db-seed-prod|check-init-baseline|bootstrap-admin)\.sh$)/.test(file);
}
const isShared = (file) =>
  /^(packages\/(shared|config)\/|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$)/.test(file) ||
  /^(apps|packages)\/[^/]+\/package\.json$/.test(file);
const isInfrastructure = (file) =>
  /^(infra\/|\.github\/workflows\/|apps\/[^/]+\/Dockerfile$|scripts\/(prod-deploy|prod-healthcheck|prod-docker-cleanup|ensure-production-secrets|validate-production-deploy-path)\.sh$|\.env(?:\.production)?\.example$)/.test(file);

function classify() {
  if (files.length === 0) return "full";
  if (files.every(isGovernance)) return "ops-only";
  if (files.every((file) => isRuntimeCss(file) || isGovernance(file)) && files.some(isRuntimeCss)) return "fast-css";
  if (files.some(isShared) || files.some(isInfrastructure)) return "full";

  const applicationFiles = files.filter((file) => !isGovernance(file));
  const hasWeb = applicationFiles.some(isWeb);
  const hasApi = applicationFiles.some(isApi);
  const hasDatabase = applicationFiles.some(isDatabase);
  const known = applicationFiles.every((file) => isWeb(file) || isApi(file) || isDatabase(file) || isRuntimeCss(file));

  if (!known) return "full";
  if (hasWeb && (hasApi || hasDatabase)) return "full";
  if (hasApi && hasDatabase) return "full";
  if (hasDatabase) return "database";
  if (hasApi) return "api";
  if (hasWeb || applicationFiles.every(isRuntimeCss)) return "web";
  return "full";
}

const automaticMode = classify();
if (requested !== "auto" && requested !== "full" && requested !== automaticMode) {
  throw new Error(`Requested deployment mode ${requested} does not match safely classified mode ${automaticMode}`);
}
const mode = requested === "auto" ? automaticMode : requested;
const result = {
  mode,
  build_web: mode === "web" || mode === "full",
  build_api: mode === "api" || mode === "full",
  run_migrations: mode === "api" || mode === "database" || mode === "full",
  deploy: mode !== "ops-only",
};

if (output === "github") {
  for (const [key, value] of Object.entries(result)) process.stdout.write(`${key}=${value}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ ...result, files })}\n`);
}
