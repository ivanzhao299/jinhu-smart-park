import process from "node:process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportTargetCanonicalHash,stableProductionImportCanonicalJson } from "./production-import-target-model.mjs";
import { computeProductionImportPayloadHash, computeProductionImportPayloadBundleHash } from "./production-import-sealed-plan-lib.mjs";

import { splitYuzhouIncrementalPackage, serializeIncrementalPackage } from "./yuzhou-incremental-package-limits.mjs";
import { verifyInsurancePolicySource, YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE } from "./yuzhou-insurance-policy-incremental-projection.mjs";

const fail = () => { throw new Error("INITIAL_BASELINE_PREPARATION_INVALID"); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function privateRead(path) {
  const absolute = resolve(path), stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || realpathSync(absolute) !== absolute) fail();
  return readFileSync(absolute);
}

/** Offline only. The API independently authenticates this against live original receipts. */
export function prepareInitialWitnessPackage({ plan, payloadBytes, incrementalPackage, originalInsuranceSources = [] }) {
  const bundle = JSON.parse(payloadBytes.toString("utf8"));
  const phases = plan.phases.filter(phase => phase.phase === bundle.phase);
  if (phases.length !== 1 || !["T0","T2","T3"].includes(bundle.phase)) fail();
  const phase = phases[0];
  if (bundle.artifactKind !== "yuzhou_hr_production_import_payload_bundle" || bundle.formatVersion !== 2
    || bundle.canonicalizationVersion !== model.canonicalizationVersion || phase.canonicalizationVersion !== model.canonicalizationVersion
    || phase.payloadBundleArtifactSha256 !== hash(payloadBytes) || phase.payloadBundleSha256 !== computeProductionImportPayloadBundleHash(bundle)
    || phase.sourceBatchManifestSha256 !== bundle.sourceBatchManifestSha256
    || stableProductionImportCanonicalJson(bundle.targetScope) !== stableProductionImportCanonicalJson(plan.targetScope)) fail();
  const records = new Map(), payloads = new Map();
  for (const p of plan.phases) for (const record of p.records) {
    const key = `${p.phase}:${record.sourceIdentitySha256}`;
    if (records.has(key)) fail();
    records.set(key,record);
  }
  for (const payload of bundle.records) {
    if (payloads.has(payload.sourceIdentitySha256)) fail();
    payloads.set(payload.sourceIdentitySha256,payload);
  }
  const rawPolicies = new Map();
  if (!Array.isArray(originalInsuranceSources) || (bundle.phase !== "T3" && originalInsuranceSources.length)) fail();
  for (const raw of originalInsuranceSources) {
    const verified = verifyInsurancePolicySource(raw);
    if (Object.keys(verified.source).length !== YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE.length || rawPolicies.has(raw.sourceIdentitySha256)) fail();
    rawPolicies.set(raw.sourceIdentitySha256, verified);
  }
  function originalProjection(identity, table) {
    const record = records.get(`${bundle.phase}:${identity}`), row = payloads.get(identity);
    if (!record || !row || record.sourcePkCanonical !== `sha256:${identity}`
      || record.sourceSystem !== "yuzhou-v10" || record.targetTable !== table || row.targetTable !== table
      || !["insert","merge","skip_approved"].includes(record.disposition) || !record.targetId || row.sourceRowSha256 !== record.sourceRowSha256
      || row.payloadSha256 !== record.payloadSha256 || computeProductionImportPayloadHash(row.payload) !== row.payloadSha256) fail();
    const rule = model.targetTables[table], derived = {};
    for (const fk of rule.foreignKeys) {
      const refs = record.dependencyRefs.filter(ref => ref.role === fk.dependencyRole);
      if (!refs.length && !fk.required) { derived[fk.column] = null; continue; }
      if (refs.length !== 1 || refs[0].expectedTargetTable !== fk.targetTable) fail();
      const dependency = records.get(`${refs[0].phase}:${refs[0].sourceIdentitySha256}`);
      if (!dependency?.targetId || dependency.targetTable !== fk.targetTable || !["insert","merge","skip_approved"].includes(dependency.disposition)) fail();
      derived[fk.column] = dependency.targetId;
    }
    const projection = {tenant_id:plan.targetScope.tenantId,park_id:plan.targetScope.parkId};
    for (const column of rule.canonicalFields) projection[column] = rule.derivedFields.includes(column) ? derived[column] ?? null : row.payload[column] ?? null;
    if (computeProductionImportTargetCanonicalHash(table,plan.targetScope,row.payload,derived) !== record.expectedTargetAfterSha256) fail();
    return { targetId: record.targetId, projection };
  }
  const scaled = (value, scale) => {
    if (value === null) return null;
    if (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/u.test(value)) fail();
    const [whole, fraction = ""] = value.replace(/^[+-]/u, "").split(".");
    if (fraction.length > scale) fail();
    return BigInt(`${value.startsWith("-") ? "-" : ""}${whole}${fraction.padEnd(scale,"0")}`);
  };
  let witnessed = 0;
  const items = incrementalPackage.items.map(item => {
    if (bundle.phase === "T3" && item.domain === "insurance_policy") {
      const identity = item.sourceKey.slice(7), record = records.get(`T3:${identity}`), row = payloads.get(identity);
      if (!record && !row) return item;
      const raw = rawPolicies.get(identity);
      if (!raw || item.sourceTable !== "dbo.insure_method" || record?.sourceTable !== item.sourceTable || raw.sourceRowSha256 !== record.sourceRowSha256) fail();
      const policy = originalProjection(identity,"hr_insurance_policy"), p = policy.projection;
      if (p.policy_code !== `YUZHOU-${raw.source.id}` || p.policy_name !== raw.source.des || p.scope_description !== raw.source.rightscope || p.status !== "historical" || p.is_historical_import !== true) fail();
      const children = [...records.values()].filter(r => r.targetTable === "hr_insurance_policy_item" && r.dependencyRefs?.some(ref => ref.role === "policy" && ref.phase === "T3" && ref.sourceIdentitySha256 === identity));
      if (children.length !== 6) fail();
      const seen = new Set(), targets = new Set([policy.targetId]);
      const childItems = children.map(child => {
        const witness = originalProjection(child.sourceIdentitySha256,"hr_insurance_policy_item"), v = witness.projection;
        const kind = v.insurance_kind, discriminator = `${kind}\0${1}`;
        if (!["oldage","remedy","losework","fund","wound","bear"].includes(kind) || v.variant_no !== 1 || seen.has(kind) || targets.has(witness.targetId)
          || child.sourceTable !== "dbo.insure_method" || child.dependencyRefs.length !== 1 || v.policy_id !== policy.targetId
          || child.sourceIdentitySha256 !== hash(`yuzhou-hr-production-source-projection-v1\0${identity}\0hr_insurance_policy_item\0${discriminator}`)
          || child.sourceRowSha256 !== hash(stableProductionImportCanonicalJson({parentSourceRowSha256:raw.sourceRowSha256,discriminator}))
          || stableProductionImportCanonicalJson(v.source_snapshot) !== stableProductionImportCanonicalJson({sourceRowSha256:raw.sourceRowSha256})) fail();
        seen.add(kind); targets.add(witness.targetId);
        for (const [suffix, component] of [["","base"],["_e","employer"],["_p","employee"],["_pc","supplement"]]) {
          const rate = scaled(raw.source[`${kind}${suffix}`],3);
          if (scaled(v[`${component}_rate`],6) !== (rate === null ? null : rate * 10n) || scaled(v[`${component}_fixed_amount`],3) !== scaled(raw.source[`${kind}${suffix}2`],3)) fail();
        }
        return witness;
      }).sort((a,b) => a.projection.insurance_kind.localeCompare(b.projection.insurance_kind));
      witnessed++;
      return {...item,insurancePolicyBaselineWitness:{operationId:plan.operationId,source:globalThis.structuredClone(raw.source),policy,items:childItems}};
    }
    const table = item.domain === "organization" ? "sys_org" : item.domain === "position" ? "hr_position" : item.domain === "employee" ? "hr_employee" : item.domain === "contract" ? "hr_contract" : null;
    if (!table || model.targetTables[table].phase !== bundle.phase) return item;
    const identity = item.sourceKey.slice(7), record = records.get(`${bundle.phase}:${identity}`), row = payloads.get(identity);
    // New source rows have no original baseline. Never infer one from current targets.
    if (!record && !row) return item;
    if (!record || !row || record.sourcePkCanonical !== item.sourceKey || record.sourceTable !== item.sourceTable
      || record.sourceSystem !== "yuzhou-v10" || record.targetTable !== table || row.targetTable !== table
      || !["insert","merge","skip_approved"].includes(record.disposition) || !record.targetId || row.sourceRowSha256 !== record.sourceRowSha256
      || row.payloadSha256 !== record.payloadSha256 || computeProductionImportPayloadHash(row.payload) !== row.payloadSha256) fail();
    const {projection} = originalProjection(identity,table);
    witnessed++;
    return {...item,initialBaselineWitness:{version:1,operationId:plan.operationId,phase:bundle.phase,canonicalizationVersion:model.canonicalizationVersion,targetId:record.targetId,projection}};
  });
  return { package:{...incrementalPackage,items},witnessed };
}

export function main(args) {
  const options = {};
  for (let i=0;i<args.length;i+=2) {
    if (!["--plan","--payload","--package","--out","--original-insurance-source"].includes(args[i]) || !args[i+1] || options[args[i]]) fail();
    options[args[i]]=args[i+1];
  }
  if (!["--plan","--payload","--package","--out"].every(key=>options[key])) fail();
  const output=resolve(options["--out"]), parent=lstatSync(dirname(output));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777)!==0o700 || realpathSync(dirname(output))!==dirname(output)) fail();
  const result=prepareInitialWitnessPackage({plan:JSON.parse(privateRead(options["--plan"])),payloadBytes:privateRead(options["--payload"]),incrementalPackage:JSON.parse(privateRead(options["--package"])),originalInsuranceSources:options["--original-insurance-source"]?JSON.parse(privateRead(options["--original-insurance-source"])):[]});
  const packages=splitYuzhouIncrementalPackage(result.package);
  const paths=packages.map((_,index)=>packages.length===1?output:`${output}.part-${String(index+1).padStart(4,"0")}.json`);
  if(paths.some(path=>existsSync(path)))fail();
  for (const [index,pkg] of packages.entries()) writeFileSync(paths[index],serializeIncrementalPackage(pkg),{mode:0o600,flag:"wx"});
  process.stdout.write(`${JSON.stringify({status:"PREPARED_NOT_ACCEPTED",witnessed:result.witnessed,itemCount:result.package.items.length,packageCount:packages.length,packageSha256:packages.map(pkg=>hash(serializeIncrementalPackage(pkg)))})}\n`);
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { const code=["YUZHOU_INCREMENTAL_SINGLE_ITEM_EXCEEDS_BYTE_LIMIT","YUZHOU_INCREMENTAL_MANIFEST_ID_TOO_LONG"].includes(error.message)?error.message:"INITIAL_BASELINE_PREPARATION_INVALID"; process.stderr.write(`${code}\n`); process.exitCode=1; }
}
