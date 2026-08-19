import { apiRequest } from "./api-client";
export type ApartmentSummary={rooms:number;beds:number;occupied:number;available:number;pending_applications:number;pending_checkouts:number};
export type ApartmentRecord=Record<string,unknown>&{id:string};
export type ApartmentCandidatePage={items:ApartmentRecord[];total:number;page:number;page_size:number;facets:{buildings:Array<{id:string;name:string}>;floors:Array<{id:string;building_id:string;name:string}>}};
export type ApartmentHandoverMeter={id:string;meter_code:string;meter_name:string;meter_type:"WATER"|"ELECTRIC";unit:string;current_reading:string;last_reading_at:string|null};
async function unwrap<T>(promise:Promise<{data:T}>){return (await promise).data;}
export const apartmentsApi={
 summary:(token?:string)=>unwrap(apiRequest<ApartmentSummary>("/apartments/summary",{token})),
 rooms:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/rooms",{token})),
 unitCandidates:(query:URLSearchParams,token?:string)=>unwrap(apiRequest<ApartmentCandidatePage>(`/apartments/unit-candidates?${query.toString()}`,{token})),
 handoverMeters:(stayId:string,token?:string)=>unwrap(apiRequest<ApartmentHandoverMeter[]>(`/apartments/stays/${stayId}/handover-meters`,{token})),
 availableBeds:(start:string,end:string|undefined,token?:string)=>unwrap(apiRequest<ApartmentRecord[]>(`/apartments/available-beds?start=${encodeURIComponent(start)}${end?`&end=${encodeURIComponent(end)}`:""}`,{token})),
 applications:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/applications",{token})),
 stays:(token?:string,status?:string)=>unwrap(apiRequest<ApartmentRecord[]>(`/apartments/stays${status?`?status=${status}`:""}`,{token})),
 documents:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/documents",{token})),
 templates:(token?:string)=>unwrap(apiRequest<ApartmentRecord[]>("/apartments/templates",{token})),
 settings:(token?:string)=>unwrap(apiRequest<{default_application_reason:string}>("/apartments/settings",{token})),
 renderDocument:(id:string,token?:string)=>unwrap(apiRequest<{filename:string;html:string}>(`/apartments/documents/${id}/render`,{token})),
 mutate:<T>(path:string,body:object|undefined,token?:string,method="POST")=>unwrap(apiRequest<T>(path,{method,token,idempotencyKey:crypto.randomUUID(),body}))
};
