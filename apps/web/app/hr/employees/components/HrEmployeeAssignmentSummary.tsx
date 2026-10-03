import type { HrEmployee, HrEmployeeAssignmentLabel } from "../../../../lib/hr-api";
import styles from "./hr-employee-profile-summary.module.css";

function relationValue(value: HrEmployeeAssignmentLabel | undefined) {
  if (!value) return "详情尚未提供";
  if (value.status === "unassigned") return "未关联";
  if (value.status === "unavailable" || !value.name) return "关联信息当前不可用";
  return value.status === "inactive" ? `${value.name}（已停用）` : value.name;
}

export function HrEmployeeAssignmentSummary({ employee }: { employee: HrEmployee }) {
  const details = employee.assignmentDetails;
  const dates=employee.employmentDates;
  const recorded=dates===undefined?"详情尚未提供":dates.unclassifiedRecordedDate.status==="missing"?"未登记":dates.unclassifiedRecordedDate.date===null?"日期格式待核实":`${dates.unclassifiedRecordedDate.date}（用途待核实）`;
  const planned=dates===undefined?"详情尚未提供":dates.plannedConfirmation.status==="planned"?dates.plannedConfirmation.dates[0]??"来源未确认":dates.plannedConfirmation.status==="none"?"暂无已提交的计划":dates.plannedConfirmation.status==="multiple"?`多个计划：${dates.plannedConfirmation.dates.join("、")}`:"来源未确认";
  const confirmed=dates===undefined?"详情尚未提供":dates.confirmedEmployment.status==="recorded"?dates.confirmedEmployment.dates[0]??"来源未确认":dates.confirmedEmployment.status==="none"?"暂无现代生效记录":dates.confirmedEmployment.status==="multiple"?`多次生效：${dates.confirmedEmployment.dates.join("、")}`:"来源未确认";
  const fields = [
    ["所属组织", relationValue(details?.organization)],
    ["岗位", relationValue(details?.position)],
    ["直属负责人", relationValue(details?.manager)],
    ["任职日期记录", recorded],
    ["现代转正计划日期", planned],
    ["现代已生效转正日期", confirmed],
  ];
  return <div className={`ds-mobile-record-list ${styles.groups}`} aria-label="当前任职关系">
    <article className={`ds-mobile-record ${styles.group}`}>
      <strong>当前任职关系</strong>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </article>
  </div>;
}
