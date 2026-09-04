import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyCustomFieldDefinitions,
  LEGACY_DEFINITION_LOGIC_COLUMNS,
  LEGACY_DEFINITION_SOURCE_COLUMNS,
  LEGACY_PERSON_CUSTOM_FIELDS,
  legacyGetdef,
  materializeLegacyEmployeeCustomFields
} from "../hr-cutover/legacy-custom-field-parity.mjs";

const datatype={text:"字符",numeric:"数字",date:"日期"};
const definitionRow=(field,index,overrides={})=>({
  ID:index+1,
  def:field.code,
  description:`字段 ${field.code}`,
  datatype:datatype[field.valueType],
  groupid:"profile",
  groupname:"人员扩展",
  myorder:index+1,
  description_d:null,
  sqltext:null,
  flag:null,
  crosssql:null,
  crosscolselectsql:null,
  crossrowselectsql:null,
  crosswhere:null,
  querywhere:null,
  ascount:null,
  ascount2:null,
  ...overrides
});
const definitionFixture=()=>LEGACY_PERSON_CUSTOM_FIELDS.map((field,index)=>definitionRow(field,index));
const mappingContract=JSON.parse(readFileSync(resolve(import.meta.dirname,"../hr-cutover/contracts/legacy-employee-profile-materialization-reviewed-v1.json"),"utf8"));

test("dbo.defs contract pins all 17 source columns and 19 person custom fields",()=>{
  assert.equal(LEGACY_DEFINITION_SOURCE_COLUMNS.length,17);
  assert.equal(LEGACY_DEFINITION_LOGIC_COLUMNS.length,10);
  assert.equal(LEGACY_PERSON_CUSTOM_FIELDS.length,19);
  assert.deepEqual(mappingContract.personCustomFieldMapping.sourceDefinitionColumns,LEGACY_DEFINITION_SOURCE_COLUMNS);
  assert.deepEqual(mappingContract.personCustomFieldMapping.fields.map(field=>[field.sourceColumn,field.valueType,field.mappingOrdinal]),LEGACY_PERSON_CUSTOM_FIELDS.map(field=>[field.code,field.valueType,field.mappingOrdinal]));
  assert.equal(mappingContract.personCustomFieldMapping.targetDefinitionTable,"hr_custom_field_definition");
  assert.equal(mappingContract.personCustomFieldMapping.targetValueTable,"hr_employee_custom_value");
  assert.equal(mappingContract.personCustomFieldMapping.logicCoverageRule,"all_10_logic_columns_count_in_denominator_even_when_source_null");
  const definitions=buildLegacyCustomFieldDefinitions(definitionFixture());
  assert.equal(definitions.length,19);
  assert.equal(legacyGetdef(definitions,"def1"),"字段 def1");
  assert.equal(legacyGetdef(definitions,"unknown"),"unknown");
  assert.deepEqual(definitions.map(definition=>definition.sortOrder),Array.from({length:19},(_,index)=>index));
  const reordered=definitionFixture().map((row,index)=>index===0?{...row,myorder:null}:index===1?{...row,myorder:1}:row);
  assert.equal(buildLegacyCustomFieldDefinitions(reordered).find(definition=>definition.code==="def1")?.sortOrder,18);
});

test("definition logic values become hash-only review metadata and null columns remain in the denominator",()=>{
  const privateMarker="synthetic-private-expression";
  const rows=definitionFixture();
  rows[0]={...rows[0],sqltext:privateMarker,flag:"enabled"};
  const first=buildLegacyCustomFieldDefinitions(rows)[0];
  assert.deepEqual({denominator:first.legacyLogicCoverage.denominator,presentCount:first.legacyLogicCoverage.presentCount,nullCount:first.legacyLogicCoverage.nullCount,reviewStatus:first.legacyLogicCoverage.reviewStatus},{denominator:10,presentCount:2,nullCount:8,reviewStatus:"requires_capability_review"});
  assert.equal(first.legacySqltextPresent,true);
  assert.match(first.legacySqltextSha256??"",/^[0-9a-f]{64}$/u);
  assert.equal(first.legacyCrosssqlPresent,false);
  assert.equal(first.legacyCrosssqlSha256,null);
  assert.equal(first.legacyNullable,null);
  assert.equal(first.legacyRuleClassification,"review_required");
  assert.equal(JSON.stringify(first).includes(privateMarker),false);
  const inert=buildLegacyCustomFieldDefinitions(definitionFixture())[0];
  assert.equal(inert.legacyLogicCoverage.denominator,10);
  assert.equal(inert.legacyRuleClassification,"inert");
});

test("real definition drift fails closed instead of silently inventing metadata",()=>{
  const complete=definitionFixture();
  assert.throws(()=>buildLegacyCustomFieldDefinitions(complete.slice(1)),/LEGACY_CUSTOM_FIELD_DEFINITION_MISSING:def1/u);
  assert.throws(()=>buildLegacyCustomFieldDefinitions([...complete,complete[0]]),/LEGACY_CUSTOM_FIELD_DEFINITION_DUPLICATE:def1/u);
  assert.throws(()=>buildLegacyCustomFieldDefinitions(complete.map((row,index)=>index===0?{...row,datatype:null}:row)),/LEGACY_CUSTOM_FIELD_DEFINITION_DATATYPE_MISSING:def1/u);
  assert.throws(()=>buildLegacyCustomFieldDefinitions(complete.map((row,index)=>index===0?{...row,datatype:"日期"}:row)),/LEGACY_CUSTOM_FIELD_DEFINITION_DATATYPE_CONFLICT:def1/u);
  const missingLogicColumn={...complete[0]};delete missingLogicColumn.ascount2;
  assert.throws(()=>buildLegacyCustomFieldDefinitions([missingLogicColumn,...complete.slice(1)]),/LEGACY_CUSTOM_FIELD_DEFINITION_COLUMN_DRIFT/u);
});

test("wide person def columns become ordered typed values including explicit nulls",()=>{
  const definitions=buildLegacyCustomFieldDefinitions(definitionFixture());
  const values=materializeLegacyEmployeeCustomFields({def1:" 文本 ",def11:"0012.3400",def21:"2026-09-04T00:00:00",def22:null},definitions);
  assert.equal(values.length,19);
  const def1=values.find(value=>value.code==="def1");
  assert.equal(def1?.value,"文本");
  assert.equal(def1?.rawValue,null);
  assert.equal(def1?.isSourceNull,false);
  assert.equal(def1?.valid,true);
  assert.match(def1?.definitionSourceIdentitySha256??"",/^[0-9a-f]{64}$/u);
  assert.equal(values.find(value=>value.code==="def11")?.value,"12.34");
  assert.equal(values.find(value=>value.code==="def21")?.value,"2026-09-04");
  assert.equal(values.find(value=>value.code==="def22")?.isSourceNull,true);
});

test("invalid typed legacy values are retained as explicit private review failures",()=>{
  const values=materializeLegacyEmployeeCustomFields({def11:"not-a-number",def12:"123456789012345678901",def13:"1.123456789",def21:"2026-02-31"},buildLegacyCustomFieldDefinitions(definitionFixture()));
  assert.deepEqual(values.filter(value=>!value.valid).map(value=>value.code),["def11","def12","def13","def21"]);
  assert.deepEqual(values.filter(value=>!value.valid).map(value=>value.value),[null,null,null,null]);
});
