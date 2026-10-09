import Link from "next/link";
import { HrInsuranceClient } from "./HrInsuranceClient";
import { parseEmployeeFilter } from "../employees/employee-navigation";
export default async function Page({searchParams}:{searchParams:Promise<{employee_id?:string|string[]}>}){
 const filter=parseEmployeeFilter((await searchParams).employee_id);
 if(!filter.valid)return <main className="content ds-page"><section className="ds-panel"><h1>员工定位参数无效</h1><p>请从员工档案重新进入社保台账。</p><Link className="ds-button" href="/hr/employees">返回员工目录</Link></section></main>;
 return <HrInsuranceClient employeeId={filter.employeeId}/>;
}
