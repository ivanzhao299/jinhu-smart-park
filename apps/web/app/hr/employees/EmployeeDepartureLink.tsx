import Link from "next/link";
import type { HrEmployee } from "../../../lib/hr-api";
import { departureWorkflowHref } from "../lifecycle/departure-navigation";
import styles from "./employee-account-link.module.css";
export function EmployeeDepartureLink({employee}:{employee:HrEmployee}){
 return <section className={`ds-panel ${styles.panel}`}><header className={styles.heading}><span className="ds-eyebrow">员工生命周期</span><h2 className="panel-title">离职申请与清退</h2><p className="muted-text">{employee.fullName} · {employee.employeeCode}</p></header><p className={`muted-text ${styles.description}`}>查看离职申请、交接、工资结算与档案归档。可办理事项由角色权限和申请状态决定。</p><div className={styles.actions}><Link className="ds-button" href={departureWorkflowHref(employee.id)}>进入该员工离职流程</Link></div></section>;
}
