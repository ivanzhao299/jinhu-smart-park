import {apiRequest} from "./api-client";
import type {WorkCalendarDay,WorkCalendarHistory,WorkCalendarBody,WorkCalendarKind} from "@jinhu/shared";
export type {WorkCalendarDay,WorkCalendarHistory,WorkCalendarBody,WorkCalendarKind} from "@jinhu/shared";
export const workCalendarLabels:Record<WorkCalendarKind,string>={working:"工作日",rest:"休息日",statutory_holiday:"法定假日",other_holiday:"其他假日",unset:"未设置"};
export const workCalendarApi={
 async range(from:string,to:string,token:string|undefined,signal?:AbortSignal){return (await apiRequest<{from:string;to:string;items:WorkCalendarDay[]}>(`/hr/attendance/work-calendar?${new URLSearchParams({from,to})}`,{token,signal})).data;},
 async history(date:string,page:number,token:string|undefined,signal?:AbortSignal){return (await apiRequest<{items:WorkCalendarHistory[];total:number;page:number;page_size:number}>(`/hr/attendance/work-calendar/${date}/history?${new URLSearchParams({page:String(page),page_size:"20"})}`,{token,signal})).data;},
 async put(date:string,body:WorkCalendarBody,token:string|undefined,key:string){return (await apiRequest<WorkCalendarDay>(`/hr/attendance/work-calendar/${date}`,{method:"PUT",body,token,idempotencyKey:key})).data;}
};
