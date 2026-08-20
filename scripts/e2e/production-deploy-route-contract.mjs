import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const workflowsDirectory = resolve(root, ".github/workflows");
const workflowFiles = readdirSync(workflowsDirectory)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => ({
    name,
    source: readFileSync(resolve(workflowsDirectory, name), "utf8"),
  }));

const deployWorkflows = workflowFiles.filter(({ source }) =>
  /^name:\s*Deploy Production\s*$/m.test(source),
);

assert.equal(
  deployWorkflows.length,
  1,
  "Smart Park must have exactly one Deploy Production workflow",
);

const [{ name, source }] = deployWorkflows;
assert.equal(name, "deploy-production.yml");
assert.match(source, /^\s{4}environment:\s*production\s*$/m);
assert.match(source, /secrets\.PROD_DEPLOY_PATH/);
assert.match(source, /https:\/\/park\.cnjinhu\.com\/api\/v1/);
assert.match(source, /https:\/\/park\.cnjinhu\.com/);
assert.doesNotMatch(source, /formal-production/);

const boundaryGate = source.indexOf(
  "Enforce Studio and production deployment path separation",
);
const deploymentMode = source.indexOf("Resolve deployment mode");
const deployStep = source.indexOf("      - name: Deploy\n");

assert.ok(boundaryGate >= 0, "production workflow must call the path boundary gate");
assert.ok(
  boundaryGate < deploymentMode,
  "path boundary gate must run before deployment mode resolution",
);
assert.ok(boundaryGate < deployStep, "path boundary gate must run before deployment");
assert.match(
  source,
  /scripts\/validate-production-deploy-path\.sh/,
  "production workflow must use the shared path guard",
);
assert.match(
  source,
  /PRUNE_DOCKER_AFTER_DEPLOY=yes/,
  "production deployment must retain post-health Docker cleanup",
);

for (const { name: candidateName, source: candidateSource } of workflowFiles) {
  if (candidateName === "deploy-production.yml") continue;
  assert.doesNotMatch(
    candidateSource,
    /pnpm\s+prod:deploy/,
    `${candidateName} must not become a parallel Production deployment route`,
  );
}

console.log("Production deploy route contract passed.");
