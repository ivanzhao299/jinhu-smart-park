#!/usr/bin/env node
/* global process */
// Builds a private, typed *complete monthly* source package. It deliberately
// accepts a reviewed extraction descriptor only; it never opens a backup or
// calculates monetary values.
import { createHash } from "node:crypto";
import shared from "../../packages/shared/dist/hr-yuzhou-payroll-source.js";
const { canonicalJson: canonical, canonicalYuzhouPayrollSourcePackage, validateYuzhouPayrollSourcePackage,
  validateYuzhouPayrollSourceHashes, yuzhouPayrollSourceHashInputs } = shared;
import { URL } from "node:url";
import { chmodSync, createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const sha = value => createHash("sha256").update(value).digest("hex");
const HEX = /^[0-9a-f]{64}$/u, MONTH = /^(?:19|20|21)\d{2}-(0[1-9]|1[0-2])$/u;
const fail = code => { throw new Error(code); };
const ensurePrivateDirectory = path => { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); };
const writePrivateJson = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const lines = bytes => bytes.toString("utf8").split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { fail("YUZHOU_PAYROLL_SOURCE_JSONL_INVALID"); } });
const fileBytes = (root, name, manifest) => { const bytes=readFileSync(resolve(root,name)); const expected=manifest?.outputFiles?.[name]?.fileSha256; if (!HEX.test(expected ?? "") || sha(bytes)!==expected) fail("YUZHOU_PAYROLL_SOURCE_MANIFEST_HASH_MISMATCH"); return bytes; };

function preparedItemMetadata(row) {
  const m=row.declarativeMetadata??{},source=row.source;
  const integer=value=>value!==null && value!==undefined && /^-?[0-9]{1,10}$/u.test(String(value)) && Number(value)>=-2147483648 && Number(value)<=2147483647 ? Number(value) : null;
  const boolean=value=>typeof value==="boolean"?value:null;
  return {taxable:boolean(m.taxable),printEnabled:boolean(m.printEnabled),enabled:m.enabled===true,
    printWidth:integer(m.printWidth),printWidthSourceHash:m.printWidthSourceHash??null,
    taxFlag:source.istax==null?null:String(source.istax),noDecimalFlag:source.notdec==null?null:String(source.notdec),useFlag:source.isuse==null?null:String(source.isuse),
    legacyDecimalLength:integer(m.legacyDecimalLength),decimalLengthSourceHash:m.decimalLengthSourceHash??null,
    legacyPrintReport:integer(m.legacyPrintReport),printReportSourceHash:m.printReportSourceHash??null,
    itemTitle:m.itemTitle??null,longDescription:m.longDescription??null,suppressDecimals:boolean(m.suppressDecimals),legacyMetadataReviewRequired:m.legacyMetadataReviewRequired!==false};
}

// Run `pnpm --filter @jinhu/shared build` before the standalone offline CLI.
// The same validator accepts the exact object API preview will persist. Do not
// normalize malformed or unknown fields away before validation.
export function buildYuzhouPayrollSourcePackage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("YUZHOU_PAYROLL_SOURCE_INPUT_INVALID");
  const placeholders = { bookSetSha256: "0".repeat(64), rosterSha256: "0".repeat(64), catalogSha256: "0".repeat(64) };
  const candidate = { ...placeholders, ...input };
  validateYuzhouPayrollSourcePackage(candidate);
  const packageDto = canonicalYuzhouPayrollSourcePackage(candidate);
  for (const [key, value] of Object.entries(yuzhouPayrollSourceHashInputs(packageDto))) {
    const computed = sha(canonical(value));
    if (Object.hasOwn(input, key) && input[key] !== computed) fail("YUZHOU_PAYROLL_SOURCE_DECLARED_HASH_MISMATCH");
    packageDto[key] = computed;
  }
  validateYuzhouPayrollSourceHashes(packageDto, sha);
  const books = packageDto.books;
  const recordCount = books.reduce((sum, book) => sum + book.records.length, 0);
  const valueCount = books.reduce((sum, book) => sum + book.records.reduce((inner, row) => inner + row.values.length, 0), 0);
  const packageSha256 = sha(canonical(packageDto));
  return { packageDto, receipt: { kind: "yuzhou_payroll_source_package", productionImport: "HOLD", month: packageDto.month,
    packageSha256, recordCount, employeeCount: new Set(books.flatMap(book => book.records.map(row => row.employeeMappingId))).size,
    valueCount, bookCounts: books.map(book => ({ scheme: book.scheme, recordCount: book.records.length })) } };
}

/**
 * Deterministically adapts the existing T4 prepared JSONL representation.  It
 * consumes authenticated bytes and an explicit target mapping artifact only;
 * no backup, SQL, names, or inferred zero/close/summary values are used.
 */
export function buildYuzhouPayrollSourcePackageFromPrepared(options) {
  if (Object.hasOwn(options, "preparedRows")) fail("YUZHOU_PAYROLL_SOURCE_UNVERIFIED_PREPARED_ROWS");
  return adaptPrepared(options);
}

// The only prefiltered input is created by the private full-byte streaming verifier.
function adaptPrepared({ preparedRoot, manifestPath, mappingPath, month, sourceInstance, expectedHeadVersion = 0, expectedHeadHash = null }, verifiedPayslips = null) {
  if (!MONTH.test(month ?? "") || !preparedRoot || !manifestPath || !mappingPath || !sourceInstance) fail("YUZHOU_PAYROLL_SOURCE_PREPARED_ARGUMENTS_INVALID");
  const manifestBytes=readFileSync(resolve(manifestPath)); const manifest=JSON.parse(manifestBytes);
  if (manifest?.formatVersion!==1 || manifest?.productionImport!=="HOLD" || !manifest.outputFiles || !HEX.test(manifest?.sourceBackupSha256 ?? "")) fail("YUZHOU_PAYROLL_SOURCE_PREPARED_MANIFEST_INVALID");
  const mapping=JSON.parse(readFileSync(resolve(mappingPath),"utf8"));
  if (!mapping || mapping.formatVersion!==1 || !mapping.scope || !Array.isArray(mapping.entries) || !HEX.test(mapping.artifactSha256 ?? "") || mapping.artifactSha256!==sha(canonical({formatVersion:mapping.formatVersion,scope:mapping.scope,entries:mapping.entries}))) fail("YUZHOU_PAYROLL_SOURCE_MAPPING_ARTIFACT_INVALID");
  if (verifiedPayslips && manifest.outputFiles["payslips.jsonl"]?.fileSha256 !== verifiedPayslips.fileSha256) fail("YUZHOU_PAYROLL_SOURCE_MANIFEST_HASH_MISMATCH");
  const files=Object.fromEntries(["scheme-memberships.jsonl","items.jsonl","formulas.jsonl","closes.jsonl","payslips.jsonl"].map(name=>[name,name === "payslips.jsonl" && verifiedPayslips ? verifiedPayslips.rows : lines(fileBytes(preparedRoot,name,manifest))]));
  const mappingByPerson=new Map(); for(const entry of mapping.entries){if(!entry||typeof entry.sourcePerson!=="string"||!entry.sourcePerson||typeof entry.employeeMappingId!=="string"||!entry.employeeMappingId||mappingByPerson.has(entry.sourcePerson))fail("YUZHOU_PAYROLL_SOURCE_MAPPING_ARTIFACT_INVALID");mappingByPerson.set(entry.sourcePerson,entry.employeeMappingId);}
  const [year,monthNo]=month.split("-").map(Number), schemes=new Set();
  const closes=new Map(); for(const row of files["closes.jsonl"]){const source=row?.source;if(!source||Number(source.year)!==year||Number(source.month)!==monthNo)continue;const scheme=Number(source.scheme);if(!Number.isInteger(scheme)||!HEX.test(row.sourceRowSha256??"")||closes.has(scheme))fail("YUZHOU_PAYROLL_SOURCE_CLOSE_INVALID");closes.set(scheme,{closeState:Number(source.closestate),closeSourceHash:row.sourceRowSha256});}
  const payslips=files["payslips.jsonl"].filter(row=>Number(row?.source?.year)===year&&Number(row?.source?.month)===monthNo);
  if(!payslips.length)fail("YUZHOU_PAYROLL_SOURCE_MONTH_EMPTY");
  for(const row of payslips){if(row.sourceMultiplicity!=="1" || row.disposition!=="candidate")fail("YUZHOU_PAYROLL_SOURCE_MULTIPLICITY_OR_DISPOSITION_INVALID");const scheme=Number(row.legacyScheme ?? String(row.sourceTable??"").replace(/^dbo\.salary/u,""));if(!Number.isInteger(scheme)||!closes.has(scheme)||!row?.source?.person||!HEX.test(row.sourceRowSha256??"")||!Array.isArray(row.values))fail("YUZHOU_PAYROLL_SOURCE_PAYSLIP_INVALID");schemes.add(scheme);}
  const byScheme=scheme=>({scheme,bookName:null,closeState:closes.get(scheme).closeState,closeSourceHash:closes.get(scheme).closeSourceHash,records:[],items:[],formulas:[]});const books=new Map([...schemes].sort((a,b)=>a-b).map(s=>[s,byScheme(s)]));
  const itemBySchemeColumn=new Map(); for(const row of files["items.jsonl"]){const source=row?.source,scheme=Number(source?.scheme);if(!books.has(scheme))continue;if(!source?.itemname||!HEX.test(row.sourceRowSha256??""))fail("YUZHOU_PAYROLL_SOURCE_CATALOG_INVALID");if(!["数值","日期","字符","文本"].includes(source.datatype))fail("YUZHOU_PAYROLL_SOURCE_ITEM_TYPE_UNKNOWN");const valueType=source.datatype==="数值"?"decimal":source.datatype==="日期"?"date":"text";const item={legacyItemName:source.itemname,itemCode:source.itemname.toUpperCase(),displayName:source.description??source.itemname,valueType,legacyItemType:source.itemtype??"",legacyAddOrSub:source.addorsub??"",itemCategory:source.addorsub==="增加项"?"earning":source.addorsub==="减少项"?"deduction":source.addorsub==="自动"?"summary":"unclassified",decimalScale:valueType==="decimal"?Number(row.declarativeMetadata?.decimalScale??4):null,sortNo:Number(source.myorder??0),sourceHash:row.sourceRowSha256,declarativeMetadata:preparedItemMetadata(row)};if(!Number.isInteger(item.decimalScale??0)||item.decimalScale>4||itemBySchemeColumn.has(`${scheme}:${item.legacyItemName}`))fail("YUZHOU_PAYROLL_SOURCE_CATALOG_INVALID");itemBySchemeColumn.set(`${scheme}:${item.legacyItemName}`,item);books.get(scheme).items.push(item);}
  for(const key of itemBySchemeColumn.keys()){books.get(Number(key.split(":",1)[0])).items.sort((a,b)=>a.itemCode.localeCompare(b.itemCode));}
  for(const row of files["formulas.jsonl"]){const source=row?.source,scheme=Number(source?.scheme);if(!books.has(scheme))continue;if(!Number.isInteger(Number(source?.id))||typeof source?.expression!=="string"||!HEX.test(row.sourceRowSha256??""))fail("YUZHOU_PAYROLL_SOURCE_FORMULA_INVALID");books.get(scheme).formulas.push({legacyFormulaId:Number(source.id),itemCode:source.itemname?.toUpperCase()??null,rawExpression:source.expression,rawCondition:source.cit===""?null:source.cit??null,calculationOrder:Number(source.myorder??1),sourceHash:row.sourceRowSha256});}
  for(const row of files["scheme-memberships.jsonl"]){const source=row?.source,scheme=Number(source?.scheme);if(!books.has(scheme))continue;if(!mappingByPerson.has(source?.person))continue;/* membership is source completeness evidence; record ownership remains payslip natural key */}
  for(const row of payslips){const scheme=Number(row.legacyScheme ?? String(row.sourceTable).replace(/^dbo\.salary/u,"")),book=books.get(scheme),person=row.source.person,employeeMappingId=mappingByPerson.get(person);if(!employeeMappingId)fail("YUZHOU_PAYROLL_SOURCE_MAPPING_MISSING");const values=row.values.map(entry=>{const kind=entry?.value?.kind,column=entry?.legacyColumn,item=itemBySchemeColumn.get(`${scheme}:${column}`);if(!column||!item)fail("YUZHOU_PAYROLL_SOURCE_UNKNOWN_COLUMN");const sourceHash=sha(`${row.sourceRowSha256}${column}`);if(kind==="null")return {column,valueType:item.valueType,isSourceNull:true,sourceHash};if(kind==="decimal"||kind==="zero"){if(typeof entry.value.decimal!=="string")fail("YUZHOU_PAYROLL_SOURCE_VALUE_INVALID");return {column,valueType:"decimal",isSourceNull:false,decimalValue:entry.value.decimal,sourceHash};}if(kind==="text")return {column,valueType:"text",isSourceNull:false,textValue:entry.value.value,sourceHash};if(kind==="empty")return {column,valueType:"text",isSourceNull:false,textValue:"",sourceHash};fail("YUZHOU_PAYROLL_SOURCE_VALUE_KIND_INVALID");});const summary={};for(const entry of row.values){const key=entry?.systemSummary;if(["gross_total","deduction_total","tax_total","net_total"].includes(key)){if(entry?.value?.kind!=="decimal"&&entry?.value?.kind!=="zero"&&entry?.value?.kind!=="null")fail("YUZHOU_PAYROLL_SOURCE_SUMMARY_INVALID");if(Object.hasOwn(summary,{gross_total:"grossAmount",deduction_total:"deductionAmount",tax_total:"taxAmount",net_total:"netAmount"}[key]))fail("YUZHOU_PAYROLL_SOURCE_SUMMARY_DUPLICATE");summary[{gross_total:"grossAmount",deduction_total:"deductionAmount",tax_total:"taxAmount",net_total:"netAmount"}[key]]=entry.value.kind==="null"?null:entry.value.decimal;}}book.records.push({sourcePersonIdentity:person,sourceRowSha256:row.sourceRowSha256,employeeMappingId,sourceTable:row.sourceTable,values,summary});}
  const result=buildYuzhouPayrollSourcePackage({version:1,sourceSystem:"yuzhou-v10",targetScope:mapping.scope,manifestId:sha(manifestBytes),sourceInstance,month,extractedAt:manifest.extractedAt??new Date(0).toISOString(),evidenceSha256:sha(canonical({manifest:sha(manifestBytes),files:Object.fromEntries(Object.entries(manifest.outputFiles).map(([name,value])=>[name,value.fileSha256])),mapping:mapping.artifactSha256})),expectedHeadVersion,expectedHeadHash,books:[...books.values()]});
  return {...result,preparedEvidence:{manifestSha256:sha(manifestBytes),mappingArtifactSha256:mapping.artifactSha256,files:Object.fromEntries(Object.entries(manifest.outputFiles).map(([name,value])=>[name,value.fileSha256]))}};
}

/** Stream the potentially large payslips JSONL once: hash every byte and retain only the requested complete month. */
export async function buildYuzhouPayrollSourcePackageFromPreparedStreaming(options) {
  const manifest=JSON.parse(readFileSync(resolve(options.manifestPath),"utf8"));
  const payslipName="payslips.jsonl", expected=manifest?.outputFiles?.[payslipName]?.fileSha256;
  if(!HEX.test(expected??"")) fail("YUZHOU_PAYROLL_SOURCE_PREPARED_MANIFEST_INVALID");
  const [year,month]=String(options.month??"").split("-").map(Number), selected=[]; const digest=createHash("sha256");
  const stream=createReadStream(resolve(options.preparedRoot,payslipName)); stream.on("data",chunk=>digest.update(chunk));
  const reader=createInterface({input:stream,crlfDelay:Infinity});
  for await (const line of reader) { if(!line) fail("YUZHOU_PAYROLL_SOURCE_JSONL_INVALID"); let row;try{row=JSON.parse(line);}catch{fail("YUZHOU_PAYROLL_SOURCE_JSONL_INVALID");}if(Number(row?.source?.year)===year&&Number(row?.source?.month)===month)selected.push(row); }
  if(digest.digest("hex")!==expected) fail("YUZHOU_PAYROLL_SOURCE_MANIFEST_HASH_MISMATCH");
  if (Object.hasOwn(options, "preparedRows")) fail("YUZHOU_PAYROLL_SOURCE_UNVERIFIED_PREPARED_ROWS");
  return adaptPrepared(options,{rows:selected,fileSha256:expected});
}

export function materializeYuzhouPayrollSourcePackage({ inputPath, outputDir }) {
  const source = resolve(inputPath), output = resolve(outputDir);
  if (statSync(source).mode & 0o077) fail("YUZHOU_PAYROLL_SOURCE_INPUT_NOT_PRIVATE");
  const { packageDto, receipt } = buildYuzhouPayrollSourcePackage(JSON.parse(readFileSync(source, "utf8")));
  ensurePrivateDirectory(output); const packagePath = resolve(output, "package.json"), receiptPath = resolve(output, "receipt.json");
  writePrivateJson(packagePath, packageDto); writePrivateJson(receiptPath, { ...receipt, packagePath });
  return { ...receipt, packagePath, receiptPath };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value, all[index + 1]]] : pairs, []));
  try {
    if (args["--prepared-root"] && args["--manifest"] && args["--employee-map"] && args["--month"] && args["--source-instance"] && args["--output"] && Object.keys(args).every(key=>["--prepared-root","--manifest","--employee-map","--month","--source-instance","--output","--expected-head-version","--expected-head-hash"].includes(key))) {
      const built=await buildYuzhouPayrollSourcePackageFromPreparedStreaming({preparedRoot:args["--prepared-root"],manifestPath:args["--manifest"],mappingPath:args["--employee-map"],month:args["--month"],sourceInstance:args["--source-instance"],expectedHeadVersion:Number(args["--expected-head-version"]??0),expectedHeadHash:args["--expected-head-hash"]??null});ensurePrivateDirectory(resolve(args["--output"]));const packagePath=resolve(args["--output"],"package.json"),receiptPath=resolve(args["--output"],"receipt.json");writePrivateJson(packagePath,built.packageDto);writePrivateJson(receiptPath,{...built.receipt,...built.preparedEvidence,packagePath});process.stdout.write(`${JSON.stringify({...built.receipt,...built.preparedEvidence,packagePath,receiptPath})}\n`);
    } else if (args["--input"] && args["--output"] && Object.keys(args).length===2) process.stdout.write(`${JSON.stringify(materializeYuzhouPayrollSourcePackage({ inputPath: args["--input"], outputDir: args["--output"] }))}\n`);
    else fail("YUZHOU_PAYROLL_SOURCE_ARGUMENTS_INVALID");
  } catch (error) { process.stderr.write(`${error instanceof Error && /^YUZHOU_PAYROLL_SOURCE_/.test(error.message) ? error.message : "YUZHOU_PAYROLL_SOURCE_BUILD_FAILED"}\n`); process.exitCode = 1; }
}
