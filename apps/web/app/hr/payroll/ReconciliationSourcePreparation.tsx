"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import { hrApi, type HrPayrollReconciliationSetup, type HrPayrollReconciliationSource, type HrPayrollReconciliationSourcePreview, type HrPayrollReconciliationSourcePeriod } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";

export function ReconciliationSourcePreparation({ setup, onPrepared }: {
  setup: HrPayrollReconciliationSetup;
  onPrepared: (source: HrPayrollReconciliationSource) => void;
}) {
  const user = useAuthUser();
  const authContext = `${user?.id ?? ""}:${user?.tenant_id ?? ""}:${user?.park_id ?? ""}:${[...(user?.permissions ?? [])].sort().join(",")}`;
  return <ReconciliationSourcePreparationWorkspace key={authContext} setup={setup} onPrepared={onPrepared} authContext={authContext} />;
}

function ReconciliationSourcePreparationWorkspace({ setup, onPrepared, authContext }: {
  setup: HrPayrollReconciliationSetup;
  onPrepared: (source: HrPayrollReconciliationSource) => void;
  authContext: string;
}) {
  const [batch, setBatch] = useState("");
  const [book, setBook] = useState("");
  const [month, setMonth] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<HrPayrollReconciliationSourcePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [periods,setPeriods]=useState<HrPayrollReconciliationSourcePeriod[]>([]),[periodTotal,setPeriodTotal]=useState(0),[periodPage,setPeriodPage]=useState(1),[periodLoading,setPeriodLoading]=useState(false),[periodError,setPeriodError]=useState("");
  const generation = useRef(0), abort = useRef<AbortController | null>(null), periodGeneration=useRef(0),periodAbort=useRef<AbortController|null>(null), writing = useRef(false), mounted = useRef(true), authContextRef=useRef(authContext);
  authContextRef.current=authContext;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++;periodGeneration.current++; abort.current?.abort();periodAbort.current?.abort(); }; }, []);
  const invalidate = () => { generation.current++;periodGeneration.current++; abort.current?.abort();periodAbort.current?.abort(); setPreview(null); setConfirmed(false); setMessage(""); setBusy(false);setPeriods([]);setPeriodTotal(0);setPeriodPage(1);setPeriodError(""); };
  const invalidatePreview=()=>{generation.current++;abort.current?.abort();setPreview(null);setConfirmed(false);setMessage("");setBusy(false);};
  const loadPeriods=async(page=1)=>{if(!batch||!book||writing.current)return;periodAbort.current?.abort();const current=++periodGeneration.current,controller=new AbortController(),context=`${authContext}:${batch}:${book}`;periodAbort.current=controller;setPeriodLoading(true);setPeriodError("");try{const data=await hrApi.payrollReconciliationSourcePeriods({legacyBatchId:batch,bookId:book},getAccessToken(),page,50,controller.signal);const valid=Array.isArray(data.items)&&data.page===page&&data.pageSize===50&&Number.isInteger(data.total)&&data.total>=0&&data.items.every(item=>/^\d{4}-(0[1-9]|1[0-2])-01$/.test(item.periodMonth)&&[item.recordCount,item.mappedRecordCount,item.unmappedRecordCount,item.mappedEmployeeCount,item.mappedItemCount].every(Number.isInteger));if(!valid)throw new Error("可用月份响应无效，请重试。");if(mounted.current&&current===periodGeneration.current&&context===`${authContextRef.current}:${batch}:${book}`){setPeriods(data.items);setPeriodTotal(data.total);setPeriodPage(data.page);}}catch(error){if(mounted.current&&current===periodGeneration.current&&!controller.signal.aborted)setPeriodError(error instanceof Error?error.message:"读取可用月份失败，请重试。");}finally{if(mounted.current&&current===periodGeneration.current)setPeriodLoading(false);}};
  useEffect(()=>{invalidate();},[authContext]);
  useEffect(()=>{if(batch&&book)void loadPeriods(1);},[batch,book,authContext]);
  const inspect = async () => {
    if (!batch || !book || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || writing.current) return;
    abort.current?.abort();
    const current = ++generation.current, controller = new AbortController(), context=`${authContext}:${batch}:${book}:${month}`;
    abort.current = controller; setBusy(true); setPreview(null); setConfirmed(false); setMessage("");
    try {
      const data = await hrApi.previewPayrollReconciliationSource({ legacyBatchId: batch, bookId: book, periodMonth: `${month}-01` }, getAccessToken(), controller.signal);
      const valid=data.legacyBatchId===batch&&data.bookId===book&&data.periodMonth===`${month}-01`;
      if(!valid) throw new Error("预览响应与当前选择不一致，请重新预览。");
      if (mounted.current && current === generation.current && context===`${authContextRef.current}:${batch}:${book}:${month}`) setPreview(data);
    } catch (error) {
      if (mounted.current && current === generation.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : "预览失败，请重试。");
    } finally { if (mounted.current && current === generation.current) setBusy(false); }
  };
  const freeze = async () => {
    if (!preview || !confirmed || !reason.trim() || writing.current) return;
    writing.current = true; setBusy(true); setMessage("");
    let source: HrPayrollReconciliationSource;
    try {
      const { legacyBatchId, bookId, periodMonth, bindingSha256, sourceSha256, snapshotCount, itemCount } = preview;
      const input = { legacyBatchId, bookId, periodMonth, bindingSha256, sourceSha256, snapshotCount, itemCount };
      source = await hrApi.createPayrollReconciliationSource({ ...input, reason: reason.trim() }, getAccessToken());
    } catch (error) {
      if (mounted.current) { setPreview(null); setConfirmed(false); setMessage(error instanceof Error ? error.message : "冻结失败，请重新预览。"); }
      writing.current = false; if (mounted.current) setBusy(false); return;
    }
    writing.current = false;
    if (!mounted.current) return;
    setBusy(false); setPreview(null); setConfirmed(false); setMessage("来源已冻结，可用于双轨模拟，未发布历史工资或触发发薪。");
    onPrepared({ ...source, bookName: setup.books.find((item) => item.id === source.bookId)?.bookName });
  };
  return <section className={`ds-panel ${styles.sourcePreparation}`}>
    <div className={styles.sectionHeading}><div><span className="ds-eyebrow">SOURCE PREPARATION</span><h2>准备工资核对来源</h2></div></div>
    <p>选择账套与月份，准备本次只算不发的核对依据；不会改变正式工资结果或发薪。</p>
    <div className={styles.formGrid}>
      <label className="form-field"><span>已导入来源</span><select value={batch} disabled={writing.current} onChange={(event) => { invalidate(); setBatch(event.target.value); }}><option value="">请选择来源</option>{setup.sourceBatches?.map((item, index) => <option key={item.id} value={item.id}>导入来源 {index + 1} · {item.recordCount} 条记录</option>)}</select></label>
      <label className="form-field"><span>工资账套</span><select value={book} disabled={writing.current} onChange={(event) => { invalidate(); setBook(event.target.value); }}><option value="">请选择账套</option>{setup.books.map((item) => <option key={item.id} value={item.id}>{item.bookName}</option>)}</select></label>
      <label className="form-field"><span>核对月份</span><input type="month" value={month} disabled={writing.current} onChange={(event) => { invalidatePreview(); setMonth(event.target.value); }} /></label>
      <button type="button" className="ds-button" disabled={busy || !batch || !book || !month} onClick={() => void inspect()}>预览来源</button>
    </div>
    {batch&&book?<section className={`ds-mobile-record-list ${styles.sourcePeriodList}`}><p>以下为该来源和账套实际有记录的月份；最新仅表示最新有数据，不代表完整或可直接冻结。</p>{periodLoading?<p>正在读取可用月份…</p>:null}{periodError?<><p role="status">{periodError}</p><button className="ds-button ds-button-secondary" type="button" disabled={writing.current} onClick={()=>void loadPeriods(periodPage)}>重试读取月份</button></>:null}{periods.map(item=><article className="ds-mobile-record" key={item.periodMonth}><strong>{item.periodMonth.slice(0,7)}</strong><span>{item.recordCount} 条工资记录 · 已关联 {item.mappedRecordCount} · 未关联 {item.unmappedRecordCount}</span><span>{item.mappedEmployeeCount} 位已关联员工 · {item.mappedItemCount} 项已关联明细</span><button type="button" className="ds-button ds-button-secondary" disabled={writing.current} onClick={()=>{invalidatePreview();setMonth(item.periodMonth.slice(0,7));}}>使用此月份</button></article>)}{!periodLoading&&!periodError&&!periods.length?<p>该来源和账套没有可用工资月份。</p>:null}{periodTotal>50?<div className={styles.actionRow}><button className="ds-button ds-button-secondary" type="button" disabled={writing.current||periodPage===1||periodLoading} onClick={()=>void loadPeriods(periodPage-1)}>上一页</button><span>第 {periodPage} 页，共 {Math.ceil(periodTotal/50)} 页</span><button className="ds-button ds-button-secondary" type="button" disabled={writing.current||periodLoading||periodPage*50>=periodTotal} onClick={()=>void loadPeriods(periodPage+1)}>下一页</button></div>:null}</section>:null}
    {preview ? <div className="ds-mobile-record">
      <strong>{setup.books.find((item) => item.id === preview.bookId)?.bookName} · {preview.periodMonth.slice(0, 7)}</strong>
      <span>{preview.snapshotCount} 条工资记录 · {preview.employeeCount} 位已关联员工 · {preview.itemCount} 项明细</span>
      <label className="form-field"><span>核对说明</span><textarea maxLength={1000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <label className={styles.sourceConfirmation}><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /> 已核对账套、月份及记录数量</label>
      <button type="button" className="ds-button ds-button-primary" disabled={busy || !confirmed || !reason.trim()} onClick={() => void freeze()}>冻结核对来源</button>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
