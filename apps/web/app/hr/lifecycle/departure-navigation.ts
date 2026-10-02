export function departureWorkflowHref(employeeId:string){
 return `/hr/lifecycle?employee_id=${encodeURIComponent(employeeId)}#departure-clearance` as const;
}
export function parseDepartureEmployeeFilter(value:string|string[]|undefined){
 if(value===undefined)return {employeeId:undefined,valid:true};
 if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return {employeeId:undefined,valid:false};
 return {employeeId:value,valid:true};
}
