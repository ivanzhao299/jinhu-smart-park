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
  const fields = [
    ["所属组织", relationValue(details?.organization)],
    ["岗位", relationValue(details?.position)],
    ["直属负责人", relationValue(details?.manager)],
    ["试用期结束日期", employee.probationEndDate === undefined ? "详情尚未提供" : employee.probationEndDate ?? "未登记"],
  ];
  return <div className={`ds-mobile-record-list ${styles.groups}`} aria-label="当前任职关系">
    <article className={`ds-mobile-record ${styles.group}`}>
      <strong>当前任职关系</strong>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </article>
  </div>;
}
