"use client";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useEffect,useRef,useState,useSyncExternalStore } from "react";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi,type HrInsurancePeriod } from "../../../lib/hr-api";
import { hasAnyPermission,hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";
import { createInsuranceLedger,insurancePageCount } from "./insurance-ledger";
import insuranceStyles from "./insurance.module.css";

const kindLabels:Record<string,string>={pension:"养老保险",medical:"医疗保险",unemployment:"失业保险",injury:"工伤保险",maternity:"生育保险",housing_fund:"住房公积金"};
const reviewReasonLabels:Record<string,string>={T3_INT4_INVALID:"来源期间缺失或无效",T3_RECORD_NEEDS_REVIEW:"来源记录待复核"};
const safeAmount=(value:string|undefined)=>value!==undefined&&/^-?\d+(?:\.\d+)?$/.test(value)?value:"—";
const periodLabel=(row:HrInsurancePeriod)=>row.reviewReasonCode?reviewReasonLabels[row.reviewReasonCode]??"来源期间待复核":`${row.periodYear} 年 ${row.periodMonth} 月`;
const loadedEmployeeAmount=(rows:HrInsurancePeriod[])=>rows.every(row=>row.employeeAmount!==undefined&&/^-?\d+(?:\.\d+)?$/.test(row.employeeAmount))?rows.reduce((sum,row)=>sum+Number(row.employeeAmount),0).toFixed(2):"—";
export function HrInsuranceClient(){
 const user=useAuthUser(),canRead=hasAnyPermission(user,[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_TEAM_READ,HR_PERMISSIONS.HR_INSURANCE_SELF_READ]),full=hasPermission(user,HR_PERMISSIONS.HR_INSURANCE_READ),selfOnly=hasPermission(user,HR_PERMISSIONS.HR_INSURANCE_SELF_READ)&&!hasAnyPermission(user,[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_TEAM_READ]),canReadAmount=selfOnly||hasPermission(user,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ);
 const [keyword,setKeyword]=useState(""),[debouncedKeyword,setDebouncedKeyword]=useState(""),[year,setYear]=useState(""),[month,setMonth]=useState(""),[reviewOnly,setReviewOnly]=useState(false);
 const ledgerRef=useRef<ReturnType<typeof createInsuranceLedger<HrInsurancePeriod>>|null>(null);
 if(!ledgerRef.current)ledgerRef.current=createInsuranceLedger<HrInsurancePeriod>({
  list:(query,page,size)=>hrApi.insurancePeriods(getAccessToken(),page,size,{keyword:query.keyword||undefined,year:query.year?Number(query.year):undefined,month:query.month?Number(query.month):undefined,needsReview:query.reviewOnly?true:undefined},query.selfOnly),
  detail:id=>hrApi.insurancePeriod(id,getAccessToken()),error:hrLoadErrorMessage
 });
 const ledger=ledgerRef.current,contextKey=JSON.stringify([user?.id,user?.tenant_id,user?.park_id,user?.is_super,user?.permissions,user?.roles,user?.data_scope,user?.data_scopes,user?.field_policies]);
 const snapshot=useSyncExternalStore(ledger.subscribe,ledger.getSnapshot,ledger.getSnapshot);
 const contextMatches=snapshot.contextKey===contextKey;
 const rows=contextMatches?snapshot.rows:[],total=contextMatches?snapshot.total:0,selected=contextMatches?snapshot.selected:null,loading=!contextMatches||snapshot.loading,message=contextMatches?snapshot.message:"",page=contextMatches?snapshot.page:1,detailLoading=contextMatches&&snapshot.detailLoading;
 useEffect(()=>{const timer=window.setTimeout(()=>setDebouncedKeyword(keyword.trim()),300);return()=>window.clearTimeout(timer);},[keyword]);
 useEffect(()=>{
  ledger.configure({contextKey,canRead,selfOnly,keyword:keyword.trim(),year,month,reviewOnly});
  if(keyword.trim()===debouncedKeyword)void ledger.load();
  return()=>ledger.cancel();
 },[ledger,contextKey,canRead,selfOnly,keyword,debouncedKeyword,year,month,reviewOnly]);
 const pick=(row:HrInsurancePeriod)=>ledger.pick(row);
 const forbidden=<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="无权访问五险一金"/></section></main>;
 if(!canRead)return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_INSURANCE_PAGE} fallback={forbidden}>{forbidden}</PermissionGuard>;
 return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_INSURANCE_PAGE} fallback={forbidden}><main className={`content ds-page ${styles.page}`}>
  <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">员工保障</span><h1>{selfOnly?"我的五险一金":"五险一金台账"}</h1><p>{full?"按月核对个人与单位缴费、异常基数和待复核记录。":"查看权限范围内的个人缴费与参保状态，单位成本仅向 HR 授权岗位开放。"}</p></div></section>
  <section className={`ds-kpi-grid ${styles.compactKpiGrid}`} aria-label="社保台账概览"><article className="ds-kpi-card"><span>期间记录</span><strong>{total}</strong><small>当前筛选范围</small></article>{canReadAmount?<article className="ds-kpi-card"><span>本页个人缴费</span><strong>¥ {loadedEmployeeAmount(rows)}</strong><small>精确到分</small></article>:null}<article className="ds-kpi-card"><span>待复核</span><strong>{rows.filter(row=>row.needsReview).length}</strong><small>当前页记录</small></article></section>
  <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">历史台账</span><h2>员工月度明细</h2></div><strong>本页 {rows.length} 条 · 共 {total} 条</strong></div><div className={styles.filterBar}>{!selfOnly?<label className="form-field"><span>员工</span><input type="search" placeholder="姓名或员工编号" value={keyword} onChange={event=>{ledger.invalidate();setKeyword(event.target.value);}}/></label>:null}<label className="form-field"><span>年份</span><input type="number" min="1900" max="2200" step="1" onFocus={event=>event.currentTarget.select()} value={year} onChange={event=>{ledger.invalidate();setYear(event.target.value);}}/></label><label className="form-field"><span>月份</span><select value={month} onChange={event=>{ledger.invalidate();setMonth(event.target.value);}}><option value="">全部月份</option>{Array.from({length:12},(_,index)=><option key={index+1} value={index+1}>{index+1} 月</option>)}</select></label><label className="form-field"><span>复核状态</span><select value={reviewOnly?"review":"all"} onChange={event=>{ledger.invalidate();setReviewOnly(event.target.value==="review");}}><option value="all">全部记录</option><option value="review">仅待复核</option></select></label></div>{message?<p className="form-error" role="alert">{message}</p>:null}<div className={`ds-mobile-record-list ${insuranceStyles.recordList}`}>{loading?<p className={styles.emptyState}>正在加载社保台账…</p>:rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.employeeName?`${row.employeeName} · `:""}{periodLabel(row)}</strong>{row.employeeCode?<span>{row.employeeCode}</span>:null}{canReadAmount?<span>个人缴费 ¥ {safeAmount(row.employeeAmount)} · 补充缴费 ¥ {safeAmount(row.supplementAmount)}</span>:null}{canReadAmount&&full?<span>单位缴费 ¥ {safeAmount(row.employerAmount)} · 合计 ¥ {safeAmount(row.totalAmount)}</span>:null}<span>{row.itemCount} 个险种{row.needsReview?` · ${reviewReasonLabels[row.reviewReasonCode??""]??"待复核"}`:" · 已入账"}</span>{full||selfOnly?<button type="button" className="ds-button" onClick={()=>void pick(row)}>查看分项</button>:null}</article>):<p className={styles.emptyState}>当前筛选条件下没有社保记录。</p>}</div><nav aria-label="社保台账分页" className={styles.filterBar}><button className="ds-button" type="button" disabled={loading||page<=1} onClick={()=>void ledger.load(page-1)}>上一页</button><span role="status" aria-live="polite">第 {page} / {insurancePageCount(total)} 页 · 共 {total} 条 · 每页 30 条</span><button className="ds-button" type="button" disabled={loading||page>=insurancePageCount(total)} onClick={()=>void ledger.load(page+1)}>下一页</button><button className="ds-button" type="button" disabled={loading} onClick={()=>void ledger.load(page)}>刷新本页</button></nav>{detailLoading?<p role="status">正在加载社保分项…</p>:null}</section>
  {selected?<section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">期间明细</span><h2>{selected.employeeName?`${selected.employeeName} · `:""}{periodLabel(selected)}</h2></div><strong>{selected.needsReview?(reviewReasonLabels[selected.reviewReasonCode??""]??"待复核"):"已入账"}</strong></div>{full&&selected.legacyCompatibility?<p className={styles.emptyState}>旧系统兼容元数据已保留：状态标志 {Object.keys(selected.legacyCompatibility.legacyFlags??{}).length} 项，附属字段存在性 {Object.values(selected.legacyCompatibility.fieldPresence??{}).filter(Boolean).length} 项；原值不在前端展示。</p>:null}<div className={`ds-mobile-record-list ${insuranceStyles.recordList}`}>{selected.items?.map(item=><article className="ds-mobile-record" key={item.insuranceKind}><strong>{kindLabels[item.insuranceKind]??item.insuranceKind}</strong>{canReadAmount?<><span>缴费基数 {safeAmount(item.contributionBase??undefined)}</span><span>个人 ¥ {safeAmount(item.employeeAmount??undefined)} · 补充 ¥ {safeAmount(item.supplementAmount??undefined)}</span>{full?<span>单位 ¥ {safeAmount(item.employerAmount??undefined)} · 合计 ¥ {safeAmount(item.totalAmount??undefined)}</span>:null}</>:null}{item.legacyBaseNegative?<span className="status-pill status-warning">旧系统负基数，需复核</span>:null}</article>)}</div></section>:null}
 </main></PermissionGuard>;
}
