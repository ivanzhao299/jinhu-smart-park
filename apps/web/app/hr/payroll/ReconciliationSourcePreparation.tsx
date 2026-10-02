"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrPayrollReconciliationSetup, type HrPayrollReconciliationSource, type HrPayrollReconciliationSourcePreview } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";

export function ReconciliationSourcePreparation({ setup, onPrepared }: {
  setup: HrPayrollReconciliationSetup;
  onPrepared: (source: HrPayrollReconciliationSource) => void;
}) {
  const [batch, setBatch] = useState("");
  const [book, setBook] = useState("");
  const [month, setMonth] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<HrPayrollReconciliationSourcePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0), abort = useRef<AbortController | null>(null), writing = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; abort.current?.abort(); }; }, []);
  const invalidate = () => { generation.current++; abort.current?.abort(); setPreview(null); setConfirmed(false); setMessage(""); setBusy(false); };
  const inspect = async () => {
    if (!batch || !book || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || writing.current) return;
    abort.current?.abort();
    const current = ++generation.current, controller = new AbortController();
    abort.current = controller; setBusy(true); setPreview(null); setConfirmed(false); setMessage("");
    try {
      const data = await hrApi.previewPayrollReconciliationSource({ legacyBatchId: batch, bookId: book, periodMonth: `${month}-01` }, getAccessToken(), controller.signal);
      if (mounted.current && current === generation.current) setPreview(data);
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
    <div className={styles.sectionHeading}><div><span className="ds-eyebrow">HISTORICAL SOURCE</span><h2>准备历史工资核对来源</h2></div></div>
    <p>选择账套与月份，仅冻结该期间的核对记录。历史数据保持原有发布状态。</p>
    <div className={styles.formGrid}>
      <label className="form-field"><span>已导入历史来源</span><select value={batch} disabled={writing.current} onChange={(event) => { invalidate(); setBatch(event.target.value); }}><option value="">请选择历史来源</option>{setup.sourceBatches?.map((item, index) => <option key={item.id} value={item.id}>导入来源 {index + 1} · {item.recordCount} 条记录</option>)}</select></label>
      <label className="form-field"><span>工资账套</span><select value={book} disabled={writing.current} onChange={(event) => { invalidate(); setBook(event.target.value); }}><option value="">请选择账套</option>{setup.books.map((item) => <option key={item.id} value={item.id}>{item.bookName}</option>)}</select></label>
      <label className="form-field"><span>核对月份</span><input type="month" value={month} disabled={writing.current} onChange={(event) => { invalidate(); setMonth(event.target.value); }} /></label>
      <button type="button" className="ds-button" disabled={busy || !batch || !book || !month} onClick={() => void inspect()}>预览来源</button>
    </div>
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
