"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePreparedProfileCatalog, type PreparedPackageSelection, type PreparedProfileCatalog } from "../import-workbench";
import styles from "./imports.module.css";
const statusLabels:Record<string,string>={ready:"待预览",previewed:"已预览，待提交",committed:"已完成",conflicted:"存在冲突，需核对"};

export function PreparedProfileBatches({load,select,disabled,refreshKey,isCurrent}:{
  load:()=>Promise<unknown>;select:(selection:PreparedPackageSelection)=>void;disabled:boolean;refreshKey:string;isCurrent:()=>boolean;
}) {
  const [batches,setBatches]=useState<PreparedProfileCatalog[]>([]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const epoch=++generation.current;setBusy(true);setError("");
    try {const result=normalizePreparedProfileCatalog(await load());if(epoch===generation.current&&isCurrent())setBatches(result);}
    catch {if(epoch===generation.current&&isCurrent()){setBatches([]);setError("服务器批次读取失败，请刷新后重试。");}}
    finally {if(epoch===generation.current&&isCurrent())setBusy(false);}
  },[load,isCurrent]);
  useEffect(()=>{void refresh();},[refresh,refreshKey]);
  return <section className={`ds-panel ${styles.section}`} aria-labelledby="prepared-heading">
    <div><span className="ds-eyebrow">服务器数据</span><h2 id="prepared-heading">已准备的数据批次</h2>
      <p>人员明细保留在服务器。按顺序预览并确认提交每个数据包，前序包完成后才能继续。</p></div>
    <div className={styles.actions}><button type="button" className="ds-button ds-button-secondary" disabled={busy||disabled} onClick={()=>void refresh()}>刷新批次</button></div>
    {error?<p role="alert">{error}</p>:null}
    {busy?<p role="status">正在读取批次摘要…</p>:!batches.length&&!error?<p>当前园区暂无可选择的服务器批次。</p>:null}
    {batches.map((batch,batchIndex)=><div className={styles.section} key={batch.id}>
      <p>批次 {batchIndex+1} · 档案 {batch.sourceProfiles} 份 · 字段补齐 {batch.aliasProfiles} 份</p>
      <div className={styles.records}>{batch.packages.map(entry=><article className="ds-mobile-record" key={entry.index}>
        <strong>数据包 {entry.index+1} · {entry.kind==="baseline"?"来源基线":"字段补齐"} · {entry.itemCount} 条</strong>
        <span>{entry.kind==="baseline"?"认证原始来源，不修改业务字段":`涉及字段：${entry.fields.map(field=>field==="nativePlace"?"籍贯":"学历").join("、")}`}</span>
        <span>{statusLabels[entry.status]}</span>
        <button type="button" className="ds-button ds-button-secondary" disabled={busy||disabled||!entry.canPreview||entry.status==="committed"||entry.status==="conflicted"} onClick={()=>select(entry)}>预览此数据包</button>
        {!entry.canPreview?<span className="ds-field-hint">请先完成前序数据包。</span>:null}
      </article>)}</div>
    </div>)}
  </section>;
}
