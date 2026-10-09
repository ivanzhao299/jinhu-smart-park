"use client";
import {useCallback,useEffect,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrPerformanceRewardEvidencePage} from "../../../lib/hr-api";
import {useHrResource} from "../use-hr-resource";
import styles from "../hr-workbench.module.css";
import templateStyles from "./performance-template.module.css";
function checked(x:HrPerformanceRewardEvidencePage,id:string,page:number){
 if(!x||x.reviewId!==id||x.page!==page||x.page_size!==20||!Number.isSafeInteger(x.total)||x.total<0||!Array.isArray(x.items)||x.items.length!==Math.min(20,Math.max(0,x.total-(page-1)*20))||new Set(x.items.map(r=>r?.id)).size!==x.items.length||x.items.some(r=>!r||typeof r.id!=="string"||!r.id||!Number.isSafeInteger(r.sourceVersion)||r.sourceVersion<1||typeof r.capturedAt!=="string"||(r.caseCode!==null&&(typeof r.caseCode!=="string"||!r.caseCode||r.caseCode.length>64))||(r.kind!==null&&r.kind!=="reward"&&r.kind!=="discipline")||(r.occurredOn!==null&&(typeof r.occurredOn!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn)))))throw Error("奖惩依据响应无效，请重新读取。");
 return x;
}
export function PerformanceRewardEvidence({id,employeeName,cycleName,onClose}:{id:string;employeeName:string;cycleName:string;onClose:()=>void}){
 const [page,setPage]=useState(1);
 const read=useCallback((signal:AbortSignal)=>hrApi.performanceRewardEvidence(id,page,getAccessToken(),signal).then(x=>checked(x,id,page)),[id,page]);
 const resource=useHrResource(true,read,"读取绩效奖惩依据失败"),pages=Math.max(1,Math.ceil((resource.data?.total??0)/20));
 useEffect(()=>{if(resource.data&&page>pages)setPage(pages);},[page,pages,resource.data]);
 return <section className={`ds-panel ${templateStyles.editor} ${templateStyles.reviewWorkbench}`} aria-label="绩效奖惩依据"><div className={styles.sectionHeading}><div><h2>奖惩依据</h2><p>{employeeName} · {cycleName}</p></div><button className="ds-button" type="button" onClick={onClose}>关闭奖惩依据</button></div><p>以下为本次绩效发布时保存的奖惩记录版本，供评价参考；评分仍按评价流程办理。</p>
 {resource.loading?<p role="status">正在读取奖惩依据…</p>:null}{resource.error?<p role="alert">{resource.error}</p>:null}
 {resource.data?<><div className={`ds-mobile-record-list ${templateStyles.records}`}>{resource.data.items.length?resource.data.items.map(r=><article key={r.id} className="ds-mobile-record"><div><strong>{r.caseCode??"奖惩编号待核对"}</strong><p>{r.kind==="reward"?"奖励":r.kind==="discipline"?"处分":"类别待核对"} · 发生日期 {r.occurredOn??"待核对"}</p><span>来源版本 {r.sourceVersion} · 保存于 {r.capturedAt}</span></div></article>):<p>本次绩效未保存奖惩依据。</p>}</div><nav className={styles.recordActions} aria-label="奖惩依据分页"><button type="button" className="ds-button" disabled={page<=1} onClick={()=>setPage(page-1)}>奖惩依据上一页</button><span>第 {page} / {pages} 页 · 共 {resource.data.total} 条</span><button type="button" className="ds-button" disabled={page>=pages} onClick={()=>setPage(page+1)}>奖惩依据下一页</button></nav></>:null}
 <button type="button" className="ds-button" disabled={resource.loading} onClick={()=>void resource.load()}>重新读取奖惩依据</button></section>;
}
