import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { prepareNonfileStage } from "../prepare-yuzhou-t5-nonfile-materialization-stage.mjs";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/prepare-yuzhou-t5-nonfile-materialization-stage.mjs"),"utf8");
test("T5 nonfile stage is bound to the receipt, canonical baseline, two matching extractions, and excludes photo and docs",()=>{
  for(const value of ["person_core","input=argv[0]===\"--\"?argv.slice(1):argv","--source-restore-receipt","family","knowhow","ticket","source ${sourceField} mismatch","source domain mismatch","validateSourceRestoreReceipt","canonicalT5Baseline","sourceRestoreReceiptSha256","sourceSnapshotSha256","filesExcluded:[\"photo\",\"docs\"]","nonfileBusinessSha256","businessWriteTarget:\"nonfile_employee_profile_family_skill_credential_only\"","productionImport:\"HOLD\""])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(source,/photo\.jsonl|docs\.jsonl/);
});

const sha=value=>createHash("sha256").update(value).digest("hex");
const privateWrite=(path,value)=>{writeFileSync(path,value,{mode:0o600});chmodSync(path,0o600);};
const domains={person_core:2949,family:4560,knowhow:6,ticket:237};

test("T5 nonfile stage produces matching receipt-bound output and rejects mapping-contract drift",()=>{
  const root=mkdtempSync(join(tmpdir(),"jinhu-t5-nonfile-"));
  try{
    const snapshot="1".repeat(64),receiptPath=join(root,"source-receipt.json"),receipt=sealSourceRestoreReceipt({formatVersion:1,artifactKind:"yuzhou_hr_source_restore_receipt",sourceSnapshotSha256:snapshot,backup:{sha256:snapshot,bytes:1,containerCopySha256:snapshot,containerCopyBytes:1},identities:{containerSha256:"2".repeat(64),imageSha256:"3".repeat(64),databaseSha256:"4".repeat(64),restoreSha256:"5".repeat(64),catalogSha256:"6".repeat(64)},state:{online:true,readOnly:true},etlAuthority:{loginSucceeded:true,sysadmin:false,dbDatareader:true,viewDefinition:true,insert:false,update:false,delete:false,execute:false},productionImport:"HOLD"});
    privateWrite(receiptPath,`${JSON.stringify(receipt)}\n`);
    const baseline={sourceSnapshotSha256:snapshot,sourceRestoreReceiptSha256:sha(readFileSync(receiptPath)),businessSha256:"7".repeat(64),catalogSha256:"8".repeat(64),mappingContractSha256:"9".repeat(64),nonfileMaterializationRows:7752};
    const makeSource=name=>{const stage=join(root,name);mkdirSync(stage,{mode:0o700});chmodSync(stage,0o700);const manifestDomains={};for(const [domain,rows] of Object.entries(domains)){const file=`${domain}.jsonl`,payload=`fixture-${domain}\n`;privateWrite(join(stage,file),payload);manifestDomains[domain]={sourceObject:`dbo.${domain}`,objectStatus:"present",rows,file,fileSha256:sha(payload)};}privateWrite(join(stage,"manifest.json"),`${JSON.stringify({productionImport:"HOLD",sensitive:true,businessSha256:baseline.businessSha256,catalogSha256:baseline.catalogSha256,mappingContractSha256:baseline.mappingContractSha256,domains:manifestDomains})}\n`);return stage;};
    const sourceA=makeSource("a"),sourceB=makeSource("b"),outputRoot=join(root,"out"),first=prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId:"t5fixture-a",baseline}),second=prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId:"t5fixture-b",baseline});
    const firstManifest=JSON.parse(readFileSync(join(first.out,"manifest.json"))),secondManifest=JSON.parse(readFileSync(join(second.out,"manifest.json")));
    assert.equal(first.sourceRows,7752);assert.equal(firstManifest.nonfileBusinessSha256,secondManifest.nonfileBusinessSha256);assert.equal(firstManifest.sourceRestoreReceiptSha256,baseline.sourceRestoreReceiptSha256);assert.deepEqual(firstManifest.filesExcluded,["photo","docs"]);
    const drift=JSON.parse(readFileSync(join(sourceB,"manifest.json")));drift.mappingContractSha256="a".repeat(64);privateWrite(join(sourceB,"manifest.json"),`${JSON.stringify(drift)}\n`);
    assert.throws(()=>prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId:"t5fixture-c",baseline}),/source mappingContractSha256 mismatch/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
