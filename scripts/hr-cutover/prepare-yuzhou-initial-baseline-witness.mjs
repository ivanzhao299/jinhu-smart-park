import process from "node:process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportTargetCanonicalHash,stableProductionImportCanonicalJson } from "./production-import-target-model.mjs";
import { computeProductionImportPayloadHash, computeProductionImportPayloadBundleHash } from "./production-import-sealed-plan-lib.mjs";

import { splitYuzhouIncrementalPackage, serializeIncrementalPackage } from "./yuzhou-incremental-package-limits.mjs";

const fail = () => { throw new Error("INITIAL_BASELINE_PREPARATION_INVALID"); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function privateRead(path) {
  const absolute = resolve(path), stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || realpathSync(absolute) !== absolute) fail();
  return readFileSync(absolute);
}

/** Offline only. The API independently authenticates this against live original receipts. */
export function prepareInitialWitnessPackage({ plan, payloadBytes, incrementalPackage }) {
  const bundle = JSON.parse(payloadBytes.toString("utf8"));
  const phases = plan.phases.filter(phase => phase.phase === bundle.phase);
  if (phases.length !== 1 || !["T0","T2"].includes(bundle.phase)) fail();
  const phase = phases[0];
  if (bundle.artifactKind !== "yuzhou_hr_production_import_payload_bundle" || bundle.formatVersion !== 1
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
  let witnessed = 0;
  const items = incrementalPackage.items.map(item => {
    const table = item.domain === "employee" ? "hr_employee" : item.domain === "contract" ? "hr_contract" : null;
    if (!table || model.targetTables[table].phase !== bundle.phase) return item;
    const identity = item.sourceKey.slice(7), record = records.get(`${bundle.phase}:${identity}`), row = payloads.get(identity);
    // New source rows have no original baseline. Never infer one from current targets.
    if (!record && !row) return item;
    if (!record || !row || record.sourcePkCanonical !== item.sourceKey || record.sourceTable !== item.sourceTable
      || record.sourceSystem !== "yuzhou-v10" || record.targetTable !== table || row.targetTable !== table
      || record.disposition !== "insert" || !record.targetId || row.sourceRowSha256 !== record.sourceRowSha256
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
    witnessed++;
    return {...item,initialBaselineWitness:{version:1,operationId:plan.operationId,phase:bundle.phase,canonicalizationVersion:model.canonicalizationVersion,targetId:record.targetId,projection}};
  });
  return { package:{...incrementalPackage,items},witnessed };
}

export function main(args) {
  const options = {};
  for (let i=0;i<args.length;i+=2) {
    if (!["--plan","--payload","--package","--out"].includes(args[i]) || !args[i+1] || options[args[i]]) fail();
    options[args[i]]=args[i+1];
  }
  if (Object.keys(options).length !== 4) fail();
  const output=resolve(options["--out"]), parent=lstatSync(dirname(output));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777)!==0o700 || realpathSync(dirname(output))!==dirname(output)) fail();
  const result=prepareInitialWitnessPackage({plan:JSON.parse(privateRead(options["--plan"])),payloadBytes:privateRead(options["--payload"]),incrementalPackage:JSON.parse(privateRead(options["--package"]))});
  const packages=splitYuzhouIncrementalPackage(result.package);
  const paths=packages.map((_,index)=>packages.length===1?output:`${output}.part-${String(index+1).padStart(4,"0")}.json`);
  if(paths.some(path=>existsSync(path)))fail();
  for (const [index,pkg] of packages.entries()) writeFileSync(paths[index],serializeIncrementalPackage(pkg),{mode:0o600,flag:"wx"});
  process.stdout.write(`${JSON.stringify({status:"PREPARED_NOT_ACCEPTED",witnessed:result.witnessed,itemCount:result.package.items.length,packageCount:packages.length,packageSha256:packages.map(pkg=>hash(serializeIncrementalPackage(pkg)))})}\n`);
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { const code=["YUZHOU_INCREMENTAL_SINGLE_ITEM_EXCEEDS_BYTE_LIMIT","YUZHOU_INCREMENTAL_MANIFEST_ID_TOO_LONG"].includes(error.message)?error.message:"INITIAL_BASELINE_PREPARATION_INVALID"; process.stderr.write(`${code}\n`); process.exitCode=1; }
}
