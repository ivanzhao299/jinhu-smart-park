"use client";

import { useEffect, useRef, useState } from "react";
import { LocalFilePicker } from "../../../components/files/LocalFilePicker";
import { downloadCsv } from "../../../lib/scoped-csv-export";
import { hrLoadErrorMessage } from "../hr-errors";
import { decodePayrollInputCsv, payrollInputCsv, previewPayrollInputCsv, validatePayrollInputCsvFile,
  PAYROLL_INPUT_CSV_ACCEPT, type PayrollSheetContext, type PayrollSheetEmployee, type PayrollSheetPreview } from "./payroll-input-csv";
import styles from "./payroll-modern.module.css";

type Props = {
  context: PayrollSheetContext; employees: readonly PayrollSheetEmployee[]; draftKey: string; disabled: boolean;
  onApply: (preview: PayrollSheetPreview) => boolean;
};
export function PayrollInputBulkCsv(props: Props) {
  if (!props.employees.length || !Object.keys(props.employees[0]!.directItems).length) return null;
  return <BulkWorkspace key={props.context.binding} {...props} />;
}
function BulkWorkspace({ context, employees, draftKey, disabled, onApply }: Props) {
  const [file, setFile] = useState<File | null>(null), [working, setWorking] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [confirmed, setConfirmed] = useState(false), [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ identity: string; result: PayrollSheetPreview } | null>(null);
  const identity = JSON.stringify([context, employees, draftKey]), latest = useRef({ identity, disabled });
  latest.current = { identity, disabled };
  const alive = useRef(true), operation = useRef(0), lock = useRef(false), reader = useRef<FileReader | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current++; reader.current?.abort(); }; }, []);
  useEffect(() => {
    operation.current++; reader.current?.abort(); lock.current = false;
    setWorking(false); setPreview(null); setConfirmed(false); setError(""); setNotice("");
  }, [identity, disabled]);
  const begin = () => {
    if (latest.current.disabled || lock.current) return null;
    lock.current = true; const run = { identity: latest.current.identity, number: ++operation.current };
    setWorking(true); setError(""); setNotice(""); setPreview(null); setConfirmed(false); return run;
  };
  const current = (run: { identity: string; number: number }) => alive.current && operation.current === run.number
    && latest.current.identity === run.identity && !latest.current.disabled;
  const finish = (run: { number: number }) => { if (alive.current && operation.current === run.number) { lock.current = false; setWorking(false); } };
  const exportSheet = async () => {
    const run = begin(); if (!run) return;
    try {
      const csv = await payrollInputCsv(context, employees); if (!current(run)) return;
      downloadCsv(csv, `工资输入-${context.month}.csv`);
      setNotice(`已生成 ${employees.length} 位员工的录入表。请保留表头及前三列，金额按文本填写。`);
    } catch (cause) { if (current(run)) setError(hrLoadErrorMessage(cause, "生成工资录入表失败")); }
    finally { finish(run); }
  };
  const selectFile = (next: File | null) => {
    if (disabled || lock.current) return;
    operation.current++; reader.current?.abort(); setPreview(null); setConfirmed(false); setNotice(""); setError("");
    try { if (next) validatePayrollInputCsvFile(next); setFile(next); }
    catch (cause) { setFile(null); setError(hrLoadErrorMessage(cause, "请选择有效 CSV 文件")); }
  };
  const readPreview = async () => {
    if (!file) return;
    const run = begin(); if (!run) return;
    try {
      validatePayrollInputCsvFile(file);
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const active = new FileReader(); reader.current = active;
        active.onload = () => {
          if (active.result === null || typeof active.result === "string") reject(new Error("读取 CSV 文件失败。"));
          else resolve(active.result);
        };
        active.onerror = () => reject(new Error("读取 CSV 文件失败，请重新选择。"));
        active.onabort = () => reject(new Error("CSV 读取已取消。"));
        active.readAsArrayBuffer(file);
      });
      if (!current(run)) return;
      const result = await previewPayrollInputCsv(decodePayrollInputCsv(bytes), context, employees);
      if (!current(run)) return;
      setPreview({ identity: run.identity, result }); setPage(1);
    } catch (cause) { if (current(run)) setError(hrLoadErrorMessage(cause, "CSV 预览失败，当前草稿已保留。")); }
    finally { finish(run); }
  };
  const active = preview?.identity === identity && !disabled ? preview.result : null;
  const visible: Array<{ employee: PayrollSheetEmployee; code: string; before: string; after: string }> = [];
  if (active) {
    let ordinal = 0;
    outer: for (const [index, employee] of employees.entries()) for (const [code, before] of Object.entries(employee.directItems)) {
      const after = active.updates[index]!.directItems[code]!;
      if (after === before) continue;
      if (ordinal >= (page - 1) * 20) visible.push({ employee, code, before, after });
      ordinal++;
      if (visible.length === 20) break outer;
    }
  }
  return <section className={`ds-panel ${styles.workspace} ${styles.bulkInput}`} aria-label="工资输入批量准备">
    <h4>批量填写当前工资输入</h4><p>{context.month} · {context.ruleName} · {context.revisionLabel} · 全部 {employees.length} 位员工</p>
    <p>先导出当前录入表，金额列按文本填写以保留精度。保留校验信息、表头和前三列；空白保留当前值，零值请明确填写 0。预览并确认后仅带入当前草稿，再检查和保存。</p>
    <button type="button" className="secondary-button" disabled={disabled || working} onClick={() => void exportSheet()}>导出工资输入表</button>
    <LocalFilePicker accept={PAYROLL_INPUT_CSV_ACCEPT} buttonLabel="选择工资输入 CSV" description="UTF-8 CSV · 最大 32 MiB · 选择后手动预览"
      fileName={file?.name} disabled={disabled || working} onSelect={selectFile} />
    <button type="button" className="secondary-button" disabled={disabled || working || !file} onClick={() => void readPreview()}>{working ? "正在准备录入表…" : "预览整份录入表"}</button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {active ? <>
      <p role="status">完整校验 {employees.length} 位员工，将更新 {active.changedEmployees} 位员工的 {active.changedCells} 个金额；空白保留当前值。</p>
      <div className={`ds-mobile-record-list ${styles.records}`}>{visible.map(change => <article className="ds-mobile-record" key={`${change.employee.employeeId}:${change.code}`}>
        <strong>{change.employee.fullName ?? "员工信息暂不可用"} · {change.employee.employeeCode ?? "编号暂不可用"}</strong><span>{change.code}</span>
        <dl className={styles.amounts}><div className={styles.amountRow}><dt>当前草稿</dt><dd>{change.before || "未填写"}</dd></div><div className={styles.amountRow}><dt>表内金额</dt><dd>{change.after}</dd></div></dl>
      </article>)}</div>
      <div className={styles.actions}><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>变更上一页</button><span>变更第 {page} / {Math.max(1, Math.ceil(active.changedCells / 20))} 页 · 共 {active.changedCells} 项</span><button type="button" className="secondary-button" disabled={page * 20 >= active.changedCells} onClick={() => setPage(value => value + 1)}>变更下一页</button></div>
      <label><input type="checkbox" checked={confirmed} disabled={!active.changedCells || working} onChange={event => setConfirmed(event.target.checked)} />我已核对整份变更，将表中已填写金额带入当前草稿，空白保留原值</label>
      <button type="button" className="primary-button" disabled={!confirmed || !active.changedCells || working} onClick={() => {
        if (!preview || preview.identity !== latest.current.identity || latest.current.disabled || lock.current || !confirmed) return;
        if (!onApply(preview.result)) setError("当前草稿已变化或正在保存，请重新预览。");
        setPreview(null); setConfirmed(false);
      }}>带入当前草稿</button>
    </> : null}
  </section>;
}
