import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { parseT5NonfileStageArgs, prepareNonfileStage } from "../prepare-yuzhou-t5-nonfile-materialization-stage.mjs";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/prepare-yuzhou-t5-nonfile-materialization-stage.mjs"),"utf8");
test("T5 nonfile stage is bound to the receipt, canonical baseline, two matching extractions, and excludes photo and docs",()=>{
  for(const value of ["person_core","--baseline","readBaseline","--source-restore-receipt","family","knowhow","ticket","source ${sourceField} mismatch","source domain mismatch","source definition evidence mismatch","validateSourceRestoreReceipt","canonicalT5Baseline","sourceRestoreReceiptSha256","sourceSnapshotSha256","filesExcluded:[\"photo\",\"docs\"]","nonfileBusinessSha256","businessWriteTarget:\"nonfile_employee_profile_family_skill_credential_custom_definition_logic\"","productionImport:\"HOLD\""])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(source,/photo\.jsonl|docs\.jsonl/);
});

test("T5 nonfile stage CLI accepts only one optional sealed baseline argument",()=>{
  const required=["--source-a","/private/a","--source-b","/private/b","--source-restore-receipt","/private/receipt.json","--output-root","/private/out","--run-id","t5fixture-a"];
  assert.deepEqual(parseT5NonfileStageArgs(required),Object.fromEntries(Array.from({length:required.length/2},(_,index)=>[required[index*2],required[index*2+1]])));
  assert.equal(parseT5NonfileStageArgs([...required,"--baseline","/private/candidate.json"])["--baseline"],"/private/candidate.json");
  assert.throws(()=>parseT5NonfileStageArgs([...required,"--baseline","/private/candidate.json","--baseline","/private/other.json"]),/arguments/);
  assert.throws(()=>parseT5NonfileStageArgs([...required,"--unexpected","x"]),/arguments/);
});

const sha=value=>createHash("sha256").update(value).digest("hex");
const privateWrite=(path,value)=>{writeFileSync(path,value,{mode:0o600});chmodSync(path,0o600);};
const domains={person_core:2949,family:4560,knowhow:6,ticket:237};
const definitionFields=[
  ...Array.from({length:9},(_,index)=>[`def${index+1}`,"text"]),
  ...Array.from({length:5},(_,index)=>[`def${index+11}`,"numeric"]),
  ...Array.from({length:5},(_,index)=>[`def${index+21}`,"date"])
];
const logicColumns=[
  ["description_d","presentation_expression"],["sqltext","legacy_sql_expression"],["flag","legacy_behavior_flag"],
  ["crosssql","legacy_cross_lookup_sql"],["crosscolselectsql","legacy_cross_column_sql"],["crossrowselectsql","legacy_cross_row_sql"],
  ["crosswhere","legacy_cross_filter"],["querywhere","legacy_query_filter"],["ascount","legacy_aggregate_flag"],["ascount2","legacy_secondary_aggregate_flag"]
];
const makeDefinitionEvidence=(present=false)=>definitionFields.map(([code,valueType],definitionIndex)=>{
  const columns=logicColumns.map(([column,classification],columnIndex)=>{
    const isSourceNull=!(present&&definitionIndex===0&&columnIndex===0);
    return {column,classification,execution:"forbidden",isSourceNull,sourceValueSha256:isSourceNull?null:sha("safe-fingerprint-only")};
  });
  const presentCount=columns.filter(column=>!column.isSourceNull).length;
  return {code,valueType,baseClassification:valueType,legacyDefinitionId:String(definitionIndex+1),legacyDatatype:valueType,legacyGroupId:null,legacySortOrder:definitionIndex,legacyNullable:null,legacyRuleClassification:presentCount?"review_required":"inert",sourceIdentitySha256:sha(`definition:${definitionIndex}`),sourceRowSha256:sha(`definition-row:${definitionIndex}`),legacyLogicCoverage:{denominator:10,presentCount,nullCount:10-presentCount,reviewStatus:presentCount?"requires_capability_review":"no_legacy_logic_value",columns}};
});

test("T5 nonfile stage produces matching receipt-bound output and rejects mapping-contract drift",()=>{
  const root=mkdtempSync(join(tmpdir(),"jinhu-t5-nonfile-"));
  try{
    const snapshot="1".repeat(64),receiptPath=join(root,"source-receipt.json"),receipt=sealSourceRestoreReceipt({formatVersion:1,artifactKind:"yuzhou_hr_source_restore_receipt",sourceSnapshotSha256:snapshot,backup:{sha256:snapshot,bytes:1,containerCopySha256:snapshot,containerCopyBytes:1},identities:{containerSha256:"2".repeat(64),imageSha256:"3".repeat(64),databaseSha256:"4".repeat(64),restoreSha256:"5".repeat(64),catalogSha256:"6".repeat(64)},state:{online:true,readOnly:true},etlAuthority:{loginSucceeded:true,sysadmin:false,dbDatareader:true,viewDefinition:true,insert:false,update:false,delete:false,execute:false},productionImport:"HOLD"});
    privateWrite(receiptPath,`${JSON.stringify(receipt)}\n`);
    const baseline={sourceSnapshotSha256:snapshot,sourceRestoreReceiptSha256:sha(readFileSync(receiptPath)),businessSha256:"7".repeat(64),catalogSha256:"8".repeat(64),mappingContractSha256:"9".repeat(64),nonfileMaterializationRows:7752};
    const makeSource=(name,evidence=makeDefinitionEvidence(true))=>{const stage=join(root,name);mkdirSync(stage,{mode:0o700});chmodSync(stage,0o700);const manifestDomains={};for(const [domain,rows] of Object.entries(domains)){const file=`${domain}.jsonl`,payload=`fixture-${domain}\n`;privateWrite(join(stage,file),payload);manifestDomains[domain]={sourceObject:`dbo.${domain}`,objectStatus:"present",rows,file,fileSha256:sha(payload)};}const definitionPayload=`${evidence.map(row=>JSON.stringify(row)).join("\n")}\n`,definitionFile="defs.safe-evidence.jsonl";privateWrite(join(stage,definitionFile),definitionPayload);privateWrite(join(stage,"manifest.json"),`${JSON.stringify({productionImport:"HOLD",sensitive:true,businessSha256:baseline.businessSha256,catalogSha256:baseline.catalogSha256,mappingContractSha256:baseline.mappingContractSha256,domains:manifestDomains,privateDefinitionSource:{sourceObject:"dbo.defs",rows:19,safeEvidenceFile:definitionFile,safeEvidenceFileSha256:sha(definitionPayload),logicColumnDenominator:190,logicColumnPresentCount:evidence.reduce((sum,row)=>sum+row.legacyLogicCoverage.presentCount,0)}})}\n`);return stage;};
    const sourceA=makeSource("a"),sourceB=makeSource("b"),outputRoot=join(root,"out"),first=prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId:"t5fixture-a",baseline}),second=prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId:"t5fixture-b",baseline});
    const firstManifest=JSON.parse(readFileSync(join(first.out,"manifest.json"))),secondManifest=JSON.parse(readFileSync(join(second.out,"manifest.json")));
    assert.equal(first.sourceRows,7752);assert.equal(firstManifest.nonfileBusinessSha256,secondManifest.nonfileBusinessSha256);assert.equal(firstManifest.sourceRestoreReceiptSha256,baseline.sourceRestoreReceiptSha256);assert.equal(firstManifest.mappingContractSha256,baseline.mappingContractSha256);assert.deepEqual(firstManifest.definitionEvidence,{rows:19,file:"defs.safe-evidence.jsonl",fileSha256:sha(readFileSync(join(sourceA,"defs.safe-evidence.jsonl"))),logicColumnDenominator:190,logicColumnPresentCount:1});assert.deepEqual(firstManifest.filesExcluded,["photo","docs"]);
    const drift=JSON.parse(readFileSync(join(sourceB,"manifest.json")));drift.mappingContractSha256="a".repeat(64);privateWrite(join(sourceB,"manifest.json"),`${JSON.stringify(drift)}\n`);
    assert.throws(()=>prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId:"t5fixture-c",baseline}),/source mappingContractSha256 mismatch/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("T5 nonfile stage rejects unsafe, drifting, or structurally incomplete definition evidence before creating output",()=>{
  const root=mkdtempSync(join(tmpdir(),"jinhu-t5-defs-gate-"));
  try{
    const snapshot="1".repeat(64),receiptPath=join(root,"source-receipt.json"),receipt=sealSourceRestoreReceipt({formatVersion:1,artifactKind:"yuzhou_hr_source_restore_receipt",sourceSnapshotSha256:snapshot,backup:{sha256:snapshot,bytes:1,containerCopySha256:snapshot,containerCopyBytes:1},identities:{containerSha256:"2".repeat(64),imageSha256:"3".repeat(64),databaseSha256:"4".repeat(64),restoreSha256:"5".repeat(64),catalogSha256:"6".repeat(64)},state:{online:true,readOnly:true},etlAuthority:{loginSucceeded:true,sysadmin:false,dbDatareader:true,viewDefinition:true,insert:false,update:false,delete:false,execute:false},productionImport:"HOLD"});
    privateWrite(receiptPath,`${JSON.stringify(receipt)}\n`);
    const baseline={sourceSnapshotSha256:snapshot,sourceRestoreReceiptSha256:sha(readFileSync(receiptPath)),businessSha256:"7".repeat(64),catalogSha256:"8".repeat(64),mappingContractSha256:"9".repeat(64),nonfileMaterializationRows:7752};
    const makeSource=(name,evidence=makeDefinitionEvidence())=>{const stage=join(root,name);mkdirSync(stage,{mode:0o700});chmodSync(stage,0o700);const manifestDomains={};for(const [domain,rows] of Object.entries(domains)){const file=`${domain}.jsonl`,payload=`fixture-${domain}\n`;privateWrite(join(stage,file),payload);manifestDomains[domain]={sourceObject:`dbo.${domain}`,objectStatus:"present",rows,file,fileSha256:sha(payload)};}const payload=`${evidence.map(row=>JSON.stringify(row)).join("\n")}\n`;privateWrite(join(stage,"defs.safe-evidence.jsonl"),payload);privateWrite(join(stage,"manifest.json"),`${JSON.stringify({productionImport:"HOLD",sensitive:true,businessSha256:baseline.businessSha256,catalogSha256:baseline.catalogSha256,mappingContractSha256:baseline.mappingContractSha256,domains:manifestDomains,privateDefinitionSource:{sourceObject:"dbo.defs",rows:19,safeEvidenceFile:"defs.safe-evidence.jsonl",safeEvidenceFileSha256:sha(payload),logicColumnDenominator:190,logicColumnPresentCount:evidence.reduce((sum,row)=>sum+(row.legacyLogicCoverage?.presentCount??0),0)}})}\n`);return stage;};
    const assertRejectedBeforeOutput=(sourceA,sourceB,runId,pattern)=>{const outputRoot=join(root,`out-${runId}`);assert.throws(()=>prepareNonfileStage({sourceA,sourceB,sourceRestoreReceipt:receiptPath,outputRoot,runId,baseline}),pattern);assert.equal(existsSync(outputRoot),false);};

    const valid=makeSource("valid");
    const missing=makeSource("missing");unlinkSync(join(missing,"defs.safe-evidence.jsonl"));
    assertRejectedBeforeOutput(valid,missing,"missing-file",/source definition evidence/);

    const unsafe=makeSource("unsafe");chmodSync(join(unsafe,"defs.safe-evidence.jsonl"),0o644);
    assertRejectedBeforeOutput(valid,unsafe,"unsafe-mode",/source definition evidence/);

    const driftRows=makeDefinitionEvidence();driftRows[0].sourceRowSha256=sha("different-safe-fingerprint");
    assertRejectedBeforeOutput(valid,makeSource("drift",driftRows),"byte-drift",/source definition evidence mismatch/);

    assertRejectedBeforeOutput(valid,makeSource("row-count",makeDefinitionEvidence().slice(0,18)),"row-count",/source definition evidence count/);

    const logicCountRows=makeDefinitionEvidence();logicCountRows[0].legacyLogicCoverage.columns.pop();logicCountRows[0].legacyLogicCoverage.denominator=9;logicCountRows[0].legacyLogicCoverage.nullCount=9;
    assertRejectedBeforeOutput(valid,makeSource("logic-count",logicCountRows),"logic-count",/source definition logic count/);

    const oldNameRows=makeDefinitionEvidence();oldNameRows[0].logicCoverage=oldNameRows[0].legacyLogicCoverage;delete oldNameRows[0].legacyLogicCoverage;
    assertRejectedBeforeOutput(valid,makeSource("old-name",oldNameRows),"old-name",/source definition evidence schema/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
