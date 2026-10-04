export function departureWorkflowHref(employeeId:string){
 return `/hr/lifecycle?employee_id=${encodeURIComponent(employeeId)}#departure-clearance` as const;
}
export {parseEmployeeFilter as parseDepartureEmployeeFilter} from "../employees/employee-navigation";
