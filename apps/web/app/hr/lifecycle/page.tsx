import { HrLifecycleClient } from "./HrLifecycleClient";
import { parseDepartureEmployeeFilter } from "./departure-navigation";
import { parseJobChangeFilter } from "./job-change-navigation";
export default async function HrLifecyclePage({searchParams}:{searchParams:Promise<{employee_id?:string|string[];job_change_id?:string|string[]}>}){
 const params=await searchParams,filter=parseDepartureEmployeeFilter(params.employee_id),jobChange=parseJobChangeFilter(params.job_change_id);
 if(!jobChange.valid)return <main className="content ds-page"><section className="ds-panel"><h1>岗位变更定位参数无效</h1><p>请从已批准任职申请重新进入关联办理单。</p><a className="ds-button ds-button-secondary" href="/hr/lifecycle#job-change-applications">查看全部岗位变更台账</a></section></main>;
 if(!filter.valid)return <main className="content ds-page"><section className="ds-panel"><h1>员工筛选参数无效</h1><p>请从员工档案重新进入离职流程。</p></section></main>;
 return <HrLifecycleClient employeeId={filter.employeeId} jobChangeId={jobChange.applicationId}/>;
}
