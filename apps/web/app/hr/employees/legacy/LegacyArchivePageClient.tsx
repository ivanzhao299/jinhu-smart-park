"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import Link from "next/link";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { ForbiddenState } from "../../../../components/auth/ForbiddenState";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { isForbiddenError } from "../../../../lib/api-client";
import { hrApi,type HrLegacyArchiveRecord } from "../../../../lib/hr-api";
import { hasAnyPermission } from "../../../../lib/permissions";
import styles from "./legacy-archive.module.css";

const statusLabels:Record<string,string>={mapped:"已归属",resolved:"已复核归属",archive_only:"仅归档",quarantine:"待复核"};
const readPermissions=[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_TEAM_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ];
const formatValue=(value:unknown)=>value===null||value===undefined||value===""?"—":typeof value==="object"?JSON.stringify(value):String(value);

export function LegacyArchivePageClient({unclaimed=false}:{unclaimed?:boolean}){
 const user=useAuthUser(),pagePermission=unclaimed?HR_PERMISSIONS.HR_LEGACY_UNCLAIMED_PAGE:HR_PERMISSIONS.HR_LEGACY_ARCHIVE_PAGE;
 const canRead=unclaimed?hasAnyPermission(user,[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_UNCLAIMED_READ]):hasAnyPermission(user,readPermissions);
 const [rows,setRows]=useState<HrLegacyArchiveRecord[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[forbidden,setForbidden]=useState(false),[selected,setSelected]=useState<HrLegacyArchiveRecord|null>(null);
 const [keyword,setKeyword]=useState(""),[status,setStatus]=useState(""),[recordType,setRecordType]=useState(""),[employeeId,setEmployeeId]=useState("");
 const listAbort=useRef<AbortController|null>(null),detailAbort=useRef<AbortController|null>(null);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get("employee_id")??"";setEmployeeId(id)},[]);
 const load=useCallback(async()=>{listAbort.current?.abort();const controller=new AbortController();listAbort.current=controller;setLoading(true);setMessage("");setForbidden(false);if(!canRead){setForbidden(true);setRows([]);setLoading(false);return}try{const result=await hrApi.legacyArchive(getAccessToken(),1,100,{keyword:keyword.trim(),status,recordType:recordType.trim(),employeeId},unclaimed,controller.signal);if(controller.signal.aborted)return;setRows(result.items);setTotal(result.total);setSelected(current=>current&&result.items.some(row=>row.id===current.id)?current:null)}catch(error){if(controller.signal.aborted)return;if(isForbiddenError(error))setForbidden(true);else setMessage(error instanceof Error?error.message:"加载旧系统资料失败");setRows([]);setTotal(0)}finally{if(listAbort.current===controller)setLoading(false)}},[canRead,employeeId,keyword,recordType,status,unclaimed]);
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),250);return()=>window.clearTimeout(timer)},[load]);
 useEffect(()=>()=>{listAbort.current?.abort();detailAbort.current?.abort()},[]);
 const showDetail=async(row:HrLegacyArchiveRecord)=>{detailAbort.current?.abort();const controller=new AbortController();detailAbort.current=controller;setMessage("");try{const detail=await hrApi.legacyArchiveDetail(row.id,getAccessToken(),controller.signal);if(!controller.signal.aborted)setSelected(detail)}catch(error){if(!controller.signal.aborted)setMessage(isForbiddenError(error)?"该资料不在当前数据权限范围内。":error instanceof Error?error.message:"加载资料详情失败")}};
 const fallback=<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><h1>无权访问旧系统资料</h1><p>请联系管理员配置相应的员工档案权限。</p></section></main>;
 if(forbidden)return <PermissionGuard module="hr" permission={pagePermission} fallback={fallback}><main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="页面入口已授权，但当前账号没有相应的数据读取权限。"/></section></main></PermissionGuard>;
 return <PermissionGuard module="hr" permission={pagePermission} fallback={fallback}><main className={`content ds-page ${styles.page}`}>
  <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">员工档案 · 玉舟历史兼容</span><h1>{unclaimed?"待认领档案":"旧系统资料"}</h1><p>{unclaimed?"仅人力资源部可见。未建立稳定人员映射的资料保留在隔离区，不按姓名猜测、不自动创建账号。":"旧系统资料按现有员工授权范围展示安全投影；原始敏感内容继续保存在加密对象中。"}</p></div><div className={styles.heroActions}><Link className="ds-button ds-button-secondary" href="/hr/employees">返回员工档案</Link>{!unclaimed&&hasAnyPermission(user,[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_UNCLAIMED_READ])?<Link className="ds-button" href="/hr/employees/unclaimed">查看待认领档案</Link>:null}</div></section>
  <section className="ds-panel"><div className={styles.filters}><label className="form-field"><span>搜索资料标题</span><input type="search" value={keyword} onChange={event=>setKeyword(event.target.value)} maxLength={100} placeholder="仅搜索安全标题"/></label><label className="form-field"><span>归属状态</span><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(statusLabels).filter(([value])=>!unclaimed||value==="archive_only"||value==="quarantine").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>资料类型</span><input value={recordType} onChange={event=>setRecordType(event.target.value)} maxLength={64} placeholder="例如 employee_profile"/></label></div><span className="status-pill">共 {total} 条安全投影</span></section>
  {message?<p className="form-error" role="alert">{message}</p>:null}
  <section className="ds-panel"><div className="ds-mobile-record-list">{loading?<p>正在加载…</p>:rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}><div className={styles.recordHeading}><strong>{row.displayTitle}</strong><span className="status-pill">{statusLabels[row.mappingStatus]??row.mappingStatus}</span></div><span>{row.recordType} · {row.occurredOn??"日期未登记"}</span><span>{row.employeeId?"已通过稳定源身份归属员工":"未归属员工"}</span><button className="ds-button" type="button" onClick={()=>void showDetail(row)}>查看安全详情</button></article>):<p>{unclaimed?"当前没有待认领资料。":"当前权限范围内暂无旧系统资料。"}</p>}</div></section>
  {selected?<section className="ds-panel"><div className={styles.detailHeading}><div><span className="ds-eyebrow">安全投影</span><h2>{selected.displayTitle}</h2></div><button className="ds-button" type="button" onClick={()=>setSelected(null)}>关闭详情</button></div><dl className={styles.projection}>{Object.entries(selected.projection).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{formatValue(value)}</dd></div>)}</dl>{selected.hasSensitiveSource?<p className={styles.notice}>该资料存在加密原始对象；本页面不返回对象地址或旧系统原文。</p>:null}{selected.files?.length?<><h3>逻辑文件</h3><div className="ds-mobile-record-list">{selected.files.map(file=><article className="ds-mobile-record" key={file.id}><strong>{file.logicalName}</strong><span>{file.logicalKind} · {file.mediaType??"类型未知"}</span><span>{file.sizeBytes??"0"} 字节 · {file.availability}</span></article>)}</div></>:null}</section>:null}
 </main></PermissionGuard>;
}
