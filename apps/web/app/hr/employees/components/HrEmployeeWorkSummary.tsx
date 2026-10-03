import type { HrEmployee } from "../../../../lib/hr-api";
import styles from "./hr-employee-profile-summary.module.css";

const fields = [
  ["workLocation", "工作地点"],
  ["workMobile", "工作电话"],
  ["workEmail", "工作邮箱"],
] as const;

export function HrEmployeeWorkSummary({ employee }: { employee: HrEmployee }) {
  return <div className={`ds-mobile-record-list ${styles.groups}`} aria-label="工作联系方式">
    <article className={`ds-mobile-record ${styles.group}`}>
      <strong>工作联系方式</strong>
      <dl>{fields.map(([key, label]) => <div key={key}>
        <dt>{label}</dt><dd>{employee[key] || "未登记"}</dd>
      </div>)}</dl>
    </article>
  </div>;
}
