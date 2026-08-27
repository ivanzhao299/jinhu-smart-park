import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export class LegacyCoreMappingError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name="LegacyCoreMappingError"; this.code=code; }
}
const fail=(code,detail)=>{throw new LegacyCoreMappingError(code,detail)};
const plain=value=>value&&typeof value==="object"&&!Array.isArray(value);
const sha256=value=>createHash("sha256").update(value).digest("hex");
const EXPECTED_TABLES=["compact","compact_c","compacttypecode","family","jobstatecode","knowhow","person","person_user","person_user_item","readjust","readjustitem","ticket"];
const exactSymbol=(source,symbol)=>new RegExp(`(^|[^A-Za-z0-9_])${symbol.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^A-Za-z0-9_]|$)`).test(source);

function repositoryFile(root, reference, label){
  if(typeof reference!=="string"||!reference||isAbsolute(reference)||reference.split(/[\\/]/).includes(".."))fail("TARGET_REFERENCE_INVALID",label);
  const path=resolve(root,reference),realRoot=realpathSync(root);
  if(!path.startsWith(`${realRoot}${sep}`))fail("TARGET_REFERENCE_INVALID",label);
  try{if(!statSync(path).isFile()||!realpathSync(path).startsWith(`${realRoot}${sep}`))fail("TARGET_REFERENCE_INVALID",label);}catch(error){if(error instanceof LegacyCoreMappingError)throw error;fail("TARGET_FILE_MISSING",`${label}:${reference}`)}
  return path;
}

function validateEvidence(root,evidence,label){
  if(!Array.isArray(evidence)||evidence.length===0)fail("TARGET_EVIDENCE_MISSING",label);
  let test=false;
  for(const [index,item] of evidence.entries()){
    if(!plain(item)||!["route","api","entity","permission","test"].includes(item.kind)||typeof item.symbol!=="string"||!item.symbol)fail("TARGET_EVIDENCE_INVALID",`${label}[${index}]`);
    const source=readFileSync(repositoryFile(root,item.file,`${label}[${index}]`),"utf8");
    if(!source.includes(item.symbol))fail("TARGET_SYMBOL_MISSING",`${item.file}#${item.symbol}`);
    if(item.kind==="test")test=true;
  }
  if(!test)fail("TARGET_TEST_EVIDENCE_MISSING",label);
  return evidence.map(item=>({item,source:readFileSync(repositoryFile(root,item.file,label),"utf8")}));
}

function inventoryIndex(inventory){
  if(!plain(inventory)||inventory.inventoryKind!=="yuzhou_hr_legacy_structural_atomic_inventory")fail("INVENTORY_IDENTITY_INVALID","inventoryKind");
  const tables=new Map();
  for(const table of inventory.tables??[]){
    if(tables.has(table.name))fail("INVENTORY_TABLE_DUPLICATE",table.name);
    const columns=new Map();
    for(const column of table.columns??[]){if(columns.has(column.name))fail("INVENTORY_COLUMN_DUPLICATE",`${table.name}.${column.name}`);columns.set(column.name,column)}
    tables.set(table.name,{...table,columns});
  }
  return tables;
}

export function verifyLegacyCoreDomainMapping(inventory,mapping,{root=process.cwd()}={}){
  if(!plain(mapping)||mapping.formatVersion!==1||mapping.mappingKind!=="yuzhou_hr_legacy_core_domain_reviewed_mapping")fail("MAPPING_IDENTITY_INVALID","mapping contract");
  const serializedMapping=JSON.stringify(mapping);
  if(/(?:\/Users\/|Downloads\/|file:\/\/|(?:postgres(?:ql)?|sqlserver):\/\/|password\s*=|token\s*=|BEGIN [A-Z ]*PRIVATE KEY)/i.test(serializedMapping))fail("MAPPING_SENSITIVE_CONTENT_FORBIDDEN","mapping must contain repository-relative structural evidence only");
  if(mapping.inventoryContract?.kind!==inventory.inventoryKind||mapping.inventoryContract?.generatorVersion!==inventory.generatorVersion)fail("INVENTORY_CONTRACT_MISMATCH","kind or generator version");
  const inventoryHash=sha256(`${JSON.stringify(inventory)}\n`);
  if(!/^[a-f0-9]{64}$/.test(mapping.inventoryContract?.inventoryHash??"")||mapping.inventoryContract.inventoryHash!==inventoryHash)fail("INVENTORY_HASH_MISMATCH",inventoryHash);
  if(mapping.inventoryContract?.selectedTables!==12||mapping.inventoryContract?.selectedFields!==260)fail("INVENTORY_SELECTION_CONTRACT_INVALID","expected 12 tables and 260 fields");
  const allowedReasons=new Set(mapping.allowedGapReasons??[]),tables=inventoryIndex(inventory),domains=new Set(),selectedTables=new Set(),rows=[];
  for(const domain of mapping.domains??[]){
    if(!["employee_profile","employment_change","contract"].includes(domain.domain)||domains.has(domain.domain))fail("DOMAIN_INVALID",String(domain.domain));
    domains.add(domain.domain);
    if(typeof domain.route!=="string"||!domain.route.startsWith("/hr/"))fail("DOMAIN_ROUTE_INVALID",domain.domain);
    const domainEvidence=validateEvidence(root,domain.targetEvidence,`${domain.domain}.targetEvidence`);
    if(!allowedReasons.has(domain.defaultGapReason))fail("GAP_REASON_INVALID",`${domain.domain}.${domain.defaultGapReason}`);
    const explicit=new Map(Object.entries(domain.columnMappings??{}));
    for(const tableName of domain.tables??[]){
      if(selectedTables.has(tableName))fail("TABLE_SELECTED_TWICE",tableName); selectedTables.add(tableName);
      const table=tables.get(tableName); if(!table)fail("SOURCE_TABLE_MISSING",tableName);
      for(const column of table.columns.values()){
        const locator=`${tableName}.${column.name}`,target=explicit.get(locator);
        if(target&&!domainEvidence.some(({item,source})=>item.kind!=="test"&&exactSymbol(source,target)))fail("TARGET_SYMBOL_MISSING",`${locator}#${target}`);
        rows.push({domain:domain.domain,sourceTable:tableName,sourceColumn:column.name,status:target?"mapped":"gap",target:target??null,reasonCode:target?null:domain.defaultGapReason});
        explicit.delete(locator);
      }
    }
    if(explicit.size)fail("SOURCE_COLUMN_MISSING",`${domain.domain}:${[...explicit.keys()].join(",")}`);
  }
  if(domains.size!==3)fail("DOMAIN_SET_INCOMPLETE",[...domains].join(","));
  if(JSON.stringify([...selectedTables].sort())!==JSON.stringify(EXPECTED_TABLES))fail("TABLE_SET_INCOMPLETE",[...selectedTables].sort().join(","));
  if(selectedTables.size!==mapping.inventoryContract.selectedTables||rows.length!==mapping.inventoryContract.selectedFields)fail("INVENTORY_SELECTION_COUNT_MISMATCH",`tables=${selectedTables.size},fields=${rows.length}`);
  const residue=mapping.residueArchive;
  if(!plain(residue)||residue.version!=="yuzhou-core-residue-v1"||residue.productionImport!=="HOLD")fail("RESIDUE_ARCHIVE_CONTRACT_INVALID","identity or production gate");
  validateEvidence(root,residue.targetEvidence,"residueArchive.targetEvidence");
  const archiveTables=new Map(Object.entries(residue.tableDomains??{}));
  if(JSON.stringify([...archiveTables.keys()].sort())!==JSON.stringify(EXPECTED_TABLES))fail("RESIDUE_ARCHIVE_TABLE_SET_INCOMPLETE",[...archiveTables.keys()].sort().join(","));
  const allowedArchiveDomains=new Set(["employee_profile_raw","family","skill","credential","employment_change_raw","contract_raw"]);
  for(const [table,domain] of archiveTables)if(!allowedArchiveDomains.has(domain))fail("RESIDUE_ARCHIVE_DOMAIN_INVALID",`${table}:${domain}`);
  const securityExclusions=new Map();
  for(const item of residue.securityExclusions??[]){
    if(!plain(item)||!["LEGACY_CREDENTIAL_NOT_MIGRATED","BINARY_FILE_EVIDENCE_ONLY"].includes(item.reasonCode)||securityExclusions.has(item.locator))fail("RESIDUE_SECURITY_EXCLUSION_INVALID",String(item?.locator));
    const row=rows.find(candidate=>`${candidate.sourceTable}.${candidate.sourceColumn}`===item.locator);
    if(!row||row.status!=="gap")fail("RESIDUE_SECURITY_EXCLUSION_INVALID",item.locator);
    securityExclusions.set(item.locator,item.reasonCode);
  }
  if(JSON.stringify([...securityExclusions.keys()].sort())!==JSON.stringify(["person.password","person.photo"]))fail("RESIDUE_SECURITY_EXCLUSION_SET_INVALID",[...securityExclusions.keys()].sort().join(","));
  const fieldCoverage=rows.map(row=>{
    const locator=`${row.sourceTable}.${row.sourceColumn}`;
    if(row.status==="mapped")return{...row,compatibilityDisposition:"mapped",archiveDomain:null,securityReason:null};
    const securityReason=securityExclusions.get(locator)??null;
    if(securityReason)return{...row,compatibilityDisposition:"security_excluded",archiveDomain:null,securityReason};
    const archiveDomain=archiveTables.get(row.sourceTable);
    if(!archiveDomain)fail("RESIDUE_FIELD_UNCOVERED",locator);
    return{...row,compatibilityDisposition:"raw_archived",archiveDomain,securityReason:null};
  });
  if(fieldCoverage.length!==260||fieldCoverage.some(row=>!["mapped","raw_archived","security_excluded"].includes(row.compatibilityDisposition)))fail("RESIDUE_FIELD_COVERAGE_INCOMPLETE","every selected field needs a disposition");
  const rules=[];
  for(const rule of mapping.businessRules??[]){
    if(!plain(rule)||!domains.has(rule.domain)||!["mapped","tested","gap"].includes(rule.status))fail("BUSINESS_RULE_INVALID",String(rule?.id));
    if(!Array.isArray(rule.sourceLocators)||rule.sourceLocators.length===0)fail("BUSINESS_RULE_SOURCE_MISSING",rule.id);
    for(const locator of rule.sourceLocators){const [tableName,columnName,...rest]=String(locator).split(".");if(rest.length||!tables.get(tableName)?.columns.has(columnName))fail("BUSINESS_RULE_SOURCE_MISSING",`${rule.id}:${locator}`)}
    if(rule.status==="gap"){
      if(!allowedReasons.has(rule.reasonCode)||rule.targetEvidence?.length)fail("BUSINESS_RULE_GAP_INVALID",rule.id);
    }else{
      if(rule.reasonCode!==null)fail("BUSINESS_RULE_REASON_INVALID",rule.id);
      const evidence=validateEvidence(root,rule.targetEvidence,`${rule.id}.targetEvidence`);
      if(rule.status==="tested"&&!evidence.some(({item,source})=>item.kind==="test"&&source.includes(rule.id)))fail("BUSINESS_RULE_TEST_ASSERTION_MISSING",rule.id);
    }
    rules.push({id:rule.id,domain:rule.domain,status:rule.status,reasonCode:rule.reasonCode});
  }
  const expectedRules=["employee-code-non-reuse","jobstate-mapping","employment-event-number-jz-dz-lz-fz","employment-before-after-snapshot","contract-renewal-chain","contract-three-agreements","contract-expiry-reminder"];
  if(JSON.stringify(rules.map(rule=>rule.id).sort())!==JSON.stringify(expectedRules.sort()))fail("BUSINESS_RULE_SET_INCOMPLETE","required core rules missing");
  const byDomain=Object.fromEntries([...domains].sort().map(domain=>{const fields=rows.filter(row=>row.domain===domain),domainRules=rules.filter(rule=>rule.domain===domain);return[domain,{fields:fields.length,mappedFields:fields.filter(row=>row.status==="mapped").length,gapFields:fields.filter(row=>row.status==="gap").length,rules:domainRules.length,mappedOrTestedRules:domainRules.filter(rule=>rule.status!=="gap").length,gapRules:domainRules.filter(rule=>rule.status==="gap").length}]}));
  return {ok:true,mappingVersion:mapping.mappingVersion,selectedTables:selectedTables.size,fields:rows.length,mappedFields:rows.filter(row=>row.status==="mapped").length,gapFields:rows.filter(row=>row.status==="gap").length,rawArchivedFields:fieldCoverage.filter(row=>row.compatibilityDisposition==="raw_archived").length,securityExcludedFields:fieldCoverage.filter(row=>row.compatibilityDisposition==="security_excluded").length,uncoveredFields:fieldCoverage.filter(row=>!row.compatibilityDisposition).length,rules:rules.length,mappedOrTestedRules:rules.filter(rule=>rule.status!=="gap").length,gapRules:rules.filter(rule=>rule.status==="gap").length,byDomain,fieldLedger:fieldCoverage,ruleLedger:rules};
}
