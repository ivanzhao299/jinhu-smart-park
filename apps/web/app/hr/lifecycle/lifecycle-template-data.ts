import type {HrLifecycleTemplate,HrLifecycleTemplateDetail,HrLifecycleTemplateItem} from "../../../lib/hr-api";
const invalid=():never=>{throw new Error("清单模板数据无效，请刷新重试。");};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:invalid();
const text=(value:unknown,max=160):string=>typeof value==="string"&&value.trim()&&value.length<=max?value:invalid();
function summary(value:unknown):HrLifecycleTemplate{
 const row=record(value);
 if(row.type!=="onboarding"&&row.type!=="offboarding")return invalid();
 if(typeof row.versionNo!=="number"||!Number.isSafeInteger(row.versionNo)||row.versionNo<1||typeof row.itemCount!=="number"||!Number.isInteger(row.itemCount)||row.itemCount<1||row.itemCount>50)return invalid();
 return {id:text(row.id),code:text(row.code,64),name:text(row.name),type:row.type,versionId:text(row.versionId),versionNo:row.versionNo,itemCount:row.itemCount};
}
export function lifecycleTemplateSummaries(value:unknown):HrLifecycleTemplate[]{
 if(!Array.isArray(value))return invalid();
 const rows=value.map(summary);if(new Set(rows.map(row=>row.id)).size!==rows.length)return invalid();return rows;
}
export function lifecycleTemplateDetail(value:unknown,requestedId:string):HrLifecycleTemplateDetail{
 const row=record(value),base=summary(row);
 if(base.id!==requestedId||!Array.isArray(row.items)||row.items.length!==base.itemCount)return invalid();
 const codes=new Set<string>(),items:HrLifecycleTemplateItem[]=row.items.map(value=>{
  const item=record(value),code=text(item.code,64),name=text(item.name),category=text(item.category,32),due=item.defaultDueDays;
  if(codes.has(code.trim())||typeof item.required!=="boolean"||(due!=null&&(typeof due!=="number"||!Number.isInteger(due)||due<-365||due>365)))return invalid();
  codes.add(code.trim());return {code,name,category,required:item.required,defaultDueDays:due==null?null:due as number};
 });
 return {...base,items};
}
