"use client";

import { useEffect, useRef, useState } from "react";
import { FORMAL_PAYROLL_ROLES, type FormalPayrollDefinition, type FormalPayrollRole, type FormalPayrollSourceReference } from "@jinhu/shared";
import { getAccessToken } from "../../../lib/authz";
import { hrApi } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";

const roles: Record<FormalPayrollRole, string> = { earning: "收入", deduction: "扣款", tax: "税额", gross: "应发汇总", net: "实发汇总", employer_contribution: "单位承担", informational: "参考数量" };
type Choice = { included: boolean; role: FormalPayrollRole | ""; source: "" | "direct" | "formula" | "rewrite"; formulaId: string; rewrite: string };
const blank = (): Choice => ({ included: false, role: "", source: "", formulaId: "", rewrite: "" });

/** Mounted only in an empty new version; parent rechecks the editor before applying. */
type Props = { ruleSetId: string; sourceBookId: string; disabled: boolean; onApply: (definition: FormalPayrollDefinition) => void };
export function PayrollRuleSourcePreparation(props: Props) {
  return <SourcePreparation key={`${props.ruleSetId}:${props.sourceBookId}`} {...props} />;
}
function SourcePreparation({ ruleSetId, sourceBookId, disabled, onApply }: Props) {
  const [reference, setReference] = useState<FormalPayrollSourceReference | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({}), [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState(1), [unmatchedPage, setUnmatchedPage] = useState(1);
  const request = useRef<AbortController | null>(null), applied = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  const load = async () => {
    if (disabled || loading) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    try {
      const value = await hrApi.payrollRuleSourceReference(ruleSetId, getAccessToken(), controller.signal);
      if (controller.signal.aborted) return;
      if (value.ruleSetId !== ruleSetId || value.book.id !== sourceBookId) throw new Error("源资料与当前工资规则不一致，请重新选择规则。");
      setReference(value); setChoices({}); setConfirmed(false); setPage(1); setUnmatchedPage(1);
    } catch (cause) { if (!controller.signal.aborted) setError(hrLoadErrorMessage(cause, "读取关联账套源资料失败")); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const change = (id: string, value: Partial<Choice>) => { setConfirmed(false); setChoices(previous => ({ ...previous, [id]: { ...(previous[id] ?? blank()), ...value } })); };
  const selected = reference?.items.filter(item => choices[item.id]?.included) ?? [];
  const unmatched = reference?.formulas.filter(formula => !reference.items.some(item => item.id === formula.itemVersionId)) ?? [];
  const valid = selected.length > 0 && selected.length <= 256 && new Set(selected.map(item => item.code)).size === selected.length && selected.every(item => {
    const choice = choices[item.id]!;
    return item.enabled && item.valueType === "decimal" && choice.role && (choice.source === "direct" || choice.source === "rewrite" && choice.rewrite.trim() || choice.source === "formula" && reference?.formulas.some(formula => formula.id === choice.formulaId && formula.itemVersionId === item.id && formula.reusableSyntax));
  });
  return <section className={`ds-panel ${styles.workspace}`} aria-label="账套源资料准备">
    <h4>从关联账套准备规则草稿</h4>
    <p>原项目、公式和条件仅供参考。请逐项选择用途与数值来源，并核对计算顺序、项目引用及计薪口径；语法可复用不代表业务已批准。带入只修改当前编辑内容，随后保存草稿并独立复核。</p>
    <button className="secondary-button" type="button" disabled={disabled || loading} onClick={() => void load()}>{loading ? "正在读取源资料…" : reference ? "重新读取源资料" : "读取关联账套源资料"}</button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {reference ? <>
      <p>完整资料：{reference.items.length} 个项目版本，{reference.formulas.length} 个公式版本。不同版本均保留；同一项目代码只能选择一个版本。非数字及禁用项目只作参考。</p>
      <div className={`ds-mobile-record-list ${styles.records}`}>{reference.items.slice((page - 1) * 20, page * 20).map(item => {
        const choice = choices[item.id] ?? blank();
        const formulas = reference.formulas.filter(formula => formula.itemVersionId === item.id);
        return <article className={`ds-mobile-record ${styles.project}`} key={item.id} aria-label={`${item.code} 第${item.versionNo}版`}>
          <strong>{item.displayName} · {item.code} · 第 {item.versionNo} 版</strong>
          <p>原项目名：{item.legacyName}；类型：{{ decimal: "数值", text: "文本", date: "日期" }[item.valueType] ?? "原类型未知"}；状态：{item.enabled ? "启用" : "禁用"}；原类别：{item.category}；原类型：{item.legacyItemType}；原增减标记：{item.legacyAddOrSub}；原顺序：{item.sortNo}</p>
          <label><input type="checkbox" checked={choice.included} disabled={disabled || loading || !item.enabled || item.valueType !== "decimal"} onChange={event => change(item.id, { included: event.target.checked })} /> 纳入 {item.code} 第{item.versionNo}版</label>
          {choice.included ? <div className={styles.fields}>
            <label className="form-field"><span>源项目用途 {item.code}</span><select value={choice.role} disabled={disabled || loading} onChange={event => change(item.id, { role: event.target.value as Choice["role"] })}><option value="">请选择用途</option>{FORMAL_PAYROLL_ROLES.map(role => <option key={role} value={role}>{roles[role]}</option>)}</select></label>
            <label className="form-field"><span>源项目数值来源 {item.code}</span><select value={choice.source} disabled={disabled || loading} onChange={event => change(item.id, { source: event.target.value as Choice["source"], formulaId: "" })}><option value="">请选择数值来源</option><option value="direct">当期明确录入</option><option value="formula" disabled={!formulas.some(formula => formula.reusableSyntax)}>选用无条件原公式</option><option value="rewrite">人工改写并复核</option></select></label>
            {choice.source === "formula" ? <label className="form-field"><span>原公式选择 {item.code}</span><select value={choice.formulaId} disabled={disabled || loading} onChange={event => change(item.id, { formulaId: event.target.value })}><option value="">请选择原公式及版本</option>{formulas.filter(formula => formula.reusableSyntax).map(formula => <option key={formula.id} value={formula.id}>原公式 {formula.legacyFormulaId} · 第 {formula.versionNo} 版 · 顺序 {formula.calculationOrder}</option>)}</select></label> : null}
            {choice.source === "rewrite" ? <label className="form-field"><span>改写公式 {item.code}</span><textarea aria-label={`改写公式 ${item.code}`} value={choice.rewrite} maxLength={2000} disabled={disabled || loading} onChange={event => change(item.id, { rewrite: event.target.value })} /><small>必须处理原条件和业务口径；不得省略条件后直接计算。保存时再次验证引用与顺序。</small></label> : null}
          </div> : null}
          {formulas.map(formula => <div key={formula.id}><strong>原公式 {formula.legacyFormulaId} · 第 {formula.versionNo} 版 · 顺序 {formula.calculationOrder}</strong><p className={styles.expression}>公式：{formula.expression}</p><p className={styles.expression}>条件：{formula.condition || "无"}</p><p>{formula.reusableSyntax ? "无条件语法可复用，需确认依赖、顺序和业务口径" : "仅供参考，需人工改写并复核"}</p></div>)}
          {!formulas.length ? <p>没有关联到此项目版本的原公式。</p> : null}
        </article>;
      })}</div>
      <div className={styles.actions}><button type="button" className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>源项目上一页</button><span>源项目第 {page} / {Math.max(1, Math.ceil(reference.items.length / 20))} 页，跨页保留选择</span><button type="button" className="secondary-button" disabled={page * 20 >= reference.items.length || loading} onClick={() => setPage(value => value + 1)}>源项目下一页</button></div>
      {unmatched.slice((unmatchedPage - 1) * 20, unmatchedPage * 20).map(formula => <article className="ds-panel" key={formula.id}><strong>未对应当前项目的原公式 {formula.legacyFormulaId} · 第 {formula.versionNo} 版（仅参考）</strong><p className={styles.expression}>公式：{formula.expression}</p><p className={styles.expression}>条件：{formula.condition || "无"}</p></article>)}
      {unmatched.length ? <div className={styles.actions}><span>未对应项目的原公式共 {unmatched.length} 个</span><button type="button" className="secondary-button" disabled={unmatchedPage <= 1} onClick={() => setUnmatchedPage(value => value - 1)}>参考公式上一页</button><span>第 {unmatchedPage} 页</span><button type="button" className="secondary-button" disabled={unmatchedPage * 20 >= unmatched.length} onClick={() => setUnmatchedPage(value => value + 1)}>参考公式下一页</button></div> : null}
      <p>已选择 {selected.length} 个项目（最多 256 个）。需明确每项用途、数值来源及公式版本，不能重复选择相同项目代码。</p>
      <label><input type="checkbox" checked={confirmed} disabled={disabled || loading || !valid || !!error} onChange={event => setConfirmed(event.target.checked)} /> 我已核对原条件、所选版本及业务用途，将继续核对顺序和计薪口径并提交独立复核</label>
      <button className="primary-button" type="button" disabled={disabled || loading || !valid || !confirmed || !!error} onClick={() => {
        if (disabled || loading || !valid || !confirmed || error || applied.current) return;
        applied.current = true;
        onApply({ roundingPolicy: "line_items_half_up", items: selected.map(item => {
          const choice = choices[item.id]!;
          return { code: item.code, role: choice.role as FormalPayrollRole, expression: choice.source === "direct" ? null : choice.source === "rewrite" ? choice.rewrite.trim() : reference.formulas.find(formula => formula.id === choice.formulaId)!.expression };
        }) });
      }}>带入空白规则草稿</button>
    </> : null}
  </section>;
}
