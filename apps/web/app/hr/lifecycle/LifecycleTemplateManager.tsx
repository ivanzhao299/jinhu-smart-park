"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {hrApi,type HrLifecycleTemplate,type HrLifecycleTemplateDetail} from "../../../lib/hr-api";
import {getAccessToken} from "../../../lib/authz";
import {hrLoadErrorMessage} from "../hr-errors";
import {LifecycleTemplateEditor} from "./LifecycleTemplateEditor";
import {lifecycleTemplateDetail,lifecycleTemplateSummaries} from "./lifecycle-template-data";
import styles from "./lifecycle-template.module.css";
export function LifecycleTemplateManager({onSaved}:{onSaved:()=>Promise<void>|void}){
 const [rows,setRows]=useState<HrLifecycleTemplate[]>([]),[detail,setDetail]=useState<HrLifecycleTemplateDetail|null>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState(""),[detailError,setDetailError]=useState(""),[success,setSuccess]=useState("");
 const alive=useRef(true),editGeneration=useRef(0),renderedGeneration=editGeneration.current;
 const listAbort=useRef<AbortController|null>(null),detailAbort=useRef<AbortController|null>(null),selectedId=useRef("");
 const load=useCallback(async()=>{const controller=new AbortController();listAbort.current?.abort();listAbort.current=controller;setLoading(true);setError("");try{const result=await hrApi.lifecycleTemplates(getAccessToken(),controller.signal);if(!controller.signal.aborted&&listAbort.current===controller)setRows(lifecycleTemplateSummaries(result));}catch(e){if(!controller.signal.aborted&&listAbort.current===controller)setError(hrLoadErrorMessage(e,"加载模板管理列表失败"));}finally{if(!controller.signal.aborted&&listAbort.current===controller)setLoading(false);}},[]);
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;listAbort.current?.abort();detailAbort.current?.abort();};},[load]);
 const open=async(id:string)=>{editGeneration.current++;detailAbort.current?.abort();selectedId.current=id;setDetail(null);setDetailError("");setSuccess("");const controller=new AbortController();detailAbort.current=controller;setDetailLoading(true);try{const result=await hrApi.lifecycleTemplateDetail(id,getAccessToken(),controller.signal);if(!controller.signal.aborted&&detailAbort.current===controller&&selectedId.current===id)setDetail(lifecycleTemplateDetail(result,id));}catch(e){if(!controller.signal.aborted&&detailAbort.current===controller)setDetailError(hrLoadErrorMessage(e,"加载模板版本失败"));}finally{if(!controller.signal.aborted&&detailAbort.current===controller)setDetailLoading(false);}};
 const close=()=>{editGeneration.current++;detailAbort.current?.abort();detailAbort.current=null;selectedId.current="";setDetail(null);setDetailLoading(false);setDetailError("");setSuccess("");};
 const saved=async()=>{await load();if(alive.current)await onSaved();};
 return <>
  <section className="ds-panel"><h2>发布清单模板</h2><LifecycleTemplateEditor onSaved={saved}/></section>
  <section className="ds-panel"><h2>清单模板版本</h2><button type="button" className="ds-button" disabled={loading} onClick={()=>void load()}>刷新模板版本</button>{error?<p className="form-error" role="alert">{error}</p>:null}
   <div className={styles.records}>{loading?<p>正在加载模板…</p>:rows.length?rows.map(row=><article className={`ds-mobile-record ${styles.record}`} key={row.id}><strong>{row.name}</strong><span>{row.code} · {row.type==="onboarding"?"入职":"离职"} · V{row.versionNo} · {row.itemCount}项</span><button type="button" className="ds-button" onClick={()=>void open(row.id)}>编辑{row.name}新版本</button></article>):!error?<p>尚未发布清单模板。</p>:null}</div>
   {detailLoading?<p role="status">正在加载模板版本…</p>:null}
   {detailError?<p className="form-error" role="alert">{detailError}<button type="button" className="ds-button" onClick={()=>void open(selectedId.current)}>重试模板版本</button></p>:null}
   {(detail||detailLoading||detailError)?<button type="button" className="ds-button" onClick={close}>关闭模板编辑</button>:null}
   {success?<p role="status">{success}</p>:null}
   {detail?<div><h3>{detail.name} · 新版本草稿</h3><LifecycleTemplateEditor key={detail.versionId} template={detail} onSaved={async()=>{const id=detail.id;await saved();if(!alive.current||selectedId.current!==id||editGeneration.current!==renderedGeneration)return;await open(id);if(!alive.current||selectedId.current!==id||editGeneration.current!==renderedGeneration+1)return;setSuccess("新版本已发布；既有清单保留原版本快照。");}}/></div>:null}
  </section>
 </>;
}
