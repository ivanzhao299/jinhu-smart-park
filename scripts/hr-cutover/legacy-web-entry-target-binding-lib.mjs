import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export class LegacyWebEntryBindingError extends Error { constructor(code, detail) { super(`${code}: ${detail}`); this.name="LegacyWebEntryBindingError"; this.code=code; } }
const fail=(code,detail)=>{throw new LegacyWebEntryBindingError(code,detail)};
const object=value=>value&&typeof value==="object"&&!Array.isArray(value);
const exactKeys=(value,keys,label)=>{if(!object(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...keys].sort()))fail("BINDING_SHAPE_INVALID",label)};
const EXPECTED=new Map([["人员浏览","personlist.aspx"],["人员照片","photos.aspx"],["信息查询","personquery.aspx"],["人事异动查询","inoutquery.aspx"],["人事异动统计","inoutcount.aspx"],["用户列表","useradmin.aspx"],["修改密码","changepassword.aspx"],["合同到期查询","remindcompact.aspx"],["培训记录查询","trainquery.aspx"],["考核记录查询","assquery.aspx"],["奖惩记录查询","bonusquery.aspx"],["保险福利","insure.aspx"],["工资数据查询","salaryquery.aspx"],["考勤管理","timekeep.aspx"],["招聘管理","accept.aspx"]]);
const TARGETS=new Map([["人员浏览","/hr/employees"],["信息查询","/hr/employees"],["人事异动查询","/hr/lifecycle"],["人事异动统计","/hr/lifecycle"],["用户列表","/system/users"],["合同到期查询","/hr/contracts"],["培训记录查询","/hr/training"],["考核记录查询","/hr/performance"],["奖惩记录查询","/hr/rewards"],["保险福利","/hr/insurance"],["工资数据查询","/hr/payroll"],["考勤管理","/hr/attendance"],["招聘管理","/hr/recruitment"]]);
const GAPS=new Map([["人员照片","TARGET_DEDICATED_PHOTO_VIEW_NOT_IMPLEMENTED"],["修改密码","TARGET_SELF_SERVICE_PASSWORD_CHANGE_NOT_IMPLEMENTED"]]);
const WORKSTATION_PATH=/(?:\/Users\/|Downloads\/|file:\/\/)/;
const SECRET_MATERIAL=/(?:postgres(?:ql)?|sqlserver):\/\/|(?:pass(?:word)?|passwd|pwd|token|secret)\s*[=:]|BEGIN [A-Z ]*PRIVATE KEY/i;

function repositoryFile(root,reference,label){
  if(typeof reference!=="string"||!reference||isAbsolute(reference)||reference.split(/[\\/]/).includes(".."))fail("TARGET_REFERENCE_INVALID",label);
  const realRoot=realpathSync(root),path=resolve(realRoot,reference);
  if(!path.startsWith(`${realRoot}${sep}`))fail("TARGET_REFERENCE_INVALID",label);
  try{if(!statSync(path).isFile()||!realpathSync(path).startsWith(`${realRoot}${sep}`))fail("TARGET_REFERENCE_INVALID",label)}catch(error){if(error instanceof LegacyWebEntryBindingError)throw error;fail("TARGET_FILE_MISSING",`${label}:${reference}`)}
  return path;
}
function evidence(root,items,label){
  if(!Array.isArray(items)||items.length<4)fail("TARGET_EVIDENCE_INCOMPLETE",label);
  const kinds=new Set();
  for(const[index,item]of items.entries()){
    exactKeys(item,["kind","file","symbol"],`${label}[${index}]`);
    if(!["route","api","permission","test"].includes(item.kind)||typeof item.symbol!=="string"||!item.symbol)fail("TARGET_EVIDENCE_INVALID",`${label}[${index}]`);
    const source=readFileSync(repositoryFile(root,item.file,`${label}[${index}]`),"utf8");
    if(!source.includes(item.symbol))fail("TARGET_SYMBOL_MISSING",`${item.file}#${item.symbol}`);
    kinds.add(item.kind);
  }
  for(const kind of["route","api","permission","test"])if(!kinds.has(kind))fail("TARGET_EVIDENCE_KIND_MISSING",`${label}:${kind}`);
}

export function verifyLegacyWebEntryTargetBinding(manifest,{root=process.cwd()}={}){
  exactKeys(manifest,["formatVersion","bindingKind","bindingVersion","sourceEntryCount","allowedGapReasons","entries","summary","roleMatrixVerified","compatibilityScoreContribution","productionImport"],"manifest");
  if(manifest.formatVersion!==1||manifest.bindingKind!=="yuzhou_hr_legacy_web_entry_target_binding"||manifest.sourceEntryCount!==15)fail("BINDING_IDENTITY_INVALID","format, kind or source count");
  const serialized=JSON.stringify(manifest);
  if(WORKSTATION_PATH.test(serialized)||SECRET_MATERIAL.test(serialized)||/(?:^|[^0-9])(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}(?:[^0-9]|$)/.test(serialized))fail("BINDING_SENSITIVE_CONTENT_FORBIDDEN","repository-relative structural evidence only");
  const allowed=new Set(manifest.allowedGapReasons??[]);
  if(allowed.size!==GAPS.size||[...GAPS.values()].some(reason=>!allowed.has(reason)))fail("BINDING_GAP_REASON_SET_INVALID",String(allowed.size));
  if(!Array.isArray(manifest.entries)||manifest.entries.length!==EXPECTED.size)fail("BINDING_ENTRY_SET_INCOMPLETE",String(manifest.entries?.length));
  const seen=new Set();let mapped=0,gaps=0;
  for(const entry of manifest.entries){
    exactKeys(entry,["name","legacyPath","status","targetRoute","reasonCode","targetEvidence"],`entry.${String(entry?.name)}`);
    if(!EXPECTED.has(entry.name)||seen.has(entry.name)||EXPECTED.get(entry.name)!==entry.legacyPath)fail("BINDING_ENTRY_INVALID",String(entry.name));
    seen.add(entry.name);
    if(entry.status==="mapped"){
      if(entry.targetRoute!==TARGETS.get(entry.name)||entry.reasonCode!==null)fail("BINDING_MAPPED_ENTRY_INVALID",entry.name);
      evidence(root,entry.targetEvidence,`${entry.name}.targetEvidence`);mapped++;
    }else if(entry.status==="gap"){
      if(entry.targetRoute!==null||entry.reasonCode!==GAPS.get(entry.name)||!allowed.has(entry.reasonCode)||!Array.isArray(entry.targetEvidence)||entry.targetEvidence.length)fail("BINDING_GAP_ENTRY_INVALID",entry.name);
      gaps++;
    }else fail("BINDING_STATUS_INVALID",`${entry.name}:${entry.status}`);
  }
  if([...EXPECTED].some(([name])=>!seen.has(name)))fail("BINDING_ENTRY_SET_INCOMPLETE",`${seen.size}/${EXPECTED.size}`);
  exactKeys(manifest.summary,["mapped","gaps"],"summary");
  if(manifest.summary.mapped!==mapped||manifest.summary.gaps!==gaps||mapped+gaps!==15)fail("BINDING_SUMMARY_DRIFT",`${mapped}/${gaps}`);
  if(manifest.roleMatrixVerified!==false||manifest.compatibilityScoreContribution!==0)fail("BINDING_EVIDENCE_OVERRATED","source binding is not three-role runtime verification");
  if(manifest.productionImport!=="HOLD")fail("BINDING_PRODUCTION_IMPORT_NOT_HELD",String(manifest.productionImport));
  return{ok:true,entries:15,mapped,gaps,roleMatrixVerified:false,compatibilityScoreContribution:0,productionImport:"HOLD"};
}
export const LEGACY_WEB_EXPECTED_ENTRIES=Object.freeze(Object.fromEntries(EXPECTED));
