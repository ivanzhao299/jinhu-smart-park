import {apiRequest} from "./api-client";
import type {PaginatedResult} from "@jinhu/shared";

export interface HrEmployeeRestDay {id:string;employeeId:string;workDate:string;isRest:boolean;version:number;updatedAt:string;}
export interface HrEmployeeRestDayHistory {id:string;version:number;isRest:boolean;reason:string;occurredAt:string;actorName:string;}
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const text=(value:unknown):value is string=>typeof value==="string"&&value.length>0;
const positive=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>0;
const date=(value:unknown):value is string=>typeof value==="string"&&/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const timestamp=(value:unknown)=>text(value)&&Number.isFinite(Date.parse(value));
export function decodeEmployeeRestDay(value:unknown):HrEmployeeRestDay|null{if(value===null)return null;if(!object(value)||!text(value.id)||!text(value.employeeId)||!date(value.workDate)||typeof value.isRest!=="boolean"||!positive(value.version)||!timestamp(value.updatedAt))throw new Error("员工休息日返回不完整，请重新读取。");return value as unknown as HrEmployeeRestDay;}
export function decodeEmployeeRestDayHistory(value:unknown):PaginatedResult<HrEmployeeRestDayHistory>{if(!object(value)||!Number.isSafeInteger(value.total)||Number(value.total)<0||!positive(value.page)||value.page_size!==20||!Array.isArray(value.items)||value.items.length>20||!value.items.every(item=>object(item)&&text(item.id)&&positive(item.version)&&typeof item.isRest==="boolean"&&text(item.reason)&&timestamp(item.occurredAt)&&text(item.actorName)))throw new Error("员工休息日历史返回不完整，请重新读取。");return value as unknown as PaginatedResult<HrEmployeeRestDayHistory>;}
const path=(employeeId:string,workDate:string)=>`/hr/attendance/employee-rest-days/${encodeURIComponent(employeeId)}/${encodeURIComponent(workDate)}`;
export const employeeRestDayApi={
 async get(employeeId:string,workDate:string,token:string|undefined,signal?:AbortSignal){return decodeEmployeeRestDay((await apiRequest<unknown>(path(employeeId,workDate),{token,signal})).data);},
 async put(employeeId:string,workDate:string,body:{expectedVersion:number;isRest:boolean;reason:string},token:string|undefined,idempotencyKey:string){return decodeEmployeeRestDay((await apiRequest<unknown>(path(employeeId,workDate),{method:"PUT",body,token,idempotencyKey})).data);},
 async history(employeeId:string,workDate:string,page:number,token:string|undefined,signal?:AbortSignal){return decodeEmployeeRestDayHistory((await apiRequest<unknown>(`${path(employeeId,workDate)}/history?${new URLSearchParams({page:String(page),page_size:"20"})}`,{token,signal})).data);},
};
