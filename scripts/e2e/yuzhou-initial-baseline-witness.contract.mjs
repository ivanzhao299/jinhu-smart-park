import process from "node:process";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync,statSync,realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model,computeProductionImportTargetCanonicalHash,stableProductionImportCanonicalJson } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportPayloadHash,computeProductionImportPayloadBundleHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { prepareInitialWitnessPackage } from "../hr-cutover/prepare-yuzhou-initial-baseline-witness.mjs";
const shared=createRequire(import.meta.url)("../../packages/shared/dist/index.js");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const scope={tenantId:"fixture-tenant",parkId:"fixture-park",scopeSha256:hash("scope")},identity=hash("person"),orgIdentity=hash("org"),orgId=randomUUID(),targetId=randomUUID();
  const payload=Object.fromEntries(model.targetTables.hr_employee.fieldWhitelist.map(k=>[k,null]));
  Object.assign(payload,{employee_code:"FIX-1",full_name:"Synthetic",employment_type:"full_time",employment_status:"active",hire_date:"2020-01-01"});
  const payloadRow={sourceIdentitySha256:identity,sourceRowSha256:hash("source-row"),targetTable:"hr_employee",payloadSha256:computeProductionImportPayloadHash(payload),payload};
  const bundle={artifactKind:"yuzhou_hr_production_import_payload_bundle",canonicalizationVersion:model.canonicalizationVersion,formatVersion:1,phase:"T0",records:[payloadRow],sourceBatchManifestSha256:hash("manifest"),targetScope:scope};
  const payloadBytes=Buffer.from(`${JSON.stringify(bundle)}\n`);
  const record={...payloadRow,sourceSystem:"yuzhou-v10",sourceTable:"dbo.person",sourcePkCanonical:`sha256:${identity}`,targetId,disposition:"insert",expectedTargetAfterSha256:computeProductionImportTargetCanonicalHash("hr_employee",scope,payload,{primary_org_id:orgId}),dependencyRefs:[{role:"primary_org",phase:"T0",sourceIdentitySha256:orgIdentity,expectedTargetTable:"sys_org"}]};delete record.payload;
  const plan={operationId:"yzprod-import-20261004T120000Z-123456abcdef",targetScope:scope,phases:[{phase:"T0",canonicalizationVersion:model.canonicalizationVersion,payloadBundleArtifactSha256:hash(payloadBytes),payloadBundleSha256:computeProductionImportPayloadBundleHash(bundle),sourceBatchManifestSha256:bundle.sourceBatchManifestSha256,records:[{sourceIdentitySha256:orgIdentity,targetTable:"sys_org",targetId:orgId,disposition:"insert"},record]}]};
  const incrementalPackage={version:1,sourceSystem:"yuzhou-v10",manifestId:"test",extractedAt:"2026-10-04T12:00:00Z",items:[{domain:"employee",sourceTable:"dbo.person",sourceKey:`sha256:${identity}`,rowDigest:hash("incremental"),fields:{fullName:"Later source"}}]};
  return {plan,payloadBytes,incrementalPackage};
}
test("frozen API model and canonical bytes match original writer including numeric object keys",()=>{
  for(const [table,fields] of Object.entries(shared.YUZHOU_INITIAL_PROJECTION_FIELDS)) assert.deepEqual(fields,[...model.targetTables[table].scopeColumns,...model.targetTables[table].canonicalFields]);
  for(const value of [{"10":"a","2":"b",x:{z:null,a:[1,true]}},null,["\u0000",1]]) assert.equal(shared.canonicalYuzhouInitialJson(value),stableProductionImportCanonicalJson(value));
});
test("real retained bundle shape produces complete original projection and binds package hash",()=>{
  const input=fixture(),result=prepareInitialWitnessPackage(input);assert.equal(result.witnessed,1);
  const witness=result.package.items[0].initialBaselineWitness;assert.equal(witness.projection.full_name,"Synthetic");assert.equal(witness.projection.position_id,null);assert.equal(witness.projection.tenant_id,input.plan.targetScope.tenantId);assert.equal(witness.projection.primary_org_id,input.plan.phases[0].records[0].targetId);
  assert.notEqual(hash(JSON.stringify(shared.canonicalYuzhouIncrementalPackage(input.incrementalPackage))),hash(JSON.stringify(shared.canonicalYuzhouIncrementalPackage(result.package))));
  assert.equal(result.package.items[0].rowDigest,input.incrementalPackage.items[0].rowDigest);
  const omitted={...input.incrementalPackage,items:input.incrementalPackage.items.map(item=>({...item,sourceUpdatedAt:undefined,initialBaselineWitness:undefined}))};
  assert.deepEqual(shared.canonicalYuzhouIncrementalPackage(omitted),shared.canonicalYuzhouIncrementalPackage(input.incrementalPackage));
  const noDep=fixture();noDep.plan.phases[0].records[1].dependencyRefs=[];assert.throws(()=>prepareInitialWitnessPackage(noDep),/PREPARATION_INVALID/);
  const forged=fixture();forged.plan.phases[0].records[1].expectedTargetAfterSha256=hash("forged");assert.throws(()=>prepareInitialWitnessPackage(forged),/PREPARATION_INVALID/);
  const tamper=fixture();tamper.payloadBytes=Buffer.from(tamper.payloadBytes.toString().replace("Synthetic","Forged"));assert.throws(()=>prepareInitialWitnessPackage(tamper),/PREPARATION_INVALID/);
});
test("private offline CLI writes exclusive 0600 package and emits only aggregate status",()=>{
  const dir=realpathSync(mkdtempSync(resolve(tmpdir(),"yuzhou-baseline-contract-")));chmodSync(dir,0o700);
  try {
    const input=fixture();for(const [name,content] of [["plan",JSON.stringify(input.plan)],["payload",input.payloadBytes],["package",JSON.stringify(input.incrementalPackage)]])writeFileSync(resolve(dir,name),content,{mode:0o600});
    const args=["scripts/hr-cutover/prepare-yuzhou-initial-baseline-witness.mjs","--plan",resolve(dir,"plan"),"--payload",resolve(dir,"payload"),"--package",resolve(dir,"package"),"--out",resolve(dir,"out")];
    const success=spawnSync(process.execPath,args,{encoding:"utf8"});assert.equal(success.status,0,success.stderr);assert.equal(JSON.parse(success.stdout).status,"PREPARED_NOT_ACCEPTED");assert.equal(success.stdout.includes("Synthetic"),false);assert.equal(statSync(resolve(dir,"out")).mode&0o777,0o600);assert.ok(JSON.parse(readFileSync(resolve(dir,"out"))).items[0].initialBaselineWitness);
    assert.equal(spawnSync(process.execPath,args,{encoding:"utf8"}).status,1);
    chmodSync(resolve(dir,"package"),0o644);args[args.length-1]=resolve(dir,"out2");assert.equal(spawnSync(process.execPath,args,{encoding:"utf8"}).status,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("byte and item caps include UTF-8 witnesses, exact envelope and newline",async()=>{
  const limits=await import("../hr-cutover/yuzhou-incremental-package-limits.mjs");
  assert.equal(limits.YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES,shared.YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES);
  const base={...fixture().incrementalPackage,items:[]};
  const large={...fixture().incrementalPackage.items[0],initialBaselineWitness:{projection:{source_snapshot:{notes:"汉".repeat(1500000)}}}};
  const batches=limits.splitYuzhouIncrementalPackage({...base,items:[large,large]});assert.equal(batches.length,2);
  for(const batch of batches)assert.ok(Buffer.byteLength(limits.serializeIncrementalPackage(batch))<=shared.YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES);
  assert.throws(()=>limits.splitYuzhouIncrementalPackage({...base,items:[{...large,fields:{fullName:"汉".repeat(3000000)}}]}),/SINGLE_ITEM_EXCEEDS_BYTE_LIMIT/);
  const small=fixture().incrementalPackage.items[0];assert.deepEqual(limits.splitYuzhouIncrementalPackage({...base,items:Array(2001).fill(small)}).map(p=>p.items.length),[2000,1]);
  // At the byte boundary, a single ASCII byte changes acceptance; overhead is counted.
  const one={...base,items:[{...small,fields:{fullName:""}}]};
  const padding=shared.YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES-limits.incrementalPackageBytes(one);
  one.items[0].fields.fullName="x".repeat(padding);assert.equal(limits.incrementalPackageBytes(one),shared.YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES);assert.equal(limits.splitYuzhouIncrementalPackage(one).length,1);
  one.items[0].fields.fullName+="x";assert.throws(()=>limits.splitYuzhouIncrementalPackage(one),/SINGLE_ITEM_EXCEEDS_BYTE_LIMIT/);
});
