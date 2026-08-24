"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback,useEffect,useMemo,useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi,type HrContract,type HrContractDetail } from "../../../lib/hr-api";
import { hasAnyPermission,hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";

const statusLabels:Record<string,string>={draft:"草稿",active:"履行中",expired:"已到期",terminated:"已终止",cancelled:"已取消",needs_review:"待复核"};
const changeLabels:Record<string,string>={renewal:"续签",amendment:"变更",termination:"终止",correction:"更正",needs_review:"待复核"};
const dateAfter=(days:number)=>{const date=new Date();date.setDate(date.getDate()+days);return date.toISOString().slice(0,10);};
const today=()=>new Date().toISOString().slice(0,10);

export function HrContractsClient(){
 const user=useAuthUser();
 const canRead=hasAnyPermission(user,[HR_PERMISSIONS.HR_CONTRACT_READ,HR_PERMISSIONS.HR_CONTRACT_TEAM_READ,HR_PERMISSIONS.HR_CONTRACT_SELF_READ]);
 const selfOnly=hasPermission(user,HR_PERMISSIONS.HR_CONTRACT_SELF_READ)&&!hasAnyPermission(user,[HR_PERMISSIONS.HR_CONTRACT_READ,HR_PERMISSIONS.HR_CONTRACT_TEAM_READ]);
 const [rows,setRows]=useState<HrContract[]>([]),[total,setTotal]=useState(0),[activeTotal,setActiveTotal]=useState(0),[expiringTotal,setExpiringTotal]=useState(0);
 const [keyword,setKeyword]=useState(""),[debouncedKeyword,setDebouncedKeyword]=useState(""),[status,setStatus]=useState("");
 const [selected,setSelected]=useState<HrContractDetail|null>(null),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{const timer=window.setTimeout(()=>setDebouncedKeyword(keyword.trim()),300);return()=>window.clearTimeout(timer);},[keyword]);
 const load=useCallback(async()=>{if(!canRead){setLoading(false);return;}setLoading(true);setMessage("");setSelected(null);try{const token=getAccessToken();const [list,active,expiring]=await Promise.all([hrApi.contracts(token,1,50,{keyword:debouncedKeyword,status:status||undefined},selfOnly),hrApi.contracts(token,1,1,{status:"active"},selfOnly),hrApi.contracts(token,1,1,{status:"active",expiryFrom:today(),expiryTo:dateAfter(60)},selfOnly)]);setRows(list.items);setTotal(list.total);setActiveTotal(active.total);setExpiringTotal(expiring.total);}catch(error){setRows([]);setTotal(0);setActiveTotal(0);setExpiringTotal(0);setMessage(hrLoadErrorMessage(error,"加载劳动合同失败"));}finally{setLoading(false);}},[canRead,debouncedKeyword,selfOnly,status]);
 useEffect(()=>{void load();},[load]);
 const loadMore=async()=>{if(loadingMore||rows.length>=total)return;setLoadingMore(true);try{const next=await hrApi.contracts(getAccessToken(),Math.floor(rows.length/50)+1,50,{keyword:debouncedKeyword,status:status||undefined},selfOnly);setRows(current=>[...current,...next.items.filter(item=>!current.some(existing=>existing.id===item.id))]);}catch(error){setMessage(hrLoadErrorMessage(error,"加载更多合同失败"));}finally{setLoadingMore(false);}};
 const pick=async(row:HrContract)=>{setMessage("");try{setSelected(await hrApi.contract(row.id,getAccessToken()));}catch(error){setSelected(null);setMessage(hrLoadErrorMessage(error,"加载合同详情失败"));}};
 const visible=useMemo(()=>rows,[rows]);
 const forbidden=<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="无权访问劳动合同"/></section></main>;
 if(!canRead)return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_CONTRACTS_PAGE} fallback={forbidden}><main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="当前账号拥有劳动合同页面入口，但没有可用的合同读取权限。"/></section></main></PermissionGuard>;
 return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_CONTRACTS_PAGE} fallback={forbidden}>
  <main className={`content ds-page ${styles.page}`}>
   <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">员工生命周期</span><h1>{selfOnly?"我的劳动合同":"劳动合同"}</h1><p>统一查看合同期限、履行状态和续签变更历史；旧系统合同保留原有历史链且不可覆盖。</p></div></section>
   <section className="ds-kpi-grid" aria-label="劳动合同概览"><article className="ds-kpi-card"><span>全部合同</span><strong>{total}</strong><small>当前权限范围</small></article><article className="ds-kpi-card"><span>履行中</span><strong>{activeTotal}</strong><small>有效劳动关系</small></article><article className="ds-kpi-card"><span>60 日内到期</span><strong>{expiringTotal}</strong><small>需要续签评估</small></article></section>
   <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">合同台账</span><h2>合同目录</h2></div><strong>已加载 {rows.length}/{total}</strong></div><div className={styles.filterBar}><label className="form-field"><span>搜索</span><input type="search" value={keyword} onChange={event=>setKeyword(event.target.value)} placeholder="姓名、员工编号或合同编号"/></label><label className="form-field"><span>合同状态</span><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div>
    {message?<p className="form-error" role="alert">{message}</p>:null}
    <div className="ds-mobile-record-list">{loading?<p className={styles.emptyState}>正在加载劳动合同…</p>:visible.length?visible.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.employeeName} · {row.contractTypeName}</strong><span>{row.employeeCode} · {row.contractNo}</span><span>{row.startDate??"未登记"} 至 {row.endDate??"无固定期限"}</span><span>{statusLabels[row.status]??row.status}{row.isHistoricalImport?" · 旧系统历史":""}</span><button type="button" className="ds-button" onClick={()=>void pick(row)}>查看合同</button></article>):<p className={styles.emptyState}>当前筛选条件下没有可查看的劳动合同。</p>}</div>
    {rows.length<total?<button type="button" className="ds-button" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"加载中":"加载更多"}</button>:null}
   </section>
   {selected?<section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">合同详情</span><h2>{selected.employeeName} · {selected.contractNo}</h2></div><strong>{statusLabels[selected.status]??selected.status}</strong></div><div className="ds-mobile-record-list"><article className="ds-mobile-record"><strong>{selected.contractTypeName}</strong><span>员工：{selected.employeeCode} · {selected.employeeName}</span><span>期限：{selected.startDate??"未登记"} 至 {selected.endDate??"无固定期限"}</span><span>试用期截止：{selected.probationEndDate??"未登记"}</span></article></div><h3>续签与变更历史</h3><div className="ds-mobile-record-list">{selected.changes.length?selected.changes.map(change=><article className="ds-mobile-record" key={change.id}><strong>第 {change.sequenceNo} 次 · {changeLabels[change.changeType]??change.changeType}</strong><span>{change.newStartDate} 至 {change.newEndDate??"无固定期限"}</span><span>{change.isHistoricalImport?"旧系统历史记录":"新系统记录"}</span></article>):<p className={styles.emptyState}>暂无续签或变更记录。</p>}</div></section>:null}
  </main>
 </PermissionGuard>;
}
