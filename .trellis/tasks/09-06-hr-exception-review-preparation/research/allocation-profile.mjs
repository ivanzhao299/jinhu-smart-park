// Bounded synthetic-only diagnostic. No production inputs, DB, keys or network.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const rows = 50000;
const source = name => readFileSync(resolve(root, "scripts/hr-cutover", name), "utf8");
const absoluteImports = text => text.replace(/from "(\.\/[^"]+)"/g, (_, name) => 'from "' + pathToFileURL(resolve(root, "scripts/hr-cutover", name)).href + '"');
const insert = (text, anchor, stage) => {
  if (text.split(anchor).length !== 2) throw Error("PROFILE_ANCHOR_CHANGED");
  return text.replace(anchor, 'globalThis.__hrAllocationSample("' + stage + '");\n  ' + anchor);
};
const moduleUrl = text => "data:text/javascript;base64," + Buffer.from(text).toString("base64");
let generator = source("production-import-payload-generator.mjs");
for (const [anchor, stage] of [
  ["const stagedBySource = validateStaging(staging, model);", "generator.validated_documents"],
  ["const generatedBySource = new Map();", "generator.indexed_sources"],
  ["if (generatedBySource.size !== stagedBySource.size)", "generator.generated_rows"],
  ["const artifactText =", "generator.bundle_object"],
  ["planPhases.push(", "generator.bundle_serialized"],
  ["return {\n    formatVersion: 1,\n    generatorKind:", "generator.complete"]
]) generator = insert(generator, anchor, stage);
let bridge = source("production-import-real-artifact-bridge.mjs");
bridge = bridge.replace('"./production-import-payload-generator.mjs"', JSON.stringify(moduleUrl(absoluteImports(generator))));
for (const [anchor, stage] of [
  ["const phases = input.phaseArtifacts.map(", "bridge.before_parse"],
  ["const stagingArtifact = envelope({", "bridge.parsed_documents"],
  ["const artifacts = { stagingArtifact", "bridge.envelopes_ready"],
  ["let generated;", "bridge.before_generator"],
  ["return {\n    formatVersion: 1,\n    bridgeKind:", "bridge.complete"]
]) {
  // Two bridge return paths exist; measure only the READY path below.
  if (stage === "bridge.complete") continue;
  bridge = insert(bridge, anchor, stage);
}
let fixture = readFileSync(resolve(root, "scripts/e2e/yuzhou-production-import-real-artifact-bridge-contract.mjs"), "utf8").split("const ready = bridgeProductionImportRealArtifacts(baseInput);")[0];
if (!fixture.includes("const baseInput = {")) throw Error("PROFILE_FIXTURE_CHANGED");
fixture = fixture.replace('"../hr-cutover/production-import-real-artifact-bridge.mjs"', JSON.stringify(moduleUrl(absoluteImports(bridge))));
fixture = fixture.replace(/from "(\.\.\/hr-cutover\/[^"]+)"/g, (_, name) => 'from "' + pathToFileURL(resolve(root, "scripts/e2e", name)).href + '"');
const setup = `
globalThis.__hrAllocationSample = stage => {
 const {rss,heapUsed,external,arrayBuffers}=process.memoryUsage();
 console.log(JSON.stringify({stage,rss,heapUsed,external,arrayBuffers}));
 if(rss>1536*1024**2) { console.log(JSON.stringify({status:"PROFILE_MEMORY_GUARD"}));process.exit(2); }
};
`;
const exercise = `
const typeDecision=decisionRecords.find(row=>row.targetTable==="hr_contract_type");
const typeSource=records.find(row=>row.targetTable==="hr_contract_type");
for(let i=0;i<${rows};i++){
 const identity=sha("allocation-profile-"+i),record={...typeSource,sourceIdentitySha256:identity,sourcePkCanonical:"sha256:"+identity,sourceRowSha256:sha("allocation-row-"+i)};
 records.push(record);phaseDocuments.T2.records.push(record);
 const fields={...typeDecision.targetFields};
 for(const key of Object.keys(fields))if(typeof fields[key]==="string")fields[key]+="_"+i;
 decisionRecords.push({...typeDecision,sourceIdentitySha256:identity,targetFields:fields});
}
for(const [phase,value]of Object.entries(phaseDocuments))phaseArtifacts[phase]=explicit("/synthetic/"+phase+".json",value);
baseInput.phaseArtifacts=Object.values(phaseArtifacts);
decisionsContent.stagingArtifactSha256=envelopeHash({...stagingContent,records:["T0","T1","T2","T3"].flatMap(phase=>phaseDocuments[phase].records)});
decisionsContent.phaseManifests=Object.fromEntries(Object.entries(phaseArtifacts).map(([p,a])=>[p,a.sha256]));
baseInput.decisionsArtifact=roleArtifact("decisions","yuzhou_hr_production_import_real_decisions",decisionsContent);
globalThis.__hrAllocationSample("fixture.ready");
const result=bridgeProductionImportRealArtifacts(baseInput);
if(result.status!=="READY")console.log(JSON.stringify({status:result.status,reasonCodes:result.reasonCodes}));
assert.equal(result.status,"READY");assert.equal(result.generationEvidence.recordCount,${rows}+16);
globalThis.__hrAllocationSample("result.retained");
console.log(JSON.stringify({status:"SYNTHETIC_PROFILE_PASS",records:result.generationEvidence.recordCount,maxRssKiB:process.resourceUsage().maxRSS,productionImportExecuted:false}));
`;
const child = spawnSync(process.execPath, ["--max-old-space-size=768", "--input-type=module", "-"], {
  cwd:root,input:setup+fixture+exercise,encoding:"utf8",timeout:120000,maxBuffer:1048576
});
for (const line of (child.stdout??"").trim().split("\n").filter(Boolean)) {
  const item=JSON.parse(line); console.log(JSON.stringify(item));
}
if(child.status!==0){
 console.log(JSON.stringify({status:"SYNTHETIC_PROFILE_FAILED",exitCode:child.status,signal:child.signal??null,reason:child.error?.code??(/heap out of memory/i.test(child.stderr??"")?"HEAP_LIMIT":"PROCESS_FAILED")}));
 process.exitCode=1;
}
console.log(JSON.stringify({sourceSha256:createHash("sha256").update(source("production-import-payload-generator.mjs")).digest("hex"),sealedPlanSourceSha256:createHash("sha256").update(source("production-import-sealed-plan-lib.mjs")).digest("hex"),syntheticOnly:true}));
