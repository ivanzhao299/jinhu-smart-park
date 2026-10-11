import {apiRequest} from "./api-client";
import type {HrLeaveCancellationRecord,HrLeaveCancellationSource,HrLeaveCancellationHistory,HrLeaveCancellationCreate,HrLeaveCancellationUpdate,HrLeaveCancellationAction,HrLeaveCancellationStatus} from "@jinhu/shared";
type Page<T>={items:T[];total:number;page:number;page_size:number};
const base="/hr/attendance/leave-cancellations";
export const leaveCancellationApi={
 async list(page:number,status:HrLeaveCancellationStatus|"",token:string|undefined,signal?:AbortSignal){return (await apiRequest<Page<HrLeaveCancellationRecord>>(`${base}?${new URLSearchParams({page:String(page),page_size:"20",...(status?{status}:{})})}`,{token,signal})).data;},
 async sources(page:number,keyword:string,token:string|undefined,signal?:AbortSignal){return (await apiRequest<Page<HrLeaveCancellationSource>>(`${base}/sources?${new URLSearchParams({page:String(page),page_size:"20",...(keyword?{keyword}:{})})}`,{token,signal})).data;},
 async history(id:string,page:number,token:string|undefined,signal?:AbortSignal){return (await apiRequest<Page<HrLeaveCancellationHistory>>(`${base}/${encodeURIComponent(id)}/history?${new URLSearchParams({page:String(page),page_size:"20"})}`,{token,signal})).data;},
 async create(body:HrLeaveCancellationCreate,token:string|undefined,key:string){return (await apiRequest<HrLeaveCancellationRecord>(base,{method:"POST",body,token,idempotencyKey:key})).data;},
 async update(id:string,body:HrLeaveCancellationUpdate,token:string|undefined,key:string){return (await apiRequest<HrLeaveCancellationRecord>(`${base}/${encodeURIComponent(id)}`,{method:"PUT",body,token,idempotencyKey:key})).data;},
 async act(id:string,body:HrLeaveCancellationAction,token:string|undefined,key:string){return (await apiRequest<HrLeaveCancellationRecord>(`${base}/${encodeURIComponent(id)}/actions`,{method:"POST",body,token,idempotencyKey:key})).data;}
};
