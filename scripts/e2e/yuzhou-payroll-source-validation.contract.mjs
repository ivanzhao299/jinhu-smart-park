/* global structuredClone */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import shared from "../../packages/shared/dist/hr-yuzhou-payroll-source.js";
import { buildYuzhouPayrollSourcePackage } from "../hr-cutover/build-yuzhou-payroll-source-package.mjs";
const { canonicalJson, validateYuzhouPayrollSourcePackage, validateYuzhouPayrollSourceHashes } = shared;
const sha = value => createHash("sha256").update(value).digest("hex");
const fixture = () => ({ version: 1, sourceSystem: "yuzhou-v10", targetScope: { tenantId: "fixture", parkId: "fixture" },
  manifestId: "fixture", sourceInstance: "fixture", month: "2026-07", extractedAt: "2026-10-20T00:00:00Z",
  expectedHeadVersion: 0, expectedHeadHash: null, evidenceSha256: sha("evidence"), books: [{ scheme: 1, bookName: null,
    closeState: 1, closeSourceHash: sha("close"), items: [{ legacyItemName: "u1", itemCode: "U1", displayName: "合成项目",
      valueType: "decimal", legacyItemType: "数值", legacyAddOrSub: "增加项", itemCategory: "earning", decimalScale: 4,
      sortNo: 1, sourceHash: sha("item") }], formulas: [{ legacyFormulaId: 1, itemCode: "U1", rawExpression: "1", rawCondition: null,
      calculationOrder: 1, sourceHash: sha("formula") }], records: [{ sourcePersonIdentity: "SYNTHETIC", employeeMappingId: "00000000-0000-4000-8000-000000000001",
      sourceTable: "dbo.salary01", sourceRowSha256: sha("row"), summary: { netAmount: "1.0000" },
      values: [{ column: "u1", valueType: "decimal", isSourceNull: false, decimalValue: "1.0000", sourceHash: sha("value") }] }] }] });
const book = p => p.books[0], item = p => book(p).items[0], record = p => book(p).records[0], value = p => record(p).values[0];
const cases = [
  ["unknown root field", p => { p.extra = true; }],
  ["unknown scope field", p => { p.targetScope.extra = true; }],
  ["unknown book field", p => { book(p).extra = true; }],
  ["unknown item field", p => { item(p).extra = true; }],
  ["unknown record field", p => { record(p).sourceMultiplicity = 2; }],
  ["unknown value field", p => { value(p).extra = true; }],
  ["unknown summary field", p => { record(p).summary.extra = "1"; }],
  ["unknown formula field", p => { book(p).formulas[0].extra = true; }],
  ["non-boolean null marker", p => { value(p).isSourceNull = "false"; }],
  ["null with payload", p => { value(p).isSourceNull = true; }],
  ["multiple typed payloads", p => { value(p).textValue = "silently discarded before fix"; }],
  ["numeric amount", p => { value(p).decimalValue = 1; }],
  ["amount overflow", p => { value(p).decimalValue = "10000000000000000.0000"; }],
  ["amount scale overflow", p => { value(p).decimalValue = "1.00001"; }],
  ["summary numeric amount", p => { record(p).summary.netAmount = 1; }],
  ["summary scale overflow", p => { record(p).summary.netAmount = "1.00001"; }],
  ["unknown value type even for null", p => { value(p).valueType = "unknown"; value(p).isSourceNull = true; delete value(p).decimalValue; }],
  ["unknown item category", p => { item(p).itemCategory = "unknown"; }],
  ["catalog value mismatch", p => { item(p).valueType = "text"; item(p).decimalScale = null; }],
  ["unknown source column", p => { value(p).column = "missing"; }],
  ["two columns for same item", p => { record(p).values.push({ ...value(p), column: "U1" }); }],
  ["ambiguous item aliases", p => { book(p).items.push({ ...item(p), legacyItemName: "U1", itemCode: "U2" }); }],
  ["duplicate formula identity", p => { book(p).formulas.push({ ...book(p).formulas[0] }); }],
  ["formula id overflow", p => { book(p).formulas[0].legacyFormulaId = 2147483648; }],
  ["noninteger formula order", p => { book(p).formulas[0].calculationOrder = 1.5; }],
  ["formula payload type", p => { book(p).formulas[0].rawExpression = {}; }],
  ["duplicate mapped target", p => { book(p).records.push({ ...record(p), sourcePersonIdentity: "OTHER" }); }],
  ["invalid mapping UUID", p => { record(p).employeeMappingId = "not-a-uuid"; }],
  ["source table book mismatch", p => { record(p).sourceTable = "dbo.salary02"; }],
  ["empty book cannot produce a usable source", p => { book(p).records = []; }],
  ["duplicate row hash", p => { book(p).records.push({ ...record(p), sourcePersonIdentity: "SECOND", employeeMappingId: "00000000-0000-4000-8000-000000000002" }); }],
  ["null arrays", p => { book(p).items = null; }],
  ["invalid timestamp date", p => { p.extractedAt = "2026-02-30T00:00:00Z"; }],
  ["invalid head pair", p => { p.expectedHeadVersion = 1; }],
  ["embedded NUL", p => { item(p).displayName = "x\0y"; }],
  ["invalid calendar date", p => { item(p).valueType = "date"; item(p).decimalScale = null; value(p).valueType = "date"; delete value(p).decimalValue; value(p).dateValue = "2026-02-30"; }],
];
for (const [name, mutate] of cases) test(`offline and API contract reject ${name}`, () => {
  const input = fixture(), pkg = buildYuzhouPayrollSourcePackage(input).packageDto;
  mutate(input); mutate(pkg);
  assert.throws(() => buildYuzhouPayrollSourcePackage(input), /YUZHOU_PAYROLL_SOURCE_/);
  assert.throws(() => validateYuzhouPayrollSourcePackage(pkg), /YUZHOU_PAYROLL_SOURCE_/);
});
test("each declared collection hash is independently recomputed", () => {
  for (const key of ["bookSetSha256", "rosterSha256", "catalogSha256"]) {
    const pkg = buildYuzhouPayrollSourcePackage(fixture()).packageDto;
    pkg[key] = sha("forged");
    assert.throws(() => validateYuzhouPayrollSourceHashes(pkg, sha), /DECLARED_HASH_MISMATCH/);
    assert.throws(() => buildYuzhouPayrollSourcePackage(pkg), /DECLARED_HASH_MISMATCH/);
  }
});
test("canonical order is stable across input order and hash inputs", () => {
  const input = fixture();
  book(input).items.push({ ...item(input), itemCode: "U2", legacyItemName: "u2" });
  record(input).values.push({ ...value(input), column: "u2" });
  const reversed = structuredClone(input); book(reversed).items.reverse(); record(reversed).values.reverse();
  assert.deepEqual(buildYuzhouPayrollSourcePackage(reversed), buildYuzhouPayrollSourcePackage(input));
  const pkg = buildYuzhouPayrollSourcePackage(input).packageDto;
  validateYuzhouPayrollSourcePackage(pkg); validateYuzhouPayrollSourceHashes(pkg, sha);
  assert.equal(sha(canonicalJson(pkg)), buildYuzhouPayrollSourcePackage(pkg).receipt.packageSha256);
});
test("NULL, empty text, leap date, maximum decimal and orphan formulas remain supported", () => {
  for (const [type, payload] of [["decimal", {decimalValue:"9999999999999999.9999"}], ["text", {textValue:""}], ["date", {dateValue:"2024-02-29"}], ["decimal", null]]) {
    const input = fixture(); item(input).valueType = type; item(input).decimalScale = type === "decimal" ? 4 : null;
    const old = value(input); record(input).values = [{column:old.column,sourceHash:old.sourceHash,valueType:type,isSourceNull:payload===null,...payload}];
    book(input).formulas[0].itemCode = "ORPHAN";
    const pkg = buildYuzhouPayrollSourcePackage(input).packageDto;
    validateYuzhouPayrollSourcePackage(pkg); validateYuzhouPayrollSourceHashes(pkg, sha);
  }
});
test("global formula IDs cannot silently become multiple book versions", () => {
  const input = fixture(), second = structuredClone(book(input)); second.scheme=2; second.records[0].sourceTable="dbo.salary02";
  input.books.push(second);
  assert.throws(() => buildYuzhouPayrollSourcePackage(input), /FORMULA_INVALID/);
});

test("prepared bytes cannot erase multiplicity/disposition or bypass manifest verification", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildYuzhouPayrollSourcePackageFromPrepared: adapt, buildYuzhouPayrollSourcePackageFromPreparedStreaming: stream } = await import("../hr-cutover/build-yuzhou-payroll-source-package.mjs");
  const root = mkdtempSync(join(tmpdir(), "synthetic-payroll-adversarial-"));
  try {
    const rows = {
      "scheme-memberships.jsonl": [{source:{scheme:"1",person:"SYNTHETIC"},sourceRowSha256:sha("membership")}],
      "items.jsonl": [{source:{scheme:"1",itemname:"u1",datatype:"数值",description:"synthetic",itemtype:"数值",addorsub:"增加项",myorder:"1"},sourceRowSha256:sha("item")}],
      "formulas.jsonl": [],
      "closes.jsonl": [{source:{scheme:"1",year:"2026",month:"7",closestate:"1"},sourceRowSha256:sha("close")}],
      "payslips.jsonl": [{source:{year:"2026",month:"7",person:"SYNTHETIC"},sourceTable:"dbo.salary01",legacyScheme:"01",sourceRowSha256:sha("row"),sourceMultiplicity:"1",disposition:"candidate",values:[{legacyColumn:"u1",value:{kind:"decimal",decimal:"1.0000"}}]}],
    };
    const mapping={formatVersion:1,scope:{tenantId:"fixture",parkId:"fixture"},entries:[{sourcePerson:"SYNTHETIC",employeeMappingId:fixture().books[0].records[0].employeeMappingId}]};
    writeFileSync(join(root,"mapping.json"),JSON.stringify({...mapping,artifactSha256:sha(canonicalJson(mapping))}),{mode:0o600});
    const options={preparedRoot:root,manifestPath:join(root,"manifest.json"),mappingPath:join(root,"mapping.json"),month:"2026-07",sourceInstance:"fixture"};
    const save = data => {
      const outputFiles={};
      for(const [name,entries] of Object.entries(data)) { const bytes=entries.map(row=>JSON.stringify(row)+"\n").join(""); writeFileSync(join(root,name),bytes,{mode:0o600}); outputFiles[name]={fileSha256:sha(bytes)}; }
      writeFileSync(options.manifestPath,JSON.stringify({formatVersion:1,productionImport:"HOLD",sourceBackupSha256:sha("backup"),outputFiles}),{mode:0o600});
    };
    save(rows); assert.deepEqual((await stream(options)).packageDto,adapt(options).packageDto);
    const { payrollSourceExtractorIdentity, verifyPreparedPayrollExtraction, registerPreparedPayrollExtraction } = await import("../hr-cutover/register-yuzhou-payroll-source-extraction.mjs");
    const registeredOptions = { ...options, expectedManifestSha256: sha(readFileSync(options.manifestPath)), expectedExtractorSha256: payrollSourceExtractorIdentity().extractorSha256,
      allowExtractionRegistration: true, targetScope: mapping.scope,
      database: { host: "127.0.0.1", port: 15490, database: "synthetic_owned", user: "synthetic", password: "synthetic-test-only" }, expectedDatabaseOid: 1234 };
    const proof = await verifyPreparedPayrollExtraction(registeredOptions);
    assert.equal(proof.proof.booksSha256,sha(canonicalJson(adapt(options).packageDto.books)));
    assert.equal(proof.proof.recordCount,1); assert.equal(proof.proof.valueCount,1);
    let connects=0, ended=0; const statements=[];
    const connect=async()=>{ connects++; return {query:async(sql,params)=>{
      statements.push({sql,params});
      if(sql.startsWith("SELECT current_database"))return {rows:[{name:"synthetic_owned",oid:1234}]};
      if(sql.startsWith("SELECT id"))return {rows:[{id:"synthetic-proof"}]};
      return {rows:[]};
    },end:async()=>{ended++;}};};
    const registered=await registerPreparedPayrollExtraction(registeredOptions,connect);
    assert.equal(registered.status,"REGISTERED_VERIFIED_EXTRACTION"); assert.equal(registered.businessApproval,false);
    assert.equal(connects,1); assert.equal(ended,1);
    assert.equal(statements.filter(entry=>entry.sql.startsWith("INSERT")).length,1);
    assert.equal(JSON.stringify(statements).includes("SYNTHETIC"),false,"SQL stores only hashes/counts, no private source identities");
    assert.equal(statements.at(-1).sql,"COMMIT");
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,expectedExtractorSha256:sha("wrong")},connect),/EXTRACTOR_DRIFT/);
    assert.equal(connects,1,"invalid extraction never opens a database connection");
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,expectedManifestSha256:sha("wrong manifest")},connect),/MANIFEST_DRIFT/);
    assert.equal(connects,1);
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,targetScope:{...mapping.scope,parkId:"other"}},connect),/SCOPE_MISMATCH/);
    assert.equal(connects,1);
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,expectedDatabaseOid:5678},connect),/TARGET_MISMATCH/);
    assert.equal(ended,2);
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,database:{...registeredOptions.database,host:"postgres"}},connect),/TARGET_REQUIRED/);
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,databaseTransport:"docker_service",database:{...registeredOptions.database,host:"example.com"}},connect),/TARGET_REQUIRED/);
    await assert.rejects(()=>registerPreparedPayrollExtraction({...registeredOptions,database:{...registeredOptions.database,connectionString:"postgres://unexpected"}},connect),/TARGET_REQUIRED/);
    const dockerResult=await registerPreparedPayrollExtraction({...registeredOptions,databaseTransport:"docker_service",database:{...registeredOptions.database,host:"postgres"}},connect);
    assert.equal(dockerResult.status,"REGISTERED_VERIFIED_EXTRACTION");

    for(const mutate of [r=>{r.sourceMultiplicity="2";},r=>{delete r.sourceMultiplicity;},r=>{r.disposition="quarantined";},r=>{r.disposition="item_unmapped";},r=>{r.values[0].value.kind="missing_column";}]) {
      const changed=structuredClone(rows); mutate(changed["payslips.jsonl"][0]); save(changed);
      assert.throws(()=>adapt(options),/YUZHOU_PAYROLL_SOURCE_/);
      await assert.rejects(()=>stream(options),/YUZHOU_PAYROLL_SOURCE_/);
    }
    save(rows); assert.throws(()=>adapt({...options,preparedRows:{"payslips.jsonl":[]}}),/UNVERIFIED_PREPARED_ROWS/);
    await assert.rejects(()=>stream({...options,preparedRows:{"payslips.jsonl":[]}}),/UNVERIFIED_PREPARED_ROWS/);
    writeFileSync(join(root,"payslips.jsonl"),"{}\n",{mode:0o600});
    assert.throws(()=>adapt(options),/MANIFEST_HASH_MISMATCH/);
    await assert.rejects(()=>stream(options),/MANIFEST_HASH_MISMATCH/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
