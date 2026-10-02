import { HrLifecycleClient } from "./HrLifecycleClient";
import { parseDepartureEmployeeFilter } from "./departure-navigation";
export default async function HrLifecyclePage({searchParams}:{searchParams:Promise<{employee_id?:string|string[]}>}){
 const filter=parseDepartureEmployeeFilter((await searchParams).employee_id);
 if(!filter.valid)return <main className="content ds-page"><section className="ds-panel"><h1>员工筛选参数无效</h1><p>请从员工档案重新进入离职流程。</p></section></main>;
 return <HrLifecycleClient employeeId={filter.employeeId}/>;
}
