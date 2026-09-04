import { createHash } from "node:crypto";

const CUSTOM_FIELDS=Object.freeze([
  ["def1","text"],["def2","text"],["def3","text"],["def4","text"],["def5","text"],
  ["def6","text"],["def7","text"],["def8","text"],["def9","text"],
  ["def11","numeric"],["def12","numeric"],["def13","numeric"],["def14","numeric"],["def15","numeric"],
  ["def21","date"],["def22","date"],["def23","date"],["def24","date"],["def25","date"]
]);

export const LEGACY_PERSON_CUSTOM_FIELDS=Object.freeze(CUSTOM_FIELDS.map(([code,valueType],mappingOrdinal)=>Object.freeze({code,valueType,mappingOrdinal})));
export const LEGACY_DEFINITION_SOURCE_COLUMNS=Object.freeze([
  "ID","def","description","datatype","groupid","groupname","myorder","description_d","sqltext","flag",
  "crosssql","crosscolselectsql","crossrowselectsql","crosswhere","querywhere","ascount","ascount2"
]);
export const LEGACY_DEFINITION_LOGIC_COLUMNS=Object.freeze([
  Object.freeze({column:"description_d",classification:"presentation_expression"}),
  Object.freeze({column:"sqltext",classification:"legacy_sql_expression"}),
  Object.freeze({column:"flag",classification:"legacy_behavior_flag"}),
  Object.freeze({column:"crosssql",classification:"legacy_cross_lookup_sql"}),
  Object.freeze({column:"crosscolselectsql",classification:"legacy_cross_column_sql"}),
  Object.freeze({column:"crossrowselectsql",classification:"legacy_cross_row_sql"}),
  Object.freeze({column:"crosswhere",classification:"legacy_cross_filter"}),
  Object.freeze({column:"querywhere",classification:"legacy_query_filter"}),
  Object.freeze({column:"ascount",classification:"legacy_aggregate_flag"}),
  Object.freeze({column:"ascount2",classification:"legacy_secondary_aggregate_flag"})
]);

const DATATYPE_ALIASES=Object.freeze({
  text:new Set(["字符","字符型","字符串","文本","文本型","string","text","char","nchar","varchar","nvarchar"]),
  numeric:new Set(["数字","数字型","数值","数值型","number","numeric","decimal","money","float","real","integer","int"]),
  date:new Set(["日期","日期型","日期时间","时间","date","datetime","smalldatetime","time"])
});
const text=value=>value===null||value===undefined?null:String(value).trim()||null;
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
const sha=value=>createHash("sha256").update(value).digest("hex");
const isSourceNull=value=>value===null||value===undefined||String(value).trim()==="";
const canonicalDate=value=>{
  const normalized=text(value);
  if(!normalized)return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})/u.exec(normalized);
  if(!match)return null;
  const canonical=`${match[1]}-${match[2]}-${match[3]}`,date=new Date(`${canonical}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===canonical?canonical:null;
};
const canonicalNumeric=value=>{
  const normalized=text(value);
  if(!normalized)return null;
  if(!/^-?(?:\d+)(?:\.\d+)?$/u.test(normalized))return null;
  const [integer,fraction=""]=normalized.split("."),negative=integer.startsWith("-"),unsigned=negative?integer.slice(1):integer;
  const left=unsigned.replace(/^0+(?=\d)/u,"")||"0",right=fraction.replace(/0+$/u,"");
  if(left.length>20||right.length>8)return null;
  return `${negative&&left!=="0"?"-":""}${left}${right?`.${right}`:""}`;
};
const requireExactDefinitionColumns=row=>{
  if(!row||typeof row!=="object"||Array.isArray(row))throw new Error("LEGACY_CUSTOM_FIELD_DEFINITION_ROW_INVALID");
  const actual=Object.keys(row).sort(),expected=[...LEGACY_DEFINITION_SOURCE_COLUMNS].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error("LEGACY_CUSTOM_FIELD_DEFINITION_COLUMN_DRIFT");
};
const stableInteger=(value,code)=>{
  if(isSourceNull(value))return null;
  const number=typeof value==="number"?value:Number(String(value).trim());
  if(!Number.isSafeInteger(number))throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_ORDER_INVALID:${code}`);
  return number;
};
const stableId=(value,code)=>{
  const normalized=text(value);
  if(!normalized)throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_ID_MISSING:${code}`);
  return normalized;
};
const compareStableId=(left,right)=>{
  if(/^\d+$/u.test(left)&&/^\d+$/u.test(right)){
    const a=BigInt(left),b=BigInt(right);
    return a<b?-1:a>b?1:0;
  }
  return left.localeCompare(right,"en");
};
const validateDatatype=(value,field)=>{
  const normalized=text(value)?.toLowerCase();
  if(!normalized)throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_DATATYPE_MISSING:${field.code}`);
  if(!DATATYPE_ALIASES[field.valueType].has(normalized))throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_DATATYPE_CONFLICT:${field.code}`);
  return text(value);
};
const logicCoverage=row=>{
  const columns=LEGACY_DEFINITION_LOGIC_COLUMNS.map(rule=>{
    const sourceNull=isSourceNull(row[rule.column]);
    return {
      ...rule,
      execution:"forbidden",
      isSourceNull:sourceNull,
      sourceValueSha256:sourceNull?null:sha(canonical(row[rule.column]))
    };
  });
  const presentCount=columns.filter(column=>!column.isSourceNull).length;
  return {
    denominator:LEGACY_DEFINITION_LOGIC_COLUMNS.length,
    presentCount,
    nullCount:LEGACY_DEFINITION_LOGIC_COLUMNS.length-presentCount,
    reviewStatus:presentCount?"requires_capability_review":"no_legacy_logic_value",
    columns
  };
};

export function buildLegacyCustomFieldDefinitions(rows){
  if(!Array.isArray(rows))throw new Error("LEGACY_CUSTOM_FIELD_DEFINITIONS_INVALID");
  const byCode=new Map(),ids=new Set();
  for(const row of rows){
    requireExactDefinitionColumns(row);
    const code=text(row.def)?.toLowerCase();
    if(!code||!LEGACY_PERSON_CUSTOM_FIELDS.some(field=>field.code===code))throw new Error("LEGACY_CUSTOM_FIELD_DEFINITION_UNEXPECTED");
    if(byCode.has(code))throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_DUPLICATE:${code}`);
    const id=stableId(row.ID,code);
    if(ids.has(id))throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_ID_DUPLICATE:${id}`);
    ids.add(id);byCode.set(code,row);
  }
  const missing=LEGACY_PERSON_CUSTOM_FIELDS.filter(field=>!byCode.has(field.code)).map(field=>field.code);
  if(missing.length)throw new Error(`LEGACY_CUSTOM_FIELD_DEFINITION_MISSING:${missing.join(",")}`);
  const definitions=LEGACY_PERSON_CUSTOM_FIELDS.map(field=>{
    const row=byCode.get(field.code),legacyDefinitionId=stableId(row.ID,field.code),legacyDatatype=validateDatatype(row.datatype,field),legacySortOrder=stableInteger(row.myorder,field.code),label=text(row.description)??field.code,group=text(row.groupname)??"玉舟扩展档案（未分组）";
    const source=Object.fromEntries(LEGACY_DEFINITION_SOURCE_COLUMNS.map(column=>[column,row[column]])),legacyLogicCoverage=logicCoverage(row),legacyRuleClassification=legacyLogicCoverage.presentCount?"review_required":"inert",logicByColumn=new Map(legacyLogicCoverage.columns.map(column=>[column.column,column]));
    return {
      ...field,
      baseClassification:field.valueType,
      label,
      labelFallbackApplied:!text(row.description),
      group,
      groupFallbackApplied:!text(row.groupname),
      legacyGroupId:isSourceNull(row.groupid)?null:String(row.groupid),
      legacySortOrder,
      legacyNullable:null,
      legacyRuleClassification,
      legacyDefinitionId,
      legacyDatatype,
      legacyDescriptionDPresent:!logicByColumn.get("description_d").isSourceNull,
      legacyDescriptionDSha256:logicByColumn.get("description_d").sourceValueSha256,
      legacySqltextPresent:!logicByColumn.get("sqltext").isSourceNull,
      legacySqltextSha256:logicByColumn.get("sqltext").sourceValueSha256,
      legacyCrosssqlPresent:!logicByColumn.get("crosssql").isSourceNull,
      legacyCrosssqlSha256:logicByColumn.get("crosssql").sourceValueSha256,
      sourceIdentitySha256:sha(`dbo.defs\0${legacyDefinitionId}`),
      sourceRowSha256:sha(canonical(source)),
      legacyLogicCoverage
    };
  });
  const ordered=[...definitions].sort((left,right)=>(left.legacySortOrder??Number.MAX_SAFE_INTEGER)-(right.legacySortOrder??Number.MAX_SAFE_INTEGER)||compareStableId(left.legacyDefinitionId,right.legacyDefinitionId)||left.mappingOrdinal-right.mappingOrdinal),rankByCode=new Map(ordered.map((definition,sortOrder)=>[definition.code,sortOrder]));
  return definitions.map(definition=>({...definition,sortOrder:rankByCode.get(definition.code)}));
}

export function materializeLegacyEmployeeCustomFields(row,definitions){
  if(!row||typeof row!=="object"||Array.isArray(row)||!Array.isArray(definitions)||definitions.length!==LEGACY_PERSON_CUSTOM_FIELDS.length)throw new Error("LEGACY_CUSTOM_FIELD_INPUT_INVALID");
  return definitions.map(definition=>{
    const sourceValue=row[definition.code];
    let value=null,valid=true;
    if(!isSourceNull(sourceValue)){
      value=definition.valueType==="date"?canonicalDate(sourceValue):definition.valueType==="numeric"?canonicalNumeric(sourceValue):text(sourceValue);
      valid=value!==null;
    }
    return {
      code:definition.code,
      label:definition.label,
      valueType:definition.valueType,
      group:definition.group,
      sortOrder:definition.sortOrder,
      legacyDefinitionId:definition.legacyDefinitionId,
      legacyDatatype:definition.legacyDatatype,
      definitionSourceIdentitySha256:definition.sourceIdentitySha256,
      definitionSourceRowSha256:definition.sourceRowSha256,
      value,
      rawValue:valid?null:text(sourceValue),
      isSourceNull:isSourceNull(sourceValue),
      valid
    };
  });
}

export function legacyGetdef(definitions,code){
  const normalized=text(code);
  if(!normalized)return normalized;
  return definitions.find(definition=>definition.code.toLowerCase()===normalized.toLowerCase())?.label||normalized;
}
