import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyCoreMappingError,verifyLegacyCoreDomainMapping } from "../hr-cutover/legacy-core-domain-mapping-lib.mjs";

const root=resolve(import.meta.dirname,"../.."),mapping=JSON.parse(readFileSync(resolve(root,"scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json"),"utf8"));
const columns={
 person:["person","name","oldname","sex","birthday","age","idcard","edu","secedu","speciality","graduatescholl","graduatedate","getassignmentdate","edulevel","race","political","faculty","marital","blood","oldaddr","addr","tel","handtel","email","shack","shackticket","hourse","photo","photosize","photofile","phase","star","stature","weight","physical","military","jobstate","department","job","assignment","secassignment","employ","assessment","oldjobunit","specjob","jobdate","jobage","injobdate","injobage","formal","formaldate","formalmemo","formalorder","testpay","formalpay","payway","basepay","gradepay","jobpay","bank","account","computepay","coeffi","insuremod","memo","linkperson","linkpersonunit","linkpersonjob","linkpersontel","linkpersonaddr","linkpersonrela","linkpersondate1","linkpersondate2","bearticket","bearticketno","boys","girls","bearstep","bearmemo","bearinsure","grade","persontype","mydoc1","mydoc2","mydoc3","mydoc4","mydoc5","awaydate","awaycause","loginid","password","allowlogin","manageruser","def1","def2","def3","def4","def5","def6","def7","def8","def9","def11","def12","def13","def14","def15","def21","def22","def23","def24","def25","base_oldage","base_remedy","base_losework","base_fund","base_wound","base_bear","oldagedate","wounddate","remedydate","loseworkdate","inpatientdate","hurtdate","funddate","beardate","maccount","oaccount","fundmount","loseworkmount","woundmount","bearcount","fundflag","oldageflag","woundflag","remedyflag","loseworkflag","bearflag","inpatient","hurt","checkitem1","checkitem2","id","tablename","leaveclass","directatt","classname","roomid","pieceisaver","station"],
 family:["id","person","member","rela","birthday","jobunit","jobname","political","tel"],
 knowhow:["id","person","knowhow","grade","memo"],
 ticket:["id","person","ticket","ticketno","tickettype","getdate","validdate","ticketfilename","memo","org"],
 person_user:["person","A00007","A00008","A00014","A00015","A00016","A00017","A00018","A00019"],
 person_user_item:["id","itemname","description","type","width","declen","myorder"],
 readjust:["id","no","readjusttype","readjustdate","person","name","department","job","olddepartment","oldjob","oldpay","pay","oldgradepay","gradepay","oldbaseepay","baseepay","oldjobpay","jobpay","pausetodate","awaytype","readjustitem","cause","recdate","operator","jobstate","state","username","approve","departmentflag","jobflag","payflag","otherflag"],
 readjustitem:["readjustitem","id"],
 jobstatecode:["jobstate","jobstatename","myorder","isuse","defcount"],
 compact:["compact","compacttype","person","startdate","enddate","lastenddate","compacttime","totalcompacttime","testtime","testpay","basepay","state","memo","compactfile","compacttext","continuetimes","continueyears","zyfxj","jddate","testenddate","jyxzxy","bmxy","pxfwxy"],
 compact_c:["compact","person","compacttime","startdate","enddate","cjddate"],
 compacttypecode:["compacttype","myorder"]
};
const fixture={inventoryKind:"yuzhou_hr_legacy_structural_atomic_inventory",generatorVersion:"1.0.0",tables:Object.entries(columns).map(([name,names])=>({name,columns:names.map(column=>({name:column}))}))};
const fixtureHash=createHash("sha256").update(`${JSON.stringify(fixture)}\n`).digest("hex");
const fixtureMapping=structuredClone(mapping);fixtureMapping.inventoryContract.inventoryHash=fixtureHash;
const clone=value=>structuredClone(value);
const code=fn=>assert.throws(fn,error=>error instanceof LegacyCoreMappingError&&error.code===code.expected);

test("reviewed core mapping expands every selected field and keeps unsupported semantics as gaps",()=>{
 const report=verifyLegacyCoreDomainMapping(fixture,fixtureMapping,{root});
 assert.equal(report.selectedTables,12);assert.equal(report.fields,Object.values(columns).reduce((sum,value)=>sum+value.length,0));assert.equal(report.mappedFields,38);
 assert.equal(report.fields,260);assert.equal(report.gapFields,222);
 assert.deepEqual(report.ruleLedger.filter(rule=>rule.status==="gap").map(rule=>rule.id),["employee-code-non-reuse","employment-event-number-jz-dz-lz-fz"]);
 assert.equal(report.fieldLedger.find(row=>row.sourceTable==="person"&&row.sourceColumn==="jobstate")?.status,"mapped");
 assert.equal(report.fieldLedger.find(row=>row.sourceTable==="person_user"&&row.sourceColumn==="A00007")?.status,"gap");
});

test("missing source table or reviewed column fails closed",()=>{
 const missingTable=clone(fixture);missingTable.tables=missingTable.tables.filter(table=>table.name!=="compact_c");const missingTableMapping=clone(fixtureMapping);missingTableMapping.inventoryContract.inventoryHash=createHash("sha256").update(`${JSON.stringify(missingTable)}\n`).digest("hex");code.expected="SOURCE_TABLE_MISSING";code(()=>verifyLegacyCoreDomainMapping(missingTable,missingTableMapping,{root}));
 const missingColumn=clone(fixture);missingColumn.tables.find(table=>table.name==="readjust").columns=missingColumn.tables.find(table=>table.name==="readjust").columns.filter(column=>column.name!=="no");const missingColumnMapping=clone(fixtureMapping);missingColumnMapping.inventoryContract.inventoryHash=createHash("sha256").update(`${JSON.stringify(missingColumn)}\n`).digest("hex");code.expected="SOURCE_COLUMN_MISSING";code(()=>verifyLegacyCoreDomainMapping(missingColumn,missingColumnMapping,{root}));
});

test("mapped rules require real target symbols and real test evidence",()=>{
 const noTest=clone(fixtureMapping);noTest.businessRules.find(rule=>rule.id==="contract-three-agreements").targetEvidence=noTest.businessRules.find(rule=>rule.id==="contract-three-agreements").targetEvidence.filter(item=>item.kind!=="test");code.expected="TARGET_TEST_EVIDENCE_MISSING";code(()=>verifyLegacyCoreDomainMapping(fixture,noTest,{root}));
 const badSymbol=clone(fixtureMapping);badSymbol.domains[0].targetEvidence[0].symbol="symbol-that-does-not-exist";code.expected="TARGET_SYMBOL_MISSING";code(()=>verifyLegacyCoreDomainMapping(fixture,badSymbol,{root}));
 const falselyTested=clone(fixtureMapping);falselyTested.businessRules.find(rule=>rule.id==="contract-three-agreements").status="tested";code.expected="BUSINESS_RULE_TEST_ASSERTION_MISSING";code(()=>verifyLegacyCoreDomainMapping(fixture,falselyTested,{root}));
});

test("gaps require a stable reason and cannot carry target evidence",()=>{
 const invalid=clone(fixtureMapping),rule=invalid.businessRules.find(item=>item.id==="employee-code-non-reuse");rule.reasonCode="free text";code.expected="BUSINESS_RULE_GAP_INVALID";code(()=>verifyLegacyCoreDomainMapping(fixture,invalid,{root}));
 const invented=clone(fixtureMapping),gap=invented.businessRules.find(item=>item.id==="employee-code-non-reuse");gap.targetEvidence=[{kind:"test",file:"scripts/e2e/yuzhou-t2-contracts-contract.mjs",symbol:"hr_contract"}];code.expected="BUSINESS_RULE_GAP_INVALID";code(()=>verifyLegacyCoreDomainMapping(fixture,invented,{root}));
});

test("mapping is pinned to the reviewed inventory hash and exact 12-table/260-field scope",()=>{
 const wrongHash=clone(fixtureMapping);wrongHash.inventoryContract.inventoryHash="0".repeat(64);code.expected="INVENTORY_HASH_MISMATCH";code(()=>verifyLegacyCoreDomainMapping(fixture,wrongHash,{root}));
 const wrongCount=clone(fixtureMapping);wrongCount.inventoryContract.selectedFields=259;code.expected="INVENTORY_SELECTION_CONTRACT_INVALID";code(()=>verifyLegacyCoreDomainMapping(fixture,wrongCount,{root}));
 const duplicate=clone(fixture);duplicate.tables.find(table=>table.name==="compact").columns.push({name:"compact"});const duplicateMapping=clone(fixtureMapping);duplicateMapping.inventoryContract.inventoryHash=createHash("sha256").update(`${JSON.stringify(duplicate)}\n`).digest("hex");code.expected="INVENTORY_COLUMN_DUPLICATE";code(()=>verifyLegacyCoreDomainMapping(duplicate,duplicateMapping,{root}));
 assert.equal(mapping.inventoryContract.inventoryHash,"182e49369910e0b251459b91fe79c5f465f9f78c1f35ee46c388f45a947ca19c");
});

test("mapping rejects workstation paths and secret-like evidence",()=>{
 const absolutePath=clone(fixtureMapping);absolutePath.domains[0].route=["","Users","example","hr"].join("/");code.expected="MAPPING_SENSITIVE_CONTENT_FORBIDDEN";code(()=>verifyLegacyCoreDomainMapping(fixture,absolutePath,{root}));
 const secret=clone(fixtureMapping);secret.mappingVersion=["pass","word=example"].join("");code.expected="MAPPING_SENSITIVE_CONTENT_FORBIDDEN";code(()=>verifyLegacyCoreDomainMapping(fixture,secret,{root}));
});
