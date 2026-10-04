import { createHash } from "node:crypto";
import { projectLegacyT0ExtendedFields, parseLegacyPositionHeadcount } from "./materialize-production-t0-decision-candidates.mjs";
const sha=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(",")}]`:`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
const fail=code=>{throw new Error(code);};
const text=v=>typeof v==="string"?v.trim():"";
const identity=(table,key)=>`sha256:${sha(`${table}\0${key}`)}`;
const camel=column=>column.replace(/_([a-z])/gu,(_,letter)=>letter.toUpperCase());
export function projectYuzhouOrganizationRecords(organizations=[],positions=[]) {
  if(!Array.isArray(organizations)||!Array.isArray(positions))fail("YUZHOU_ORG_SOURCE_INVALID");
  const index=(rows,table)=>{
    const result=new Map();
    for(const row of rows) {
      if(!row||row.sourceTable!==table||!text(row.sourceKey)||!row.source||row.sourceIdentitySha256!==sha(`${table}\0${row.sourceKey}`)||row.sourceRowSha256!==sha(canonical(row.source)))fail("YUZHOU_ORG_SOURCE_INVALID");
      const required=table==="dbo.departmentcode"?["legacyCode","orgName","rating","legacyManagerValue","plannedHeadcount","contactPhone","sortOrder","legacySourceId"]:["legacyCode","positionName","departmentCode","parentPositionCode","legacyUptoCode","jobgrade","salarygrade","authority","qualification","responsibilities","headcountLimit","positionManual","rating","sortOrder","legacySourceId"];
      if(required.some(field=>!Object.hasOwn(row.source,field)) || text(row.source.legacyCode)!==text(row.sourceKey))fail("YUZHOU_ORG_SOURCE_SCHEMA_INVALID");
      const code=text(row.sourceKey);if(result.has(code))fail("YUZHOU_ORG_SOURCE_AMBIGUOUS");result.set(code,row);
    }
    return result;
  };
  const orgs=index(organizations,"dbo.departmentcode"),jobs=index(positions,"dbo.job");
  const orgKey=code=>identity("dbo.departmentcode",orgs.get(code)?.sourceKey??code);
  const positionKey=code=>identity("dbo.job",jobs.get(code)?.sourceKey??code);
  const adapted=[];
  for(const [domain,rows,table] of [["organization",organizations,"sys_org"],["position",positions,"hr_position"]]) for(const row of rows) {
    const s=row.source,code=text(row.sourceKey),extended=projectLegacyT0ExtendedFields(table,s);
    if(!extended.valid)fail("YUZHOU_ORG_FIELD_INVALID");
    const fields=Object.fromEntries(Object.entries(extended.fields).map(([key,value])=>[camel(key),value]));
    if(domain==="organization") {
      const order=parseLegacyPositionHeadcount(s.sortOrder),rating=parseLegacyPositionHeadcount(s.rating);
      if(!order.valid||!rating.valid||!text(s.orgName))fail("YUZHOU_ORG_FIELD_INVALID");
      const parent=[...orgs.keys()].filter(k=>k.length<code.length&&code.startsWith(k)).sort((a,b)=>b.length-a.length)[0];
      Object.assign(fields,{orgCode:code,orgName:text(s.orgName),orgType:(rating.value??1)<=1?"company":"department",sortOrder:order.value??0,status:"enabled",remark:null,parentSourceKey:parent?orgKey(parent):null});
    } else {
      const headcount=parseLegacyPositionHeadcount(s.headcountLimit);
      if(!headcount.valid||!text(s.positionName))fail("YUZHOU_ORG_FIELD_INVALID");
      // Never repeat the historical unknown-department root fallback or name match.
      if(!text(s.departmentCode))fail("YUZHOU_POSITION_ORG_UNRESOLVED");
      Object.assign(fields,{positionCode:code,positionName:text(s.positionName),jobFamily:text(s.jobgrade)||null,jobLevel:text(s.salarygrade)||null,headcountLimit:headcount.value,status:"enabled",remark:null,orgSourceKey:orgKey(text(s.departmentCode)),parentPositionSourceKey:text(s.parentPositionCode)?positionKey(text(s.parentPositionCode)):null});
    }
    const item={domain,sourceTable:row.sourceTable,sourceKey:`sha256:${row.sourceIdentitySha256}`,fields};
    item.rowDigest=sha(canonical({...item,sourceUpdatedAt:null}));
    const carried=new Set(domain==="organization"?["orgName","rating","sortOrder","contactPhone","legacyManagerValue","legacySourceId","plannedHeadcount"]:["positionName","departmentCode","parentPositionCode","jobgrade","salarygrade","headcountLimit","rating","sortOrder","authority","legacyUptoCode","positionManual","qualification","responsibilities","legacySourceId"]);
    adapted.push({item,declaration:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,disposition:"api_eligible"},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,rawSource:row.source,fieldCoverage:Object.keys(s).sort().map(field=>({field,valuePresent:s[field]!=null,disposition:carried.has(field)?"carried":"pending_semantic_binding"}))}});
  }
  return {adapted,orgKey,positionKey};
}

export function orderHierarchyItems(items) {
  const byKey=new Map(),visiting=new Set(),done=new Set(),ordered=[];
  for(const item of items) { const key=`${item.domain}:${item.sourceKey}`;if(byKey.has(key))fail("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE");byKey.set(key,item); }
  function visit(item) {
    const key=`${item.domain}:${item.sourceKey}`;if(done.has(key))return;if(visiting.has(key))fail("YUZHOU_SOURCE_DEPENDENCY_CYCLE");visiting.add(key);
    for(const [field,domain] of [["parentSourceKey","organization"],["orgSourceKey","organization"],["parentPositionSourceKey","position"],["positionSourceKey","position"],["employeeSourceKey","employee"]]) {const dep=byKey.get(`${domain}:${item.fields[field]}`);if(dep)visit(dep);}
    visiting.delete(key);done.add(key);ordered.push(item);
  }
  items.forEach(visit);return ordered;
}
