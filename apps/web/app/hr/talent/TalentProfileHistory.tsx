"use client";
import {useCallback,useEffect,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrTalentProfile} from "../../../lib/hr-api";
import {useHrResource} from "../use-hr-resource";
import styles from "./hr-talent.module.css";

type ProfilePage={items:HrTalentProfile[];total:number;employeeCount:number;page:number;page_size:number};
const sourceObject=(value:unknown)=>value===null||(typeof value==="object"&&!Array.isArray(value));
function checkedPage(value:ProfilePage,page:number){
 if(!value||value.page!==page||value.page_size!==20||!Number.isSafeInteger(value.total)||value.total<0||!Number.isSafeInteger(value.employeeCount)||value.employeeCount<0||value.employeeCount>value.total||(value.total>0&&value.employeeCount===0)||!Array.isArray(value.items)||value.items.length>20||value.items.length>value.total||new Set(value.items.map(row=>row?.id)).size!==value.items.length||((page-1)*20>=value.total&&value.items.length>0)||value.items.some(row=>!row||typeof row.id!=="string"||!row.id.trim()||typeof row.employeeName!=="string"||typeof row.employeeCode!=="string"||typeof row.asOfDate!=="string"||typeof row.createdAt!=="string"||!Number.isSafeInteger(row.snapshotNo)||row.snapshotNo<1||!sourceObject(row.performanceSource)||!sourceObject(row.feedbackSource)))throw Error("人才画像分页响应无效，请重试。");
 return value;
}
export function TalentProfileHistory({busy,refreshKey,onEmployeeCount}:{busy:boolean;refreshKey:number;onEmployeeCount:(count:number|null)=>void}){
 const [page,setPage]=useState(1),[draft,setDraft]=useState(""),[keyword,setKeyword]=useState("");
 const read=useCallback((signal:AbortSignal)=>hrApi.talentProfilePage(page,keyword,getAccessToken(),signal).then(value=>checkedPage(value,page)),[page,keyword,refreshKey]);
 const resource=useHrResource(true,read,"读取人才画像失败");
 useEffect(()=>{onEmployeeCount(resource.loading||resource.error?null:resource.data?.employeeCount??null);},[resource.data,resource.loading,resource.error,onEmployeeCount]);
 useEffect(()=>{if(resource.data&&page>Math.max(1,Math.ceil(resource.data.total/20)))setPage(1);},[resource.data,page]);
 const search=()=>{const next=draft.trim();if(page===1&&next===keyword)void resource.load();else{setPage(1);setKeyword(next);}};
 const pages=Math.max(1,Math.ceil((resource.data?.total??0)/20));
 return <section className="ds-panel" aria-label="人才画像历史">
  <div className={styles.profileControls}><div><span className="ds-eyebrow">冻结档案</span><h2>人才画像</h2></div><label className="form-field"><span>搜索人才画像</span><input type="search" maxLength={100} placeholder="姓名或员工编号" disabled={busy} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();if(!busy)search();}}}/></label></div>
  <nav className={styles.profilePages} aria-label="人才画像分页">
   <button type="button" className="ds-button ds-button-secondary" disabled={busy} onClick={search}>搜索画像</button>
   <button type="button" className="ds-button ds-button-secondary" disabled={busy||resource.loading||!!resource.error||page<=1} onClick={()=>setPage(page-1)}>画像上一页</button>
   <span role="status">{resource.loading?"正在读取人才画像…":resource.error?"画像读取未完成":`第 ${page} / ${pages} 页 · 共 ${resource.data?.total??0} 条画像 · 涉及 ${resource.data?.employeeCount??0} 人`}</span>
   <button type="button" className="ds-button ds-button-secondary" disabled={busy||resource.loading||!!resource.error||!resource.data||page>=pages} onClick={()=>setPage(page+1)}>画像下一页</button>
   <button type="button" className="ds-button ds-button-secondary" disabled={busy||resource.loading} onClick={()=>void resource.load()}>刷新画像</button>
  </nav>
  {resource.error?<div role="alert"><p className="form-error">{resource.error}</p><button type="button" className="ds-button ds-button-secondary" disabled={busy||resource.loading} onClick={()=>void resource.load()}>重试画像</button></div>:null}
  {resource.data?<div className={`ds-scene-grid ${styles.records}`}>{resource.data.items.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.employeeName} · {row.employeeCode}</strong><span>数据时点 {row.asOfDate} · 第 {row.snapshotNo} 版</span><span>绩效：{String(row.performanceSource?.finalLevelCode??"暂无已确认结果")} · 360：{String(row.feedbackSource?.cycleName??"暂无已发布结果")}</span></article>)}{!resource.data.items.length?<p>当前条件下没有可见的人才画像。</p>:null}</div>:null}
 </section>;
}
