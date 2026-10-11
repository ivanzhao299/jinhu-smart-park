"use client";
import styles from "./attendance-payroll-leave-facts.module.css";
import {useState} from "react";
import type {HrAttendancePayrollInput} from "../../../lib/hr-api";
import {formatBusinessTripDeclaredDays,formatIntervalQuantity,normalizeMonthlyIntervalQuantity} from "./attendance-interval-quantity";

/** Receives the selected frozen batch, never substitutes today's summary for its quantities. */
export function AttendancePayrollLeaveFacts({input}:{input:HrAttendancePayrollInput}) {
 const [page,setPage]=useState(1),pages=Math.max(1,Math.ceil(input.items.length/20)),current=Math.min(page,pages);
 return <details className={`ds-panel ${styles.panel}`}><summary>封账工资输入的考勤数量 · 共 {input.items.length} 人</summary>
  <p>以下数量来自所选工资输入批次的冻结版本。未提供表示该批次未保存此项事实；区间来源待核对时不会按零显示。</p>
  <div className={`ds-mobile-record-list ${styles.records}`}>{input.items.slice((current-1)*20,current*20).map(item=>{const overtime=normalizeMonthlyIntervalQuantity(item.approvedOvertimeMs),trip=normalizeMonthlyIntervalQuantity(item.approvedBusinessTripMs);return <article className="ds-mobile-record" key={item.id}><strong>{item.employeeName} · {item.employeeCode}</strong><span>批准请假：{item.approvedLeaveMinutes==null?"未提供":`${item.approvedLeaveMinutes} 分钟`}</span><span>批准加班区间：{item.approvedOvertimeMs===undefined?"未提供":formatIntervalQuantity(overtime)}</span><span>批准出差区间：{item.approvedBusinessTripMs===undefined?"未提供":formatIntervalQuantity(trip)}</span><span>批准出差申报天数：{formatBusinessTripDeclaredDays(item.approvedBusinessTripDeclaredDays)}</span></article>})}</div>
  <nav className={styles.pager} aria-label="封账考勤数量分页"><button type="button" className="ds-button ds-button-secondary" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</button><span> 第 {current} / {pages} 页 </span><button type="button" className="ds-button ds-button-secondary" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</button></nav>
 </details>;
}
