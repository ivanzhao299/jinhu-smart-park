import { HrEmployeesClient } from "./HrEmployeesClient";
import { parseEmployeeFilter } from "./employee-navigation";
export default async function HrEmployeesPage({searchParams}:{searchParams:Promise<{employee_id?:string|string[]}>}){
 const filter=parseEmployeeFilter((await searchParams).employee_id);
 if(!filter.valid)return <main className="content ds-page"><section className="ds-panel"><h1>员工定位参数无效</h1><p>请从员工目录重新打开档案。</p><a className="ds-button" href="/hr/employees">返回员工目录</a></section></main>;
 return <HrEmployeesClient employeeId={filter.employeeId}/>;
}
