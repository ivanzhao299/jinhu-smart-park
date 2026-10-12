"use client";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useEffect,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hasPermission} from "../../../lib/permissions";
import {hrApi,type HrPayrollPreparationCohort,type HrPayrollReconciliationSetup} from "../../../lib/hr-api";
import {ScopedLedgerExport} from "../ScopedLedgerExport";
import {assertPreparationCohort,attendancePreparationLabel,insurancePreparationLabel,preparationExportRows,preparationCohortCsv} from "./payroll-preparation-cohort";
import styles from "./payroll-preparation-cohort.module.css";

const required=[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ,HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ,HR_PERMISSIONS.HR_PAYROLL_RULE_READ];
export function PayrollPreparationCohort({setup}:{setup:HrPayrollReconciliationSetup}){
 const user=useAuthUser();
 const contextKey=JSON.stringify([user?.id,user?.tenant_id,user?.park_id,user?.permissions,user?.roles,user?.is_super,user?.data_scope,user?.data_scopes,user?.field_policies]);
 if(!required.every(permission=>hasPermission(user,permission)))return null;
 return <CohortWorkspace key={contextKey} contextKey={contextKey} setup={setup}/>;
}
function CohortWorkspace({contextKey,setup}:{contextKey:string;setup:HrPayrollReconciliationSetup}){
 const [batch,setBatch]=useState(""),[month,setMonth]=useState(""),[data,setData]=useState<HrPayrollPreparationCohort|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{request.current?.abort();},[]);
 const batches=[...new Map([...(setup.sourceBatches??[]).map(item=>({id:item.id,count:item.recordCount,date:item.createdAt})),...setup.legacyBatches.map(item=>({id:item.id,count:item.sourceRowCount,date:item.publishedAt}))].map(item=>[item.id,item])).values()];
 const clear=()=>{request.current?.abort();request.current=null;setData(null);setBusy(false);setError("");};
 const query={legacyBatchId:batch,periodMonth:`${month}-01`};
 const load=async(page=1)=>{
  if(!batches.some(item=>item.id===batch)||!/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)){setError("请选择工资来源批次和有效月份。");return;}
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const token=getAccessToken(),current=()=>!controller.signal.aborted&&request.current===controller&&getAccessToken()===token;
  setBusy(true);setError("");setData(null);
  try{const result=await hrApi.payrollPreparationCohort(query,token,page,20,controller.signal);assertPreparationCohort(result,query,page,20);if(current())setData(result);}
  catch(e){if(current())setError(e instanceof Error?e.message:"查询失败，请重试。");}
  finally{if(request.current===controller){setBusy(false);request.current=null;}}
 };
 const exportKey=JSON.stringify([contextKey,batch,month,data?.legacyBatchId,data?.periodMonth]);
 return <section className="ds-panel" aria-labelledby="payroll-cohort-heading">
  <h2 id="payroll-cohort-heading">全账套人员准备清单</h2>
  <p>按月份查看所选来源的全部账套。跨账套人员合并展示，工资记录分别保留；这里只准备核对资料，不计算或发放工资。</p>
  <form onSubmit={event=>{event.preventDefault();void load();}}>
   <div className={styles.fields}>
    <label>工资来源批次<select value={batch} onChange={event=>{clear();setBatch(event.target.value);}}><option value="">请选择来源批次</option>{batches.map((item,index)=><option key={item.id} value={item.id}>{`来源 ${index+1} · ${item.date?.slice(0,10)||"日期未提供"} · ${item.count} 条`}</option>)}</select></label>
    <label>工资月份<input type="month" min="1900-01" max="2100-12" required value={month} onChange={event=>{clear();setMonth(event.target.value);}}/></label>
   </div>
   <div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy} type="submit">{busy?"正在查询…":"查询全部账套人员"}</button><a className="ds-button ds-button-secondary" href="/hr/attendance">查看考勤月结</a><a className="ds-button ds-button-secondary" href="/hr/insurance">查看社保资料</a></div>
  </form>
  {error?<p role="alert">{error}</p>:null}
  {data?<>
   <p role="status">{month} · {data.totals.bookCount} 个账套 · {data.totals.recordCount} 条工资记录 · {data.total} 位人员 · {data.totals.itemCount} 条工资项目</p>
   <div className={`ds-scene-grid ${styles.books}`}>{data.books.map(book=><article className="ds-scene-card" key={book.bookId}><h3>{book.bookName||`账套 ${book.legacyScheme}`}</h3><p>{book.recordCount} 条记录 · {book.itemCount} 条项目</p><p>{book.available?"账套资料可用":"账套资料不可用，需复核"}</p><p>已批准公式候选：{book.approvedFormulaCandidateCount} 个；{book.currentNetPolicy?`当前净额策略 V${book.currentNetPolicy.versionNo}（${book.currentNetPolicy.status}）`:"尚无当前净额策略"}</p><p>候选仍需逐项确认适用月份与业务规则。</p></article>)}</div>
   {([['unmappedRecordCount','未映射记录'],['duplicateSourceCount','重复来源记录'],['quarantinedCount','待复核来源记录'],['unavailableReferenceCount','不可用关联记录'],['unavailableEmployeeCount','不可用员工记录'],['unresolvedItemCount','未解析工资项目'],['duplicateEmployeeExtraCount','同账套人员额外记录']] as const).filter(([key])=>data.totals[key]>0).map(([key,label])=><p key={key} role="status">{label}：{data.totals[key]}。各项可能重叠，需核对来源。</p>)}
   <div className={`ds-mobile-record-list ${styles.records}`}>{data.items.map(item=><article className="ds-mobile-record" key={item.employeeId}><h3>{item.fullName} · {item.employeeCode}</h3><p>{item.recordCount} 条工资记录；{item.books.map(book=>`${data.books.find(candidate=>candidate.bookId===book.bookId)?.bookName||"账套"} ${book.recordCount} 条`).join("；")}</p><p>{attendancePreparationLabel(item)}</p><p>{insurancePreparationLabel(item)}</p></article>)}</div>
   <div className={styles.actions}><button className="ds-button ds-button-secondary" type="button" disabled={busy||data.page<=1} onClick={()=>void load(data.page-1)}>上一页</button><span>第 {data.page} / {Math.max(1,Math.ceil(data.total/data.page_size))} 页 · 每页 {data.page_size} 人</span><button className="ds-button ds-button-secondary" type="button" disabled={busy||data.page*data.page_size>=data.total} onClick={()=>void load(data.page+1)}>下一页</button>
    <ScopedLedgerExport contextKey={exportKey} enabled={!busy&&data.total>0} label="人员准备清单" fileName={`工资人员准备-${month}.csv`} fetchPage={async(page,size,signal,token)=>{if(getAccessToken()!==token)throw new Error("登录状态已变化，请重新查询后再导出。");const result=await hrApi.payrollPreparationCohort(query,token,page,size,signal);if(getAccessToken()!==token)throw new Error("登录状态已变化，请重新查询后再导出。");assertPreparationCohort(result,query,page,size);if(JSON.stringify([result.totals,result.books,result.sourceStatus])!==JSON.stringify([data.totals,data.books,data.sourceStatus]))throw new Error("准备资料已变化，请重新查询后再导出。");return {...result,items:preparationExportRows(result)};}} serialize={preparationCohortCsv} successMessage={rows=>`已导出 ${rows.length} 位人员的实时准备清单。清单不含工资金额，也不是冻结的工资核对结果。`}/>
   </div>
  </>:null}
 </section>;
}
