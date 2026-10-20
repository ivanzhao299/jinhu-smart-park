/* global console, structuredClone */
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildYuzhouPayrollSourcePackage, buildYuzhouPayrollSourcePackageFromPrepared, buildYuzhouPayrollSourcePackageFromPreparedStreaming, materializeYuzhouPayrollSourcePackage } from "../hr-cutover/build-yuzhou-payroll-source-package.mjs";
import { canonicalT4 } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { fixtureBinding, fixtureStage } from "./yuzhou-t4-followon-fixture.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
const source = () => ({version:1,sourceSystem:"yuzhou-v10",targetScope:{tenantId:"fixture-tenant",parkId:"fixture-park"},manifestId:"synthetic-manifest",sourceInstance:"fixture",month:"2026-07",extractedAt:"2026-10-20T00:00:00Z",evidenceSha256:sha("evidence"),expectedHeadVersion:0,expectedHeadHash:null,books:[34,35].map(scheme=>({scheme,bookName:`book ${scheme}`,closeState:1,closeSourceHash:sha(`close ${scheme}`),items:[{legacyItemName:"salary",itemCode:"salary",displayName:"salary",valueType:"decimal",legacyItemType:"amount",legacyAddOrSub:"+",itemCategory:"earning",decimalScale:4,sortNo:1,sourceHash:sha(`item ${scheme}`)}],formulas:[],records:[{sourcePersonIdentity:`person-${scheme}`,sourceRowSha256:sha(`row ${scheme}`),employeeMappingId:`00000000-0000-4000-8000-${String(scheme).padStart(12,"0")}`,sourceTable:`salary${scheme}`,summary:{netAmount:"1.0000"},values:[{column:"salary",valueType:"decimal",isSourceNull:false,decimalValue:"1.0000",sourceHash:sha(`value ${scheme}`)}]}]}))});
const first = buildYuzhouPayrollSourcePackage(source());
assert.equal(first.receipt.recordCount,2); assert.equal(first.receipt.valueCount,2); assert.deepEqual(first.receipt.bookCounts,[{scheme:34,recordCount:1},{scheme:35,recordCount:1}]);
assert.deepEqual(first.packageDto.targetScope, source().targetScope);
const metadata={taxable:null,printEnabled:false,enabled:false,printWidth:12,printWidthSourceHash:sha("width"),taxFlag:"?",noDecimalFlag:"0",useFlag:"0",legacyDecimalLength:4,decimalLengthSourceHash:sha("scale"),legacyPrintReport:1,printReportSourceHash:sha("report"),itemTitle:null,longDescription:"source metadata",suppressDecimals:false,legacyMetadataReviewRequired:true};
const rich=source();rich.books[0].items[0].declarativeMetadata=metadata;
assert.deepEqual(buildYuzhouPayrollSourcePackage(rich).packageDto.books[0].items[0].declarativeMetadata,metadata);
for(const mutate of [m=>{m.enabled="false";},m=>{m.printWidth=2147483648;},m=>{m.taxFlag="toolong";},m=>{m.legacyMetadataReviewRequired=false;},m=>{delete m.itemTitle;}]){
 const invalid=structuredClone(rich);mutate(invalid.books[0].items[0].declarativeMetadata);assert.throws(()=>buildYuzhouPayrollSourcePackage(invalid),/METADATA_INVALID/);
}
const missingScope = source(); delete missingScope.targetScope; assert.throws(()=>buildYuzhouPayrollSourcePackage(missingScope),/TARGET_SCOPE|SCHEMA_INVALID/);
const duplicate = source(); duplicate.books[0].records.push(structuredClone(duplicate.books[0].records[0])); assert.throws(()=>buildYuzhouPayrollSourcePackage(duplicate),/NATURAL_KEY/);
const numberMoney = source(); numberMoney.books[0].records[0].values[0].decimalValue = 1; assert.throws(()=>buildYuzhouPayrollSourcePackage(numberMoney),/VALUE_TYPE/);
const root=mkdtempSync(join(tmpdir(),"yuzhou-payroll-source-")); try { const input=join(root,"input.json"); writeFileSync(input,JSON.stringify(source()),{mode:0o600});chmodSync(input,0o600);const written=materializeYuzhouPayrollSourcePackage({inputPath:input,outputDir:join(root,"out")});assert.equal(written.productionImport,"HOLD"); } finally { rmSync(root,{recursive:true,force:true}); }
const preparedRoot=mkdtempSync(join(tmpdir(),"yuzhou-payroll-prepared-")); try {
  const binding=fixtureBinding(),stage=fixtureStage(binding);
  const formulaRows=stage.buffers["formulas.jsonl"].toString("utf8").trim().split("\n").map(line=>JSON.parse(line));
  formulaRows[0].source.cit="[U0]>0";formulaRows[0].sourceRowSha256=sha(canonicalT4(formulaRows[0].source));
  stage.buffers["formulas.jsonl"]=Buffer.from(formulaRows.map(row=>JSON.stringify(row)+"\n").join(""));
  stage.manifest.outputFiles["formulas.jsonl"].fileSha256=sha(stage.buffers["formulas.jsonl"]);
  for(const [name,bytes] of Object.entries(stage.buffers))writeFileSync(join(preparedRoot,name),bytes,{mode:0o600});const manifestPath=join(preparedRoot,"manifest.json");writeFileSync(manifestPath,JSON.stringify(stage.manifest),{mode:0o600});
  const mapPath=join(preparedRoot,"employee-map.json"),entries=[{sourcePerson:"fixture-employee",employeeMappingId:"00000000-0000-4000-8000-000000000001"}];const mapping={formatVersion:1,scope:{tenantId:"fixture-t4-tenant",parkId:"fixture-t4-park"},entries};mapping.artifactSha256=sha(JSON.stringify({entries,mapping:undefined,formatVersion:1,scope:mapping.scope},["formatVersion","scope","entries"]));mapping.artifactSha256=sha(`{"entries":[{"employeeMappingId":"00000000-0000-4000-8000-000000000001","sourcePerson":"fixture-employee"}],"formatVersion":1,"scope":{"parkId":"fixture-t4-park","tenantId":"fixture-t4-tenant"}}`);writeFileSync(mapPath,JSON.stringify(mapping),{mode:0o600});
  const adapted=buildYuzhouPayrollSourcePackageFromPrepared({preparedRoot,manifestPath,mappingPath:mapPath,month:"2026-12",sourceInstance:"fixture"});const streamed=await buildYuzhouPayrollSourcePackageFromPreparedStreaming({preparedRoot,manifestPath,mappingPath:mapPath,month:"2026-12",sourceInstance:"fixture"});assert.deepEqual(streamed.packageDto,adapted.packageDto);assert.deepEqual(adapted.packageDto.targetScope,mapping.scope);assert.equal(adapted.receipt.bookCounts.length,1);assert.equal(adapted.packageDto.books[0].scheme,1);assert.equal(adapted.packageDto.books[0].records.length,1);assert.equal(adapted.packageDto.books[0].records[0].sourcePersonIdentity,"fixture-employee");
  assert.equal(adapted.packageDto.books[0].formulas[0].rawCondition,"[U0]>0");
  assert.equal(adapted.packageDto.books[0].items[0].declarativeMetadata.enabled,false);
  assert.equal(adapted.packageDto.books[0].items[0].declarativeMetadata.legacyMetadataReviewRequired,true);
  assert.equal(Object.keys(adapted.packageDto.books[0].items[0].declarativeMetadata).length,16);
  for(const record of adapted.packageDto.books[0].records)for(const value of record.values)assert.equal(value.sourceHash,sha(`${record.sourceRowSha256}${value.column}`));
  const missing=JSON.parse(JSON.stringify(mapping));missing.entries=[];missing.artifactSha256=sha(`{"entries":[],"formatVersion":1,"scope":{"parkId":"fixture-t4-park","tenantId":"fixture-t4-tenant"}}`);writeFileSync(mapPath,JSON.stringify(missing),{mode:0o600});assert.throws(()=>buildYuzhouPayrollSourcePackageFromPrepared({preparedRoot,manifestPath,mappingPath:mapPath,month:"2026-12",sourceInstance:"fixture"}),/MAPPING_MISSING/);
  writeFileSync(mapPath,JSON.stringify(mapping),{mode:0o600});writeFileSync(join(preparedRoot,"payslips.jsonl"),Buffer.concat([stage.buffers["payslips.jsonl"],stage.buffers["payslips.jsonl"].subarray(0,stage.buffers["payslips.jsonl"].indexOf(10)+1)]),{mode:0o600});await assert.rejects(()=>buildYuzhouPayrollSourcePackageFromPreparedStreaming({preparedRoot,manifestPath,mappingPath:mapPath,month:"2026-12",sourceInstance:"fixture"}),/MANIFEST_HASH_MISMATCH/);
} finally { rmSync(preparedRoot,{recursive:true,force:true}); }
console.log("Yuzhou typed monthly payroll source package contract passed");
