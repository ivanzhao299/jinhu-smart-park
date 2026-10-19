export function jobChangeWorkflowHref(applicationId:string){
 return `/hr/lifecycle?job_change_id=${encodeURIComponent(applicationId)}#job-change-applications` as const;
}
export function parseJobChangeFilter(value:string|string[]|undefined){
 if(value===undefined)return {applicationId:undefined,valid:true};
 if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return {applicationId:undefined,valid:false};
 return {applicationId:value.toLowerCase(),valid:true};
}
