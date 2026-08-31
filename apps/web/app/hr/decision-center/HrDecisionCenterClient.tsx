"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { RefreshCw,UsersRound } from "lucide-react";
import { useCallback,useEffect,useRef,useState } from "react";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi,type HrWorkforceDecisionSnapshot } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";

const defaultTo=new Date().toISOString().slice(0,10),defaultFrom=`${defaultTo.slice(0,4)}-01-01`;
const labels:Record<string,string>={active:"在职",probation:"试用",preboarding:"待入职",suspended:"停职",departed:"离职",full_time:"全职",part_time:"兼职",contractor:"外包",intern:"实习",created:"新建档案",start_probation:"入职试用",confirm_employment:"转正",transfer:"调动",suspend:"停职",resume:"复职",depart:"离职"};
const label=(value:string)=>labels[value]??value;

export function HrDecisionCenterClient(){
 const user=useAuthUser(),canRead=hasPermission(user,HR_PERMISSIONS.HR_DECISION_CENTER_PAGE),abortRef=useRef<AbortController|null>(null),[from,setFrom]=useState(defaultFrom),[to,setTo]=useState(defaultTo),[snapshot,setSnapshot]=useState<HrWorkforceDecisionSnapshot|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{if(!canRead)return;abortRef.current?.abort();const controller=new AbortController();abortRef.current=controller;setLoading(true);setError("");try{const next=await hrApi.workforceDecisionSnapshot(getAccessToken(),{from,to},controller.signal);if(!controller.signal.aborted)setSnapshot(next);}catch(cause){if(!controller.signal.aborted)setError(hrLoadErrorMessage(cause,"加载人员决策聚合失败"));}finally{if(!controller.signal.aborted)setLoading(false);}},[canRead,from,to]);
 useEffect(()=>{void load();return()=>abortRef.current?.abort();},[load]);
 if(!canRead)return <ForbiddenState variant="page" message="当前账号没有人力资源决策中心权限。"/>;
 const forbidden=<ForbiddenState variant="page" message="当前账号没有人力资源决策中心权限。"/>;
 return <PermissionGuard module="hr" permission="hr:decision_center" fallback={forbidden}><main className={`content ds-page ${styles.page}`}>
  <section className={styles.workbenchHeader}><div><span className="ds-eyebrow">人力资源决策中心</span><h1>人员结构与流动</h1><p>仅展示园区级聚合，不展示员工身份信息、联系方式、档案敏感字段或薪资金额。</p></div><button className="ds-button ds-button-secondary" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>{loading?"刷新中":"刷新"}</button></section>
  <section className={`ds-panel ${styles.section}`} aria-label="统计范围"><div className={styles.sectionHeader}><div><span className="ds-eyebrow">统计范围</span><h2>人员异动期间</h2></div></div><div className={styles.formGrid}><label>开始日期<input type="date" value={from} max={to} onChange={event=>setFrom(event.target.value)}/></label><label>结束日期<input type="date" value={to} min={from} onChange={event=>setTo(event.target.value)}/></label></div></section>
  {error?<section className="ds-panel"><p>{error}</p><button className="ds-button" type="button" onClick={()=>void load()}>重试</button></section>:null}
  {loading&&!snapshot?<section className="ds-panel">正在加载人员决策聚合…</section>:null}
  {snapshot?<>
   <section className={`ds-kpi-grid ${styles.metricGrid}`} aria-label="人员概览"><article className={`ds-kpi-card ${styles.metricCard}`}><span className={styles.metricIcon}><UsersRound size={19}/></span><span className={styles.metricLabel}>员工档案总数</span><strong>{snapshot.employeeTotal}</strong><small>截至当前授权园区</small></article><article className={`ds-kpi-card ${styles.metricCard}`}><span className={styles.metricLabel}>在职与试用人数</span><strong>{snapshot.activeHeadcount}</strong><small>不含待入职、停职与离职</small></article><article className={`ds-kpi-card ${styles.metricCard}`}><span className={styles.metricLabel}>期间异动记录</span><strong>{snapshot.employmentEvents.total}</strong><small>{snapshot.from} 至 {snapshot.to}</small></article><article className={`ds-kpi-card ${styles.metricCard}`}><span className={styles.metricLabel}>涉及员工数</span><strong>{snapshot.employmentEvents.employeeCount}</strong><small>同一员工可有多笔异动</small></article></section>
   <section className={styles.businessGroups}><section className="ds-panel"><header className={styles.sectionHeader}><div><span className="ds-eyebrow">人员结构</span><h2>任职状态</h2></div></header><div className="ds-mobile-record-list">{snapshot.byStatus.map(item=><article className="ds-mobile-record" key={item.status}><strong>{label(item.status)}</strong><span>{item.count} 人</span></article>)}</div></section><section className="ds-panel"><header className={styles.sectionHeader}><div><span className="ds-eyebrow">人员结构</span><h2>用工类型</h2></div></header><div className="ds-mobile-record-list">{snapshot.byType.map(item=><article className="ds-mobile-record" key={item.type}><strong>{label(item.type)}</strong><span>{item.count} 人</span></article>)}</div></section><section className="ds-panel"><header className={styles.sectionHeader}><div><span className="ds-eyebrow">人员流动</span><h2>异动类型</h2></div></header><div className="ds-mobile-record-list">{snapshot.employmentEvents.byType.map(item=><article className="ds-mobile-record" key={item.eventType}><strong>{label(item.eventType)}</strong><span>{item.count} 笔</span></article>)}</div></section></section>
  </>:null}
 </main></PermissionGuard>;
}
