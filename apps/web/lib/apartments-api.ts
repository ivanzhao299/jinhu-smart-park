import { apiRequest } from "./api-client";
export type ApartmentSummary={rooms:number;beds:number;occupied:number;available:number;pending_applications:number;pending_checkouts:number};
export type ApartmentRecord=Record<string,unknown>&{id:string};
async function unwrap<T>(promise:Promise<{data:T}>){return (await promise).data;}
export const apartmentsApi={
 summary:(token?:string)=>unwrap(apiRequest<ApartmentSummary>("/apartments/summary",{token})),
 rooms:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/rooms",{token})),
 unitCandidates:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/unit-candidates",{token})),
 availableBeds:(start:string,end:string|undefined,token?:string)=>unwrap(apiRequest<ApartmentRecord[]>(`/apartments/available-beds?start=${encodeURIComponent(start)}${end?`&end=${encodeURIComponent(end)}`:""}`,{token})),
 applications:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/applications",{token})),
 stays:(token?:string,status?:string)=>unwrap(apiRequest<ApartmentRecord[]>(`/apartments/stays${status?`?status=${status}`:""}`,{token})),
 documents:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/documents",{token})),
 mutate:<T>(path:string,body:object|undefined,token?:string,method="POST")=>unwrap(apiRequest<T>(path,{method,token,idempotencyKey:crypto.randomUUID(),body}))
};
