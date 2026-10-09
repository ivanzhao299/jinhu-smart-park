"use client";

import {useState} from "react";
import {createPortal} from "react-dom";
import type {HrPayrollHistoryItem,HrPayrollHistoryRow} from "../../../lib/hr-api";
import {formatPayrollHistoryItemValue} from "./payroll-history-display";
import styles from "./payroll-statement.module.css";

export function PayrollStatementActions({row,items,selfOnly,formatMoney}:{row:HrPayrollHistoryRow;items:HrPayrollHistoryItem[];selfOnly:boolean;formatMoney:(value:string|null)=>string}){
 const [error,setError]=useState("");
 const print=()=>{setError("");try{window.print();}catch{setError("无法打开打印，请使用浏览器打印菜单重试。");}};
 return <>
  <button className={`ds-button ds-button-secondary ${styles.action}`} type="button" onClick={print}>打印 / 保存 PDF</button>
  {error?<p role="alert">{error}</p>:null}
  {typeof document!=="undefined"?createPortal(<article className={`print-area ${styles.statement}`} aria-label="工资明细打印面">
   <h1>工资明细</h1>
   <p>{row.periodMonth.slice(0,7)} · {row.bookName||`账套 ${row.legacyScheme}`}</p>
   {!selfOnly?<p>员工编号：{row.employeeCode||"—"} · 姓名：{row.employeeName||"—"}</p>:null}
   <table><caption>工资汇总</caption><thead><tr><th scope="col">应发</th><th scope="col">扣款</th><th scope="col">税额</th><th scope="col">实发</th></tr></thead><tbody><tr><td>{formatMoney(row.grossAmount)}</td><td>{formatMoney(row.deductionAmount)}</td><td>{formatMoney(row.taxAmount)}</td><td>{formatMoney(row.netAmount)}</td></tr></tbody></table>
   {items.length?<table className={styles.items}><caption>工资分项</caption><thead><tr><th scope="col">工资项目</th><th scope="col">数值</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><th scope="row">{item.displayName||item.itemCode||"工资项目"}</th><td>{formatPayrollHistoryItemValue(item,formatMoney)}</td></tr>)}</tbody></table>:<p>该工资条没有逐项明细。</p>}
  </article>,document.body):null}
 </>;
}
