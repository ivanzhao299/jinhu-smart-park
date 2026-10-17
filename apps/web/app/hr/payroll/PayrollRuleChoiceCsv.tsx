"use client";

import { useEffect, useRef, useState } from "react";
import type { FormalPayrollSourceReference } from "@jinhu/shared";
import { LocalFilePicker } from "../../../components/files/LocalFilePicker";
import { getAccessToken } from "../../../lib/authz";
import { hrApi } from "../../../lib/hr-api";
import { downloadCsv } from "../../../lib/scoped-csv-export";
import { hrLoadErrorMessage } from "../hr-errors";
import { decodePayrollInputCsv, validatePayrollInputCsvFile, PAYROLL_INPUT_CSV_ACCEPT } from "./payroll-input-csv";
import { payrollRuleChoiceCsv, previewPayrollRuleChoiceCsv, ruleChoiceSummary, type RuleChoices, type RuleChoicePreview } from "./payroll-rule-choice-csv";
import styles from "./payroll-modern.module.css";

type Props = { reference: FormalPayrollSourceReference; choices: RuleChoices; token: string | null; disabled: boolean;
  onSourceError: (message: string) => void; onReplace: (choices: RuleChoices) => void; onWorking: (working: boolean) => void };
export function PayrollRuleChoiceCsv({ reference, choices, token, disabled, onReplace, onWorking, onSourceError }: Props) {
  const identity = JSON.stringify([reference, choices, token]);
  const latest = useRef({ identity, disabled, onReplace }); latest.current = { identity, disabled, onReplace };
  const alive = useRef(true), generation = useRef(0), lock = useRef(false), reader = useRef<FileReader | null>(null), request = useRef<AbortController | null>(null);
  const [working, setWorking] = useState(false), [file, setFile] = useState<File | null>(null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [confirmed, setConfirmed] = useState(false), [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ identity: string; result: RuleChoicePreview } | null>(null);
  const workingCallback = useRef(onWorking); workingCallback.current = onWorking;
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; reader.current?.abort(); request.current?.abort(); }; }, []);
  useEffect(() => {
    generation.current++; reader.current?.abort(); request.current?.abort(); lock.current = false;
    setWorking(false); workingCallback.current(false); setPreview(null); setConfirmed(false); setError(""); setNotice("");
  }, [identity, disabled]);
  const begin = () => {
    if (latest.current.disabled || lock.current) return null;
    lock.current = true; const run = { identity: latest.current.identity, generation: ++generation.current };
    setWorking(true); workingCallback.current(true); setPreview(null); setConfirmed(false); setError(""); setNotice(""); return run;
  };
  const current = (run: { identity: string; generation: number }) => alive.current && generation.current === run.generation
    && latest.current.identity === run.identity && !latest.current.disabled;
  const authorized = () => { if (!token || getAccessToken() !== token) throw new Error("登录状态已变化，请重新读取源资料。"); };
  const finish = (run: { generation: number }) => {
    if (alive.current && generation.current === run.generation) { lock.current = false; setWorking(false); workingCallback.current(false); }
  };
  const freshSource = async () => {
    authorized(); const controller = new AbortController(); request.current = controller;
    const fresh = await hrApi.payrollRuleSourceReference(reference.ruleSetId, token ?? undefined, controller.signal);
    authorized();
    if (controller.signal.aborted || JSON.stringify(fresh) !== JSON.stringify(reference)) throw new Error("源资料已变化或读取已取消，请重新读取源资料及选择表。");
  };
  const exportSheet = async () => {
    const run = begin(); if (!run) return;
    try {
      await freshSource(); if (!current(run)) return;
      const csv = await payrollRuleChoiceCsv(reference, choices); if (!current(run)) return; authorized();
      downloadCsv(csv, `工资规则选择-${reference.book.scheme}.csv`); setNotice(`已导出全部 ${reference.items.length} 个项目版本；未完成用途保留为空，继续填写后再预览。`);
    } catch (cause) { if (current(run)) { const message = hrLoadErrorMessage(cause, "导出选择表失败，原选择已保留。"); setError(message); onSourceError(message); } }
    finally { finish(run); }
  };
  const selectFile = (next: File | null) => {
    if (latest.current.disabled || lock.current) return;
    generation.current++; setPreview(null); setConfirmed(false); setError(""); setNotice("");
    try { if (next) validatePayrollInputCsvFile(next); setFile(next); }
    catch (cause) { setFile(null); setError(hrLoadErrorMessage(cause, "请选择有效 CSV 文件。")); }
  };
  const read = async () => {
    if (!file) return;
    const run = begin(); if (!run) return;
    try {
      authorized(); validatePayrollInputCsvFile(file);
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const active = new FileReader(); reader.current = active;
        active.onload = () => typeof active.result === "object" && active.result !== null ? resolve(active.result) : reject(new Error("读取 CSV 失败。"));
        active.onerror = () => reject(new Error("读取 CSV 失败，请重新选择。")); active.onabort = () => reject(new Error("CSV 读取已取消。"));
        active.readAsArrayBuffer(file);
      });
      if (!current(run)) return; authorized();
      const result = await previewPayrollRuleChoiceCsv(decodePayrollInputCsv(bytes), reference, choices);
      if (!current(run)) return; authorized(); setPreview({ identity: run.identity, result }); setPage(1);
    } catch (cause) { if (current(run)) setError(hrLoadErrorMessage(cause, "选择表预览失败，原选择已保留。")); }
    finally { finish(run); }
  };
  const apply = async () => {
    if (!preview || preview.identity !== latest.current.identity || !confirmed) return;
    const result = preview.result, run = begin(); if (!run) return;
    try {
      await freshSource(); if (!current(run)) return; authorized();
      latest.current.onReplace(result.choices);
    } catch (cause) { if (current(run)) { const message = hrLoadErrorMessage(cause, "选择表未应用，原选择已保留。"); setError(message); onSourceError(message); } }
    finally { finish(run); }
  };
  const active = preview?.identity === identity && !disabled ? preview.result : null;
  return <section className={`ds-panel ${styles.workspace}`} aria-label="工资规则选择表">
    <h4>批量准备规则选择</h4>
    <p>选择表覆盖全部 {reference.items.length} 个项目版本。仅填写最后六列：选择填“纳入”或“排除”；空白选择且其他字段全空时保留当前选择。用途填收入、扣款、税额、应发汇总、实发汇总、单位承担或参考数量；来源填直接录入、原公式或人工改写。原公式必须填写准确编号和版本，带原条件的公式需人工处理。改写最多 2000 字，按文本填写。</p>
    <p>读取和预览保留当前选择。确认后重新核对完整源资料，仅替换本地选择；随后仍须带入草稿、保存及独立复核。</p>
    <button type="button" className="secondary-button" disabled={disabled || working} onClick={() => void exportSheet()}>导出规则选择表</button>
    <LocalFilePicker accept={PAYROLL_INPUT_CSV_ACCEPT} buttonLabel="选择规则选择 CSV" description="UTF-8 CSV · 最大 32 MiB · 保留全部只读列和全部项目行" fileName={file?.name} disabled={disabled || working} onSelect={selectFile} />
    <button type="button" className="secondary-button" disabled={disabled || working || !file} onClick={() => void read()}>{working ? "正在核对选择表…" : "预览完整规则选择表"}</button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {active ? <>
      <p role="status">已校验全部 {reference.items.length} 个项目版本，共 {active.changes.length} 项选择变更。请逐页核对全部变更。</p>
      <div className={`ds-mobile-record-list ${styles.records}`}>{active.changes.slice((page - 1) * 20, page * 20).map(change => {
        const item = reference.items[change.index]!;
        return <article className="ds-mobile-record" key={item.id}><strong>{item.displayName} · {item.code} · 第 {item.versionNo} 版</strong>
          <p className={styles.expression}>当前：{ruleChoiceSummary(reference, change.before)}</p><p className={styles.expression}>表内：{ruleChoiceSummary(reference, change.after)}</p></article>;
      })}</div>
      <div className={styles.actions}><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>选择变更上一页</button><span>选择变更第 {page} / {Math.max(1, Math.ceil(active.changes.length / 20))} 页</span><button type="button" className="secondary-button" disabled={page * 20 >= active.changes.length} onClick={() => setPage(value => value + 1)}>选择变更下一页</button></div>
      <label><input type="checkbox" checked={confirmed} disabled={working || !active.changes.length} onChange={event => setConfirmed(event.target.checked)} />我已核对全部选择变更及原条件，确认替换本地项目选择</label>
      <button type="button" className="primary-button" disabled={working || !confirmed || !active.changes.length} onClick={() => void apply()}>确认替换本地选择</button>
    </> : null}
  </section>;
}
