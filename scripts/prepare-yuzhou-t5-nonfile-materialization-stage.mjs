#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { validateSourceRestoreReceipt } from "./hr-cutover/source-restore-receipt.mjs";
import { canonicalT5Baseline } from "./hr-cutover/t5-canonical-baseline.mjs";

const SHA256=/^[0-9a-f]{64}$/u;
const DOMAINS=Object.freeze(["person_core","family","knowhow","ticket"]);
const EXPECTED_ROWS=Object.freeze({person_core:2949,family:4560,knowhow:6,ticket:237});
const DEFINITION_FIELDS=Object.freeze([
  ["def1","text"],["def2","text"],["def3","text"],["def4","text"],["def5","text"],
  ["def6","text"],["def7","text"],["def8","text"],["def9","text"],
  ["def11","numeric"],["def12","numeric"],["def13","numeric"],["def14","numeric"],["def15","numeric"],
  ["def21","date"],["def22","date"],["def23","date"],["def24","date"],["def25","date"]
]);
const LOGIC_COLUMNS=Object.freeze([
  ["description_d","presentation_expression"],
  ["sqltext","legacy_sql_expression"],
  ["flag","legacy_behavior_flag"],
  ["crosssql","legacy_cross_lookup_sql"],
  ["crosscolselectsql","legacy_cross_column_sql"],
  ["crossrowselectsql","legacy_cross_row_sql"],
  ["crosswhere","legacy_cross_filter"],
  ["querywhere","legacy_query_filter"],
  ["ascount","legacy_aggregate_flag"],
  ["ascount2","legacy_secondary_aggregate_flag"]
]);
const DEFINITION_KEYS=Object.freeze(["baseClassification","code","legacyDatatype","legacyDefinitionId","legacyGroupId","legacyLogicCoverage","legacyNullable","legacyRuleClassification","legacySortOrder","sourceIdentitySha256","sourceRowSha256","valueType"]);
const fail=message=>{throw new Error(`T5_NONFILE_STAGE_INVALID: ${message}`);};
const mode=path=>(statSync(path).mode&0o777).toString(8);
const sha=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
const exactKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
function readDefinitionEvidence(path){
  let link,info,raw;
  try{link=lstatSync(path);info=statSync(path);raw=readFileSync(path);}catch{fail("source definition evidence");}
  if(link.isSymbolicLink()||!info.isFile()||info.nlink!==1||mode(path)!=="600")fail("source definition evidence");
  const text=raw.toString("utf8");
  if(!text.endsWith("\n"))fail("source definition evidence");
  let rows;
  try{rows=text.slice(0,-1).split("\n").map(line=>JSON.parse(line));}catch{fail("source definition evidence");}
  if(rows.length!==DEFINITION_FIELDS.length)fail("source definition evidence count");
  let presentTotal=0;
  rows.forEach((row,index)=>{
    const [expectedCode,expectedType]=DEFINITION_FIELDS[index];
    if(!exactKeys(row,DEFINITION_KEYS)||row.code!==expectedCode||row.valueType!==expectedType||row.baseClassification!==expectedType||typeof row.legacyDefinitionId!=="string"||!row.legacyDefinitionId||typeof row.legacyDatatype!=="string"||!row.legacyDatatype||!(row.legacyGroupId===null||typeof row.legacyGroupId==="string")||!(row.legacySortOrder===null||Number.isSafeInteger(row.legacySortOrder))||row.legacyNullable!==null||!SHA256.test(row.sourceIdentitySha256??"")||!SHA256.test(row.sourceRowSha256??""))fail("source definition evidence schema");
    const coverage=row.legacyLogicCoverage;
    if(!exactKeys(coverage,["columns","denominator","nullCount","presentCount","reviewStatus"])||coverage.denominator!==LOGIC_COLUMNS.length||!Number.isSafeInteger(coverage.presentCount)||coverage.presentCount<0||coverage.presentCount>LOGIC_COLUMNS.length||coverage.nullCount!==LOGIC_COLUMNS.length-coverage.presentCount||!Array.isArray(coverage.columns)||coverage.columns.length!==LOGIC_COLUMNS.length)fail("source definition logic count");
    let rowPresent=0;
    coverage.columns.forEach((column,columnIndex)=>{
      const [expectedColumn,expectedClassification]=LOGIC_COLUMNS[columnIndex];
      if(!exactKeys(column,["classification","column","execution","isSourceNull","sourceValueSha256"])||column.column!==expectedColumn||column.classification!==expectedClassification||column.execution!=="forbidden"||typeof column.isSourceNull!=="boolean"||(column.isSourceNull?column.sourceValueSha256!==null:!SHA256.test(column.sourceValueSha256??"")))fail("source definition logic schema");
      if(!column.isSourceNull)rowPresent+=1;
    });
    const requiresReview=rowPresent>0;
    if(rowPresent!==coverage.presentCount||coverage.reviewStatus!==(requiresReview?"requires_capability_review":"no_legacy_logic_value")||row.legacyRuleClassification!==(requiresReview?"review_required":"inert"))fail("source definition logic count");
    presentTotal+=rowPresent;
  });
  return {raw,rows:rows.length,logicColumnDenominator:rows.length*LOGIC_COLUMNS.length,logicColumnPresentCount:presentTotal};
}
export function parseT5NonfileStageArgs(argv){const input=argv[0]==="--"?argv.slice(1):argv,value={};for(let index=0;index<input.length;index+=2){const key=input[index],item=input[index+1];if(!["--source-a","--source-b","--source-restore-receipt","--output-root","--run-id","--baseline"].includes(key)||!item||value[key])fail("arguments");value[key]=item;}if(![5,6].includes(Object.keys(value).length)||!["--source-a","--source-b","--source-restore-receipt","--output-root","--run-id"].every(key=>value[key]))fail("arguments");if(!/^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u.test(value["--run-id"]))fail("run id");return value;}
function readBaseline(path){if(!isAbsolute(path))fail("baseline path");const baselinePath=resolve(path),link=lstatSync(baselinePath),info=statSync(baselinePath);if(link.isSymbolicLink()||!info.isFile()||info.nlink!==1||mode(baselinePath)!=="600")fail("baseline authority");try{return canonicalT5Baseline(baselinePath);}catch{fail("baseline authority");}}
function readStage(dir){const root=resolve(dir),manifestPath=join(root,"manifest.json");if(mode(root)!=="700"||mode(manifestPath)!=="600")fail(`unsafe source stage ${basename(root)}`);const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));if(manifest.productionImport!=="HOLD"||manifest.sensitive!==true||!["businessSha256","catalogSha256","mappingContractSha256"].every(key=>SHA256.test(manifest[key]??"")))fail("source manifest authority");const domains={};for(const name of DOMAINS){const item=manifest.domains?.[name],file=join(root,item?.file??"");if(!item||!Number.isInteger(item.rows)||item.rows<0||!SHA256.test(item.fileSha256??"")||mode(file)!=="600"||sha(file)!==item.fileSha256)fail(`source domain ${name}`);domains[name]={...item,path:file};}const definition=manifest.privateDefinitionSource,safeFile=join(root,definition?.safeEvidenceFile??"");if(!definition||definition.sourceObject!=="dbo.defs"||definition.rows!==DEFINITION_FIELDS.length||definition.safeEvidenceFile!=="defs.safe-evidence.jsonl"||basename(safeFile)!==definition.safeEvidenceFile||!SHA256.test(definition.safeEvidenceFileSha256??"")||definition.logicColumnDenominator!==DEFINITION_FIELDS.length*LOGIC_COLUMNS.length||!Number.isSafeInteger(definition.logicColumnPresentCount)||definition.logicColumnPresentCount<0||definition.logicColumnPresentCount>definition.logicColumnDenominator)fail("source definition evidence");const evidence=readDefinitionEvidence(safeFile);if(createHash("sha256").update(evidence.raw).digest("hex")!==definition.safeEvidenceFileSha256||evidence.rows!==definition.rows||evidence.logicColumnDenominator!==definition.logicColumnDenominator||evidence.logicColumnPresentCount!==definition.logicColumnPresentCount)fail("source definition evidence count");return {root,manifest,domains,definition:{rows:evidence.rows,path:safeFile,fileSha256:definition.safeEvidenceFileSha256,bytes:evidence.raw,logicColumnDenominator:evidence.logicColumnDenominator,logicColumnPresentCount:evidence.logicColumnPresentCount}};}
function readReceipt(path,baseline){if(!isAbsolute(path))fail("source restore receipt path");const receiptPath=resolve(path),link=lstatSync(receiptPath),info=statSync(receiptPath);if(link.isSymbolicLink()||!info.isFile()||info.nlink!==1||mode(receiptPath)!=="600")fail("source restore receipt authority");const raw=readFileSync(receiptPath);let receipt;try{receipt=validateSourceRestoreReceipt(JSON.parse(raw));}catch{fail("source restore receipt authority");}const receiptSha256=createHash("sha256").update(raw).digest("hex");if(receiptSha256!==baseline.sourceRestoreReceiptSha256||receipt.sourceSnapshotSha256!==baseline.sourceSnapshotSha256||receipt.productionImport!=="HOLD")fail("source restore receipt baseline mismatch");return {sourceSnapshotSha256:receipt.sourceSnapshotSha256,sourceRestoreReceiptSha256:receiptSha256};}
export function prepareNonfileStage(input){const baseline=input.baseline??canonicalT5Baseline(),receipt=readReceipt(input.sourceRestoreReceipt,baseline),a=readStage(input.sourceA),b=readStage(input.sourceB),baselineFields={businessSha256:"businessSha256",catalogSha256:"catalogSha256",mappingContractSha256:"mappingContractSha256"};for(const [sourceField,baselineField] of Object.entries(baselineFields))if(a.manifest[sourceField]!==b.manifest[sourceField]||a.manifest[sourceField]!==baseline[baselineField])fail(`source ${sourceField} mismatch`);for(const name of DOMAINS)if(a.domains[name].fileSha256!==b.domains[name].fileSha256||a.domains[name].rows!==b.domains[name].rows||a.domains[name].rows!==EXPECTED_ROWS[name])fail(`source domain mismatch ${name}`);if(a.definition.fileSha256!==b.definition.fileSha256||!a.definition.bytes.equals(b.definition.bytes)||a.definition.rows!==b.definition.rows||a.definition.logicColumnDenominator!==b.definition.logicColumnDenominator||a.definition.logicColumnPresentCount!==b.definition.logicColumnPresentCount)fail("source definition evidence mismatch");const root=resolve(input.outputRoot),out=join(root,`staging-${input.runId}`);if(existsSync(out))fail("output exists");mkdirSync(root,{recursive:true,mode:0o700});chmodSync(root,0o700);mkdirSync(out,{mode:0o700});chmodSync(out,0o700);const domains={};for(const name of DOMAINS){const source=a.domains[name],file=basename(source.path);copyFileSync(source.path,join(out,file));chmodSync(join(out,file),0o600);domains[name]={sourceObject:source.sourceObject,objectStatus:source.objectStatus,rows:source.rows,file,fileSha256:sha(join(out,file))};if(domains[name].fileSha256!==source.fileSha256)fail(`copy hash mismatch ${name}`);}const definitionFile=basename(a.definition.path);copyFileSync(a.definition.path,join(out,definitionFile));chmodSync(join(out,definitionFile),0o600);const definitionEvidence={rows:a.definition.rows,file:definitionFile,fileSha256:sha(join(out,definitionFile)),logicColumnDenominator:a.definition.logicColumnDenominator,logicColumnPresentCount:a.definition.logicColumnPresentCount};if(definitionEvidence.fileSha256!==a.definition.fileSha256)fail("copy hash mismatch definition evidence");const sourceRows=Object.values(domains).reduce((sum,item)=>sum+item.rows,0);if(sourceRows!==baseline.nonfileMaterializationRows)fail("nonfile source count drift");const business={formatVersion:1,artifactKind:"yuzhou_t5_nonfile_materialization_stage",sourceSnapshotSha256:receipt.sourceSnapshotSha256,sourceRestoreReceiptSha256:receipt.sourceRestoreReceiptSha256,sourceBusinessSha256:a.manifest.businessSha256,sourceCatalogSha256:a.manifest.catalogSha256,mappingContractSha256:a.manifest.mappingContractSha256,domains,definitionEvidence};const manifest={...business,runId:input.runId,sourceRows,nonfileBusinessSha256:createHash("sha256").update(canonical(business)).digest("hex"),filesExcluded:["photo","docs"],businessWriteTarget:"nonfile_employee_profile_family_skill_credential_custom_definition_logic",productionImport:"HOLD"};writeFileSync(join(out,"manifest.json"),`${JSON.stringify(manifest,null,2)}\n`,{mode:0o600,flag:"wx"});chmodSync(join(out,"manifest.json"),0o600);return {out,sourceRows,productionImport:"HOLD"};}
if(process.argv[1]===new URL(import.meta.url).pathname){const value=parseT5NonfileStageArgs(process.argv.slice(2)),baseline=value["--baseline"]?readBaseline(value["--baseline"]):undefined;const result=prepareNonfileStage({sourceA:value["--source-a"],sourceB:value["--source-b"],sourceRestoreReceipt:value["--source-restore-receipt"],outputRoot:value["--output-root"],runId:value["--run-id"],baseline});process.stdout.write(`${JSON.stringify({status:"PASS",sourceRows:result.sourceRows,filesExcluded:true,productionImport:result.productionImport})}\n`);}
