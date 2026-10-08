"use client";
import { useEffect, useRef, useState } from "react";
import { hrApi, type HrPerformanceTemplateDetailV2 } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-template.module.css";

type Dimension = { key: number; code: string; name: string; weight: string; scoreMin: string; scoreMax: string; scoringGuide: Record<string, unknown> };
type Level = { key: number; code: string; name: string; scoreMin: string; scoreMax: string };
const dimension = (key: number): Dimension => ({ key, code: "", name: "", weight: "100", scoreMin: "0", scoreMax: "100", scoringGuide: {} });
const level = (key: number): Level => ({ key, code: "", name: "", scoreMin: "0", scoreMax: "100" });
const decimal = (value: string, minimum: number, maximum: number) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) >= minimum && Number(value) <= maximum;

export function PerformanceTemplateEditor({ template, onSaved, onCancel, writeLock, onBusyChange }: { template?: HrPerformanceTemplateDetailV2; onSaved: () => Promise<void>; onCancel: () => void; writeLock?: {current:boolean}; onBusyChange?: (busy:boolean)=>void }) {
  const serial = useRef(100), flight = useRef(false), alive = useRef(true);
  const [code, setCode] = useState(template?.templateCode ?? ""), [name, setName] = useState(template?.templateName ?? ""), [versionName, setVersionName] = useState("");
  const [dimensions, setDimensions] = useState<Dimension[]>(() => template ? template.dimensions.map((row, key) => ({ ...row, key, weight: String(Math.round(Number(row.weight) * 10000) / 100), scoringGuide: row.scoringGuide ?? {} })) : [dimension(0)]);
  const [levels, setLevels] = useState<Level[]>(() => template ? template.levels.map((row, key) => ({ ...row, key })) : [level(0)]);
  const [busy, setBusy] = useState(false), [committed, setCommitted] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const move = <T,>(rows: T[], index: number, delta: number): T[] => { const next = [...rows], target = index + delta; if (target < 0 || target >= rows.length) return rows; [next[index], next[target]] = [next[target]!, next[index]!]; return next; };
  const submit = async () => {
    if (flight.current || committed || writeLock?.current) return;
    setError(""); setNotice("");
    if (!code.trim() || !name.trim() || !versionName.trim()) { setError("请填写模板编号、名称和版本名称。"); return; }
    if (dimensions.some(row => !row.code.trim() || !row.name.trim() || !decimal(row.weight, .01, 100) || !decimal(row.scoreMin, 0, 100) || !decimal(row.scoreMax, 0, 100) || Number(row.scoreMin) >= Number(row.scoreMax))) { setError("请核对维度编号、名称、权重和分数范围；数值最多两位小数。"); return; }
    if (new Set(dimensions.map(row => row.code.trim())).size !== dimensions.length || Math.abs(dimensions.reduce((sum, row) => sum + Number(row.weight), 0) - 100) > .000001) { setError("维度编号不能重复，权重合计必须为100%。"); return; }
    if (levels.some(row => !row.code.trim() || !row.name.trim() || !decimal(row.scoreMin, 0, 100) || !decimal(row.scoreMax, 0, 100) || Number(row.scoreMax) < Number(row.scoreMin)) || new Set(levels.map(row => row.code.trim())).size !== levels.length) { setError("请填写唯一等级编号、名称和合法分数区间。"); return; }
    const ordered = [...levels].sort((a, b) => Number(a.scoreMin) - Number(b.scoreMin));
    if (Number(ordered[0]!.scoreMin) !== 0 || Number(ordered.at(-1)!.scoreMax) !== 100 || ordered.some((row, index) => index > 0 && Math.abs(Number(row.scoreMin) - Number(ordered[index - 1]!.scoreMax) - .01) > .000001)) { setError("等级区间必须按0.01分连续覆盖0至100分，不能重叠或留空。"); return; }
    const body = { templateCode: code.trim(), templateName: name.trim(), versionName: versionName.trim(), dimensions: dimensions.map(row => ({ code: row.code.trim(), name: row.name.trim(), weight: Number(row.weight) / 100, scoreMin: Number(row.scoreMin), scoreMax: Number(row.scoreMax), scoringGuide: row.scoringGuide })), levels: levels.map(row => ({ code: row.code.trim(), name: row.name.trim(), scoreMin: Number(row.scoreMin), scoreMax: Number(row.scoreMax) })) };
    flight.current = true; if(writeLock)writeLock.current=true; setBusy(true); onBusyChange?.(true);
    try {
      if (template) await hrApi.createPerformanceTemplateVersionV2(template.templateId, { ...body, expectedVersionId: template.versionId }, getAccessToken());
      else await hrApi.createPerformanceTemplateV2(body, getAccessToken());
      if (!alive.current) return;
      setCommitted(true); setNotice("模板草稿已保存；发布后才可用于新绩效周期。");
      try { await onSaved(); } catch { if (alive.current) setError("草稿已保存，刷新失败；请重新加载后查看，勿重复保存。"); }
    } catch (reason) { if (alive.current) setError(hrLoadErrorMessage(reason, "保存评价模板失败")); }
    finally { flight.current = false; if(writeLock)writeLock.current=false; if (alive.current) setBusy(false); onBusyChange?.(false); }
  };
  return <form className={`ds-panel ${styles.editor}`} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h2>{template ? `续建模板版本 · ${template.templateName}` : "创建评价模板"}</h2>
    {template ? <p>基于V{template.versionNo}创建新草稿，原版本和已有周期配置保持可追溯。</p> : null}
    <fieldset disabled={busy || committed} className={styles.fields}>
      <label className="form-field"><span>模板编号</span><input required maxLength={64} value={code} readOnly={Boolean(template)} onChange={event => setCode(event.target.value)} /></label>
      <label className="form-field"><span>模板名称</span><input required maxLength={120} value={name} readOnly={Boolean(template)} onChange={event => setName(event.target.value)} /></label>
      <label className="form-field"><span>版本名称</span><input required maxLength={120} value={versionName} onChange={event => setVersionName(event.target.value)} /></label>
    </fieldset>
    <h3>评价维度</h3><p>权重合计 {Math.round(dimensions.reduce((sum, row) => sum + (Number(row.weight) || 0), 0) * 100) / 100}%</p>
    {dimensions.map((row, index) => <fieldset key={row.key} disabled={busy || committed} className={`ds-panel ${styles.row}`}><legend>维度{index + 1}</legend>
      {([['code', '维度编号', 64], ['name', '维度名称', 120]] as const).map(([field, label, maximum]) => <label key={field} className="form-field"><span>{label}</span><input required maxLength={maximum} value={row[field]} onChange={event => setDimensions(items => items.map(item => item.key === row.key ? { ...item, [field]: event.target.value } : item))} /></label>)}
      {([['weight', '权重（%）', .01], ['scoreMin', '最低分', 0], ['scoreMax', '最高分', 0]] as const).map(([field, label, minimum]) => <label key={field} className="form-field"><span>{label}</span><input required type="number" min={minimum} max={100} step="0.01" value={row[field]} onFocus={event => event.target.select()} onChange={event => setDimensions(items => items.map(item => item.key === row.key ? { ...item, [field]: event.target.value } : item))} /></label>)}
      <div className={styles.actions}><button type="button" className="ds-button" disabled={index === 0} onClick={() => setDimensions(items => move(items, index, -1))}>维度上移</button><button type="button" className="ds-button" disabled={index === dimensions.length - 1} onClick={() => setDimensions(items => move(items, index, 1))}>维度下移</button><button type="button" className="ds-button" disabled={dimensions.length === 1} onClick={() => setDimensions(items => items.filter(item => item.key !== row.key))}>删除维度</button></div>
    </fieldset>)}
    <button className="ds-button" type="button" disabled={busy || committed || dimensions.length >= 30} onClick={() => setDimensions(items => [...items, { ...dimension(serial.current++), weight: "" }])}>添加维度</button>
    <h3>评价等级</h3><p>等级区间按最低分排序保存，每相邻区间衔接0.01分。</p>
    {levels.map((row, index) => <fieldset key={row.key} disabled={busy || committed} className={`ds-panel ${styles.row}`}><legend>等级{index + 1}</legend>
      {([['code', '等级编号', 32], ['name', '等级名称', 64]] as const).map(([field, label, maximum]) => <label key={field} className="form-field"><span>{label}</span><input required maxLength={maximum} value={row[field]} onChange={event => setLevels(items => items.map(item => item.key === row.key ? { ...item, [field]: event.target.value } : item))} /></label>)}
      {([['scoreMin', '等级最低分'], ['scoreMax', '等级最高分']] as const).map(([field, label]) => <label key={field} className="form-field"><span>{label}</span><input required type="number" min={0} max={100} step="0.01" value={row[field]} onFocus={event => event.target.select()} onChange={event => setLevels(items => items.map(item => item.key === row.key ? { ...item, [field]: event.target.value } : item))} /></label>)}
      <div className={styles.actions}><button type="button" className="ds-button" disabled={index === 0} onClick={() => setLevels(items => move(items, index, -1))}>等级上移</button><button type="button" className="ds-button" disabled={index === levels.length - 1} onClick={() => setLevels(items => move(items, index, 1))}>等级下移</button><button type="button" className="ds-button" disabled={levels.length === 1} onClick={() => setLevels(items => items.filter(item => item.key !== row.key))}>删除等级</button></div>
    </fieldset>)}
    <button className="ds-button" type="button" disabled={busy || committed || levels.length >= 20} onClick={() => setLevels(items => [...items, { ...level(serial.current++), scoreMin: "", scoreMax: "" }])}>添加等级</button>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy || committed}>{busy ? "正在保存" : "保存模板草稿"}</button><button className="ds-button" type="button" disabled={busy} onClick={onCancel}>关闭模板编辑</button></div>
  </form>;
}
