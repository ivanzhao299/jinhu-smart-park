"use client";

import type {HrEmployee} from "../../../lib/hr-api";
import {HrEmployeeSelection} from "../components/HrEmployeeSelection";

type EmployeeOption=Pick<HrEmployee,"id"|"fullName"|"employeeCode">;
interface Props {selectedId:string;currentEmployee?:EmployeeOption;onChange:(id:string)=>void;disabled:boolean;}

export function ContractEmployeeSelection(props:Props){
 return <HrEmployeeSelection {...props} purpose="contract"/>;
}
