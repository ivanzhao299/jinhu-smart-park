"use client";
import styles from "./attendance-payroll-leave-facts.module.css";
import {useState} from "react";
import type {HrAttendancePayrollInput} from "../../../lib/hr-api";

/** Receives the selected frozen batch, never substitutes today's summary for its quantities. */
export function AttendancePayrollLeaveFacts({input}:{input:HrAttendancePayrollInput}) {
 const [page,setPage]=useState(1),pages=Math.max(1,Math.ceil(input.items.length/20)),current=Math.min(page,pages);
 return <details className={`ds-panel ${styles.panel}`}><summary>封账工资输入的批准请假数量 · 共 {input.items.length} 人</summary>
  <p>这是本批次冻结的数量。未提供表示当时未保存该事实，需要明确的考勤更正版本；是否扣薪由已确认的工资规则决定。</p>
  <div className={`ds-mobile-record-list ${styles.records}`}>{input.items.slice((current-1)*20,current*20).map(item=><article className="ds-mobile-record" key={item.id}><strong>{item.employeeName} · {item.employeeCode}</strong><span>批准请假：{item.approvedLeaveMinutes==null?"未提供":`${item.approvedLeaveMinutes} 分钟`}</span></article>)}</div>
  <nav className={styles.pager} aria-label="封账请假数量分页"><button type="button" className="ds-button ds-button-secondary" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</button><span> 第 {current} / {pages} 页 </span><button type="button" className="ds-button ds-button-secondary" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</button></nav>
 </details>;
}
