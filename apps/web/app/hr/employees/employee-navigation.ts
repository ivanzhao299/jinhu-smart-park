export function employeeDetailHref(employeeId:string){
 return `/hr/employees?employee_id=${encodeURIComponent(employeeId)}` as const;
}
export function parseEmployeeFilter(value:string|string[]|undefined){
 if(value===undefined)return {employeeId:undefined,valid:true};
 if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return {employeeId:undefined,valid:false};
 return {employeeId:value.toLowerCase(),valid:true};
}
