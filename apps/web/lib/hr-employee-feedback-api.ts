import {HR_EMPLOYEE_FEEDBACK_KINDS as kinds,HR_EMPLOYEE_FEEDBACK_STATUSES as statuses,type HrEmployeeFeedbackContext as Context,type HrEmployeeFeedbackDetail as Detail,type HrEmployeeFeedbackHistoryItem as History,type HrEmployeeFeedbackItem as Item,type HrEmployeeFeedbackPage as Page,type HrEmployeeFeedbackReceipt as Receipt,type HrEmployeeFeedbackView as View} from '@jinhu/shared';
import {apiRequest} from './api-client';
const base='/hr/employee-feedback';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const status=(v:unknown)=>statuses.some(s=>s===v);
const kind=(v:unknown)=>kinds.some(s=>s===v);
const employee=(v:unknown)=>obj(v)&&uuid(v.id)&&typeof v.employeeCode==='string'&&typeof v.name==='string';
const item=(v:unknown)=>obj(v)&&uuid(v.id)&&kind(v.kind)&&status(v.status)&&typeof v.title==='string'&&Number.isInteger(v.version)&&Number(v.version)>0&&employee(v.employee)&&typeof v.createdAt==='string'&&typeof v.updatedAt==='string';
const detail=(v:unknown)=>item(v)&&obj(v)&&typeof v.content==='string'&&(v.reply===null||typeof v.reply==='string')&&obj(v.capabilities)&&['canEdit','canSubmit','canCancel','canWithdraw','canReply'].every(k=>typeof (v.capabilities as Record<string,unknown>)[k]==='boolean');
const history=(v:unknown)=>obj(v)&&uuid(v.id)&&Number.isInteger(v.version)&&Number(v.version)>0&&['create','edit','submit','cancel','withdraw','reply'].includes(String(v.action))&&(v.fromStatus===null||status(v.fromStatus))&&status(v.toStatus)&&typeof v.reason==='string'&&(v.actorName===null||typeof v.actorName==='string')&&typeof v.createdAt==='string'&&obj(v.snapshot)&&kind(v.snapshot.kind)&&status(v.snapshot.status)&&typeof v.snapshot.title==='string'&&typeof v.snapshot.content==='string'&&(v.snapshot.reply===null||typeof v.snapshot.reply==='string');
const page=(v:unknown,check:(v:unknown)=>boolean)=>obj(v)&&Array.isArray(v.items)&&v.items.every(check)&&Number.isInteger(v.total)&&Number(v.total)>=0&&Number.isInteger(v.page)&&Number(v.page)>0&&Number.isInteger(v.pageSize)&&Number(v.pageSize)>0&&Number(v.pageSize)<=100;
async function read<T>(path:string,token:string,check:(v:unknown)=>boolean,signal?:AbortSignal):Promise<T>{const r=await apiRequest<unknown>(base+path,{token,signal});if(!check(r.data))throw new Error('建议投诉响应格式异常，请重试读取');return r.data as T;}
export const employeeFeedbackApi={
 context:(token:string,signal?:AbortSignal)=>read<Context>('/context',token,v=>obj(v)&&typeof v.canSelf==='boolean'&&typeof v.canHr==='boolean'&&(v.employee===null||employee(v.employee)),signal),
 list:(token:string,view:View,p:number,kindFilter='',statusFilter='',signal?:AbortSignal)=>read<Page<Item>>('?'+new URLSearchParams({view,page:String(p),pageSize:'10',...(kindFilter?{kind:kindFilter}:{}),...(statusFilter?{status:statusFilter}:{})}),token,v=>page(v,item),signal),
 detail:(token:string,id:string,view:View,signal?:AbortSignal)=>read<Detail>(`/${id}?view=${view}`,token,detail,signal),
 history:(token:string,id:string,view:View,p:number,signal?:AbortSignal)=>read<Page<History>>(`/${id}/history?view=${view}&page=${p}&pageSize=10`,token,v=>page(v,history),signal),
 write:async(token:string,path:string,method:'POST'|'PATCH',body:object,key:string):Promise<Receipt>=>{const r=await apiRequest<unknown>(base+path,{token,method,body,idempotencyKey:key}),v=r.data;if(!obj(v)||Object.keys(v).sort().join(',')!=='actionId,id,status,version'||!uuid(v.id)||!uuid(v.actionId)||!status(v.status)||!Number.isInteger(v.version)||Number(v.version)<1)throw new Error('写入结果尚未确认，请使用原请求重试');return v as unknown as Receipt;}
};
