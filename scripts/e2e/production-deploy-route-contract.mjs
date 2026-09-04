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
const ciWorkflow = workflowFiles.find(({ name }) => name === "ci.yml")?.source || "";
assert.match(
  ciWorkflow,
  /node-version:\s*24[\s\S]*?run: pnpm test:unit/,
  "CI unit tests must use the verified Node 24 runtime",
);
const apiPackage = JSON.parse(readFileSync(resolve(root, "apps/api/package.json"), "utf8"));
assert.match(
  apiPackage.scripts?.["test:unit"] || "",
  /node --test --test-force-exit --test-reporter=dot --require ts-node\/register/,
  "API unit tests must compact output and exit once all top-level tests finish",
);
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
const classifyJob = source.indexOf("  classify:\n");
const verifyJob = source.indexOf("  verify:\n");
const verifiedScopeGate = source.indexOf("Enforce verified deployment scope");
const verifyJobSource = source.slice(verifyJob, source.indexOf("  deploy:\n"));

assert.ok(boundaryGate >= 0, "production workflow must call the path boundary gate");
assert.ok(
  boundaryGate < deploymentMode,
  "path boundary gate must run before deployment mode resolution",
);
assert.ok(boundaryGate < deployStep, "path boundary gate must run before deployment");
assert.ok(classifyJob >= 0 && classifyJob < verifyJob, "classification must run before verification");
assert.match(source, /verify:\n[\s\S]*?needs: classify/);
assert.match(
  verifyJobSource,
  /- name: Checkout\n\s+uses: actions\/checkout@v5\n\s+with:\n\s+fetch-depth: 0/,
  "production verification must retain the signed gate's fixed ancestor commit",
);
assert.match(source, /deploy:\n[\s\S]*?needs: \[classify, verify\]/);
assert.match(source, /needs\.classify\.outputs\.mode != 'ops-only'/);
assert.ok(verifiedScopeGate > deploymentMode && verifiedScopeGate < deployStep);
assert.match(source, /scripts\/assert-verified-production-deploy-scope\.mjs/);
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
assert.match(source, /scripts\/resolve-production-deploy-scope\.mjs/);
assert.match(source, /scripts\/production-deploy-transfer-manifest\.mjs/);
assert.match(source, /production-deploy-transfer\.contract\.mjs/);
assert.match(
  source,
  /node-version:\s*24[\s\S]*?pnpm test:unit:web[\s\S]*?pnpm --filter @jinhu\/api test:unit[\s\S]*?pnpm test:unit/,
  "deployment verification must use the verified Node 24 runtime",
);
assert.match(source, /diagnose-yuzhou-hr-production-target/);
assert.match(source, /diagnose-yuzhou-hr-preimport-snapshot/);
assert.match(source, /diagnose-yuzhou-hr-production-source-manifest/);
assert.match(source, /diagnose-yuzhou-hr-production-t0-target-inventory/);
assert.match(source, /diagnose-yuzhou-hr-production-target-inventory/);
assert.match(source, /Diagnose Yuzhou HR production target \(read-only\)/);
assert.match(source, /scripts\/diagnose-yuzhou-hr-production-target\.sh/);
assert.match(source, /scripts\/diagnose-yuzhou-hr-production-preimport-snapshot\.sh/);
assert.match(source, /Diagnose Yuzhou HR production source manifest \(read-only\)/);
assert.match(source, /Diagnose Yuzhou HR T0 target inventory \(read-only\)/);
assert.match(source, /Diagnose Yuzhou HR T0-T3 target inventory \(read-only\)/);
assert.match(source, /scripts\/prepare-yuzhou-production-source-manifest\.mjs/);
assert.match(source, /source_manifest_json/);
assert.match(source, /verifyProductionSourceManifest/);
assert.match(
  source,
  /inputs\.deploy_mode != 'diagnose-yuzhou-hr-production-target'[\s\S]*?steps\.deploy-mode\.outputs\.mode != 'ops-only'/,
  "Yuzhou HR target diagnosis must remain outside deployment, seed, and release-marker steps",
);
assert.match(
  source,
  /inputs\.deploy_mode != 'diagnose-yuzhou-hr-production-source-manifest'[\s\S]*?steps\.deploy-mode\.outputs\.mode != 'ops-only'/,
  "Yuzhou HR source-manifest diagnosis must remain outside deployment, seed, and release-marker steps",
);
assert.match(
  source,
  /inputs\.deploy_mode != 'diagnose-yuzhou-hr-production-t0-target-inventory'[\s\S]*?steps\.deploy-mode\.outputs\.mode != 'ops-only'/,
  "Yuzhou HR T0 target inventory diagnosis must remain outside deployment, seed, and release-marker steps",
);
assert.match(
  source,
  /inputs\.deploy_mode != 'diagnose-yuzhou-hr-production-target-inventory'[\s\S]*?steps\.deploy-mode\.outputs\.mode != 'ops-only'/,
  "Yuzhou HR T0-T3 target inventory diagnosis must remain outside deployment, seed, and release-marker steps",
);
const sourceManifestDiagnostic = source.slice(
  source.indexOf("Diagnose Yuzhou HR production source manifest (read-only)"),
  source.indexOf("Diagnose Yuzhou HR T0 target inventory (read-only)"),
);
assert.doesNotMatch(
  sourceManifestDiagnostic,
  /(?:rsync|ssh |\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|go-live-uat)/,
  "Yuzhou HR source-manifest diagnosis must not transfer files or enter a deployment path",
);
const targetInventoryDiagnostic = source.slice(
  source.indexOf("Diagnose Yuzhou HR T0 target inventory (read-only)"),
  source.indexOf("Diagnose Yuzhou HR T0-T3 target inventory (read-only)"),
);
assert.match(targetInventoryDiagnostic, /scripts\/diagnose-yuzhou-hr-production-t0-target-inventory\.sh/);
assert.match(targetInventoryDiagnostic, /verifyProductionSourceManifest/);
assert.doesNotMatch(
  targetInventoryDiagnostic,
  /(?:\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|go-live-uat)/,
  "Yuzhou HR T0 target inventory diagnosis must not enter a deployment path",
);
const fullTargetInventoryDiagnostic = source.slice(
  source.indexOf("Diagnose Yuzhou HR T0-T3 target inventory (read-only)"),
  source.indexOf("Prepare Yuzhou HR production data volume"),
);
assert.match(fullTargetInventoryDiagnostic, /scripts\/diagnose-yuzhou-hr-production-target-inventory\.sh/);
assert.match(fullTargetInventoryDiagnostic, /verifyProductionSourceManifest/);
assert.doesNotMatch(
  fullTargetInventoryDiagnostic,
  /(?:\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|go-live-uat)/,
  "Yuzhou HR T0-T3 target inventory diagnosis must not enter a deployment path",
);
assert.match(source, /if \[ "\$PROD_DEPLOY_MODE" = "full" \]/);
assert.match(source, /rsync -az --delete[\s\S]*?--exclude='node_modules\/'[\s\S]*?"\$path\/"/);
assert.match(source, /- database/);
assert.match(source, /mode != 'ops-only'/);
assert.match(source, /mode == 'database' \|\| steps\.deploy-mode\.outputs\.mode == 'full'/);

const deployScript = readFileSync(resolve(root, "scripts/prod-deploy.sh"), "utf8");
assert.match(deployScript, /deploy_database\(\)/);
assert.match(deployScript, /database\)\s*\n\s*deploy_database/);
const apiFunction = deployScript.match(/deploy_api\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(apiFunction, /compose build api/);
assert.doesNotMatch(apiFunction, /run_migrations_and_optional_seed/);
const databaseFunction = deployScript.match(/deploy_database\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(databaseFunction, /run_migrations_and_optional_seed/);
assert.doesNotMatch(databaseFunction, /compose build (?:api|web)/);

for (const { name: candidateName, source: candidateSource } of workflowFiles) {
  if (candidateName === "deploy-production.yml") continue;
  assert.doesNotMatch(
    candidateSource,
    /pnpm\s+prod:deploy/,
    `${candidateName} must not become a parallel Production deployment route`,
  );
}

console.log("Production deploy route contract passed.");
