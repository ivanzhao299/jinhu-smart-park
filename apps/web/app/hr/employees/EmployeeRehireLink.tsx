import Link from "next/link";
import type { HrEmployee } from "../../../lib/hr-api";
import styles from "./employee-account-link.module.css";
export function EmployeeRehireLink({employee}:{employee:HrEmployee}){
 if(employee.employmentStatus!=="departed")return null;
 return <section className={`ds-panel ${styles.panel}`}><header className={styles.heading}><span className="ds-eyebrow">员工生命周期</span><h2 className="panel-title">员工回聘</h2><p className="muted-text">{employee.fullName} · {employee.employeeCode}</p></header><p className={`muted-text ${styles.description}`}>沿用原档案办理本次回聘，保留历次入职与离职记录。经独立复核后确认新的任职信息。</p><div className={styles.actions}><Link className="ds-button" href={`/hr/lifecycle?employee_id=${encodeURIComponent(employee.id)}#employee-rehire`}>进入该员工回聘流程</Link></div></section>;
}
