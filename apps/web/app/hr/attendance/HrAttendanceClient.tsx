"use client";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback,useEffect,useMemo,useState } from "react";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi,type HrAttendanceCalendar } from "../../../lib/hr-api";
import { hasAnyPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";

const readPermissions=[HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ];
export function HrAttendanceClient(){
 const user=useAuthUser(),canRead=hasAnyPermission(user,readPermissions);
 const [rows,setRows]=useState<HrAttendanceCalendar[]>([]),[total,setTotal]=useState(0),[year,setYear]=useState(""),[month,setMonth]=useState(""),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[message,setMessage]=useState("");
 const load=useCallback(async()=>{if(!canRead){setLoading(false);return;}setLoading(true);setMessage("");try{const result=await hrApi.attendanceCalendars(getAccessToken(),1,20,{year:year?Number(year):undefined,month:month?Number(month):undefined});setRows(result.items);setTotal(result.total);}catch(error){setRows([]);setTotal(0);setMessage(hrLoadErrorMessage(error,"加载历史考勤月历失败"));}finally{setLoading(false);}},[canRead,month,year]);
 useEffect(()=>{void load();},[load]);
 const reviewDays=useMemo(()=>rows.reduce((count,row)=>count+row.days.filter(day=>day.symbolStatus==="needs_review").length,0),[rows]);
 const loadMore=async()=>{if(loadingMore||rows.length>=total)return;setLoadingMore(true);try{const next=await hrApi.attendanceCalendars(getAccessToken(),Math.floor(rows.length/20)+1,20,{year:year?Number(year):undefined,month:month?Number(month):undefined});setRows(current=>[...current,...next.items.filter(item=>!current.some(row=>row.id===item.id))]);}catch(error){setMessage(hrLoadErrorMessage(error,"加载更多历史月历失败"));}finally{setLoadingMore(false);}};
 const forbidden=<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="无权访问考勤管理"/></section></main>;
 if(!canRead)return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_ATTENDANCE_PAGE} fallback={forbidden}>{forbidden}</PermissionGuard>;
 return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_ATTENDANCE_PAGE} fallback={forbidden}><main className={`content ds-page ${styles.page}`}>
  <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">考勤运营</span><h1>历史考勤月历</h1><p>查看玉舟旧系统月历模板及原始符号；这些日期不是员工实际出勤记录，未知符号保留待复核。</p></div></section>
  <section className={`ds-kpi-grid ${styles.compactKpiGrid}`} aria-label="历史考勤概览"><article className="ds-kpi-card"><span>月历模板</span><strong>{total}</strong><small>当前园区历史模板</small></article><article className="ds-kpi-card"><span>已加载日期</span><strong>{rows.reduce((count,row)=>count+row.dayCount,0)}</strong><small>真实自然日</small></article><article className="ds-kpi-card"><span>待复核符号</span><strong>{reviewDays}</strong><small>不猜测旧系统含义</small></article></section>
  <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">历史兼容</span><h2>月历目录</h2></div><strong>已加载 {rows.length}/{total}</strong></div><div className={styles.filterBar}><label className="form-field"><span>年份</span><input type="number" min="1900" max="2200" value={year} onChange={event=>setYear(event.target.value)}/></label><label className="form-field"><span>月份</span><select value={month} onChange={event=>setMonth(event.target.value)}><option value="">全部月份</option>{Array.from({length:12},(_,index)=><option key={index+1} value={index+1}>{index+1} 月</option>)}</select></label></div>{message?<p className="form-error" role="alert">{message}</p>:null}<div className="ds-mobile-record-list">{loading?<p className={styles.emptyState}>正在加载历史月历…</p>:rows.length?rows.map(calendar=><article className="ds-mobile-record" key={calendar.id}><strong>{calendar.year} 年 {calendar.month} 月 · {calendar.calendarName??"未命名月历"}</strong><span>{calendar.dayCount} 个自然日</span><div className={styles.tagList}>{calendar.days.map(day=><span className={day.symbolStatus==="needs_review"?"status-pill status-warning":"status-pill"} key={day.date}>{Number(day.date.slice(-2))}日 {day.legacySymbol??"空"}</span>)}</div></article>):<p className={styles.emptyState}>当前筛选条件下没有历史月历。</p>}</div>{rows.length<total?<button className="ds-button" type="button" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"加载中":"加载更多"}</button>:null}</section>
 </main></PermissionGuard>;
}
