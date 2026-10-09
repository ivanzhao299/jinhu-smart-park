"use client";
import { useEffect, useRef, useState } from "react";
import { hrApi, type HrFeedback360ConfiguredModel, type HrFeedback360ConfiguredQuestionnaire } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./feedback-configuration.module.css";

type Anchor = { key: number; level: string; text: string };
type Dimension = { key: number; code: string; name: string; description: string; weight: string; anchors: Anchor[] };
type Question = { key: number; code: string; dimensionCode: string; text: string; type: "rating" | "text"; required: boolean };
type Props = { kind: "model" | "questionnaire"; model?: HrFeedback360ConfiguredModel; questionnaire?: HrFeedback360ConfiguredQuestionnaire; models: HrFeedback360ConfiguredModel[]; writeLock: { current: boolean }; onBusyChange: (busy: boolean) => void; onSaved: () => Promise<void>; onCancel: () => void };
const decimal = (s: string, min: number, max: number) => /^\d+(?:\.\d{1,2})?$/.test(s) && Number(s) >= min && Number(s) <= max;
const identifier = (s: string) => /^[A-Z][A-Z0-9_]{1,31}$/.test(s.trim());
function move<T>(items: T[], index: number, delta: number) { const next = [...items]; [next[index], next[index + delta]] = [next[index + delta]!, next[index]!]; return next; }

export function FeedbackConfigurationEditor({ kind, model, questionnaire, models, writeLock, onBusyChange, onSaved, onCancel }: Props) {
  const serial = useRef(0), flight = useRef(false), alive = useRef(true);
  const anchor = (): Anchor => ({ key: serial.current++, level: "", text: "" });
  const dimension = (): Dimension => ({ key: serial.current++, code: "", name: "", description: "", weight: "", anchors: [anchor(), anchor()] });
  const question = (): Question => ({ key: serial.current++, code: "", dimensionCode: "", text: "", type: "rating", required: true });
  const existing = model ?? questionnaire;
  const [code, setCode] = useState(model?.modelCode ?? questionnaire?.questionnaireCode ?? ""), [name, setName] = useState(model?.modelName ?? questionnaire?.questionnaireName ?? ""), [versionName, setVersionName] = useState("");
  const [scaleMin, setScaleMin] = useState(model?.scaleMin ?? ""), [scaleMax, setScaleMax] = useState(model?.scaleMax ?? ""), [modelVersionId, setModelVersionId] = useState(questionnaire?.modelVersionId ?? "");
  const [dimensions, setDimensions] = useState<Dimension[]>(() => model ? model.dimensions.map(d => ({ ...d, key: serial.current++, description: d.description ?? "", weight: (Number(d.weight) * 100).toFixed(2), anchors: d.anchors.map(a => ({ ...a, key: serial.current++ })) })) : [dimension()]);
  const [questions, setQuestions] = useState<Question[]>(() => questionnaire ? questionnaire.questions.map(q => ({ ...q, key: serial.current++ })) : [question()]);
  const [busy, setBusy] = useState(false), [committed, setCommitted] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const selectedModel = models.find(m => m.versionId === modelVersionId && m.versionStatus === "published" && m.status !== "retired");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const updateDimension = (key: number, changes: Partial<Dimension>) => setDimensions(rows => rows.map(d => d.key === key ? { ...d, ...changes } : d));
  const updateQuestion = (key: number, changes: Partial<Question>) => setQuestions(rows => rows.map(q => q.key === key ? { ...q, ...changes } : q));
  const submit = async () => {
    if (flight.current || writeLock.current || committed) return;
    setError("");
    if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(code.trim()) || name.trim().length < 2 || versionName.trim().length < 2) { setError("请填写有效编号、名称和新版本名称。"); return; }
    let body: object;
    if (kind === "model") {
      if (!decimal(scaleMin, 0, 100) || !decimal(scaleMax, .01, 100) || Number(scaleMin) >= Number(scaleMax)) { setError("量表范围须在0–100内，最高分大于最低分，最多两位小数。"); return; }
      if (dimensions.length < 1 || dimensions.length > 30 || new Set(dimensions.map(d => d.code.trim())).size !== dimensions.length || dimensions.some(d => !identifier(d.code) || d.name.trim().length < 2 || !decimal(d.weight, .01, 100)) || Math.abs(dimensions.reduce((sum, d) => sum + Number(d.weight), 0) - 100) > .000001) { setError("请检查维度编号、名称和权重，权重合计必须为100%。"); return; }
      if (dimensions.some(d => d.anchors.length < 2 || d.anchors.length > 20 || new Set(d.anchors.map(a => Number(a.level))).size !== d.anchors.length || d.anchors.some(a => !decimal(a.level, Number(scaleMin), Number(scaleMax)) || a.text.trim().length < 2))) { setError("每个维度需要2–20个锚点，分值须唯一且在量表范围内，说明至少两个字。"); return; }
      body = { modelCode: code.trim(), modelName: name.trim(), versionName: versionName.trim(), scaleMin: Number(scaleMin), scaleMax: Number(scaleMax), dimensions: dimensions.map(d => ({ code: d.code.trim(), name: d.name.trim(), description: d.description.trim(), weight: Number((Number(d.weight) / 100).toFixed(4)), anchors: d.anchors.map(a => ({ level: Number(a.level), text: a.text.trim() })) })) };
    } else {
      if (!selectedModel || questions.length < 1 || questions.length > 100 || new Set(questions.map(q => q.code.trim())).size !== questions.length || questions.some(q => !identifier(q.code) || q.text.trim().length < 2 || !selectedModel.dimensions.some(d => d.code === q.dimensionCode))) { setError("请选择已发布模型，题目编号须唯一，题目须绑定该模型的实际维度。"); return; }
      body = { questionnaireCode: code.trim(), questionnaireName: name.trim(), versionName: versionName.trim(), modelVersionId, questions: questions.map(({ code: questionCode, dimensionCode, text, type, required }) => ({ code: questionCode.trim(), dimensionCode, text: text.trim(), type, required })) };
    }
    flight.current = true; writeLock.current = true; setBusy(true); onBusyChange(true);
    try {
      if (kind === "model") {
        if (model) await hrApi.createFeedback360ModelVersion(model.id, { ...body, expectedVersionId: model.versionId }, getAccessToken());
        else await hrApi.createFeedback360Model(body, getAccessToken());
      } else {
        if (questionnaire) await hrApi.createFeedback360QuestionnaireVersion(questionnaire.id, { ...body, expectedVersionId: questionnaire.versionId }, getAccessToken());
        else await hrApi.createFeedback360Questionnaire(body, getAccessToken());
      }
      if (!alive.current) return;
      setCommitted(true); setNotice("配置草稿已保存，发布后才可用于新评价周期。");
      try { await onSaved(); } catch { if (alive.current) setError("草稿已保存，刷新失败；请重新加载后查看，勿重复保存。"); }
    } catch (reason) { if (alive.current) setError(hrLoadErrorMessage(reason, "保存360配置失败")); }
    finally { flight.current = false; writeLock.current = false; if (alive.current) setBusy(false); onBusyChange(false); }
  };
  return <form className={`ds-panel ${styles.editor}`} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3>{existing ? "继续配置新版本" : kind === "model" ? "创建胜任力模型" : "创建360问卷"}</h3>
    {existing ? <p>基于V{existing.versionNo}保存新草稿；原版本及已开展评价保持可追溯。</p> : null}
    <fieldset disabled={busy || committed} className={styles.fields}>
      <label className="form-field"><span>配置编号</span><input required maxLength={32} pattern="[A-Z][A-Z0-9_-]{1,31}" value={code} readOnly={Boolean(existing)} onChange={e => setCode(e.target.value)} /></label>
      <label className="form-field"><span>配置名称</span><input required minLength={2} maxLength={120} value={name} readOnly={Boolean(existing)} onChange={e => setName(e.target.value)} /></label>
      <label className="form-field"><span>新版本名称</span><input required minLength={2} maxLength={120} value={versionName} onChange={e => setVersionName(e.target.value)} /></label>
      {kind === "model" ? <>{([[scaleMin, setScaleMin, "量表最低分"], [scaleMax, setScaleMax, "量表最高分"]] as const).map(([value, change, label]) => <label className="form-field" key={label}><span>{label}</span><input required type="number" min={0} max={100} step="0.01" value={value} onFocus={e => e.target.select()} onChange={e => change(e.target.value)} /></label>)}</> : <label className="form-field"><span>绑定模型版本</span><select required value={modelVersionId} onChange={e => { setModelVersionId(e.target.value); setQuestions(rows => rows.map(q => ({ ...q, dimensionCode: "" }))); }}><option value="">请选择已发布模型</option>{models.filter(m => m.versionStatus === "published" && m.status !== "retired").map(m => <option key={m.versionId} value={m.versionId}>{m.modelName} · {m.versionName}</option>)}</select></label>}
    </fieldset>
    {kind === "model" ? <>
      <h3>模型维度</h3><p>权重合计 {Math.round(dimensions.reduce((sum, d) => sum + (Number(d.weight) || 0), 0) * 100) / 100}%</p>
      {dimensions.map((d, i) => <fieldset key={d.key} disabled={busy || committed} className={`ds-panel ${styles.row}`}><legend>维度{i + 1}</legend>
        <div className={styles.fields}><label className="form-field"><span>维度编号</span><input required maxLength={32} value={d.code} onChange={e => updateDimension(d.key, { code: e.target.value })} /></label><label className="form-field"><span>维度名称</span><input required minLength={2} maxLength={120} value={d.name} onChange={e => updateDimension(d.key, { name: e.target.value })} /></label><label className="form-field"><span>维度权重（%）</span><input required type="number" min={.01} max={100} step="0.01" value={d.weight} onFocus={e => e.target.select()} onChange={e => updateDimension(d.key, { weight: e.target.value })} /></label></div>
        <label className="form-field"><span>维度说明</span><textarea maxLength={1000} value={d.description} onChange={e => updateDimension(d.key, { description: e.target.value })} /></label>
        {d.anchors.map((a, j) => <div className={styles.anchor} key={a.key}><label className="form-field"><span>锚点{j + 1}分值</span><input required type="number" min={Number(scaleMin) || 0} max={Number(scaleMax) || 100} step="0.01" value={a.level} onFocus={e => e.target.select()} onChange={e => updateDimension(d.key, { anchors: d.anchors.map(item => item.key === a.key ? { ...item, level: e.target.value } : item) })} /></label><label className="form-field"><span>锚点{j + 1}行为说明</span><textarea required minLength={2} maxLength={1000} value={a.text} onChange={e => updateDimension(d.key, { anchors: d.anchors.map(item => item.key === a.key ? { ...item, text: e.target.value } : item) })} /></label><div className={styles.actions}><button type="button" className="ds-button" disabled={j === 0} onClick={() => updateDimension(d.key, { anchors: move(d.anchors, j, -1) })}>锚点上移</button><button type="button" className="ds-button" disabled={j === d.anchors.length - 1} onClick={() => updateDimension(d.key, { anchors: move(d.anchors, j, 1) })}>锚点下移</button><button type="button" className="ds-button" disabled={d.anchors.length <= 2} onClick={() => updateDimension(d.key, { anchors: d.anchors.filter(item => item.key !== a.key) })}>删除锚点</button></div></div>)}
        <div className={styles.actions}><button type="button" className="ds-button" disabled={d.anchors.length >= 20} onClick={() => updateDimension(d.key, { anchors: [...d.anchors, anchor()] })}>添加锚点</button><button type="button" className="ds-button" disabled={i === 0} onClick={() => setDimensions(rows => move(rows, i, -1))}>维度上移</button><button type="button" className="ds-button" disabled={i === dimensions.length - 1} onClick={() => setDimensions(rows => move(rows, i, 1))}>维度下移</button><button type="button" className="ds-button" disabled={dimensions.length === 1} onClick={() => setDimensions(rows => rows.filter(item => item.key !== d.key))}>删除维度</button></div>
      </fieldset>)}
      <button type="button" className="ds-button" disabled={busy || committed || dimensions.length >= 30} onClick={() => setDimensions(rows => [...rows, dimension()])}>添加维度</button>
    </> : <>
      <h3>问卷题目</h3>
      {questions.map((q, i) => <fieldset key={q.key} disabled={busy || committed} className={`ds-panel ${styles.row}`}><legend>题目{i + 1}</legend>
        <div className={styles.fields}><label className="form-field"><span>题目编号</span><input required maxLength={32} value={q.code} onChange={e => updateQuestion(q.key, { code: e.target.value })} /></label><label className="form-field"><span>所属维度</span><select required value={q.dimensionCode} onChange={e => updateQuestion(q.key, { dimensionCode: e.target.value })}><option value="">请选择实际模型维度</option>{selectedModel?.dimensions.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}</select></label><label className="form-field"><span>题目类型</span><select value={q.type} onChange={e => updateQuestion(q.key, { type: e.target.value as "rating" | "text" })}><option value="rating">评分题</option><option value="text">文字题</option></select></label></div>
        <label className="form-field"><span>题目内容</span><textarea required minLength={2} maxLength={1000} value={q.text} onChange={e => updateQuestion(q.key, { text: e.target.value })} /></label><label><input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.key, { required: e.target.checked })} /> 必填题目</label>
        <div className={styles.actions}><button type="button" className="ds-button" disabled={i === 0} onClick={() => setQuestions(rows => move(rows, i, -1))}>题目上移</button><button type="button" className="ds-button" disabled={i === questions.length - 1} onClick={() => setQuestions(rows => move(rows, i, 1))}>题目下移</button><button type="button" className="ds-button" disabled={questions.length === 1} onClick={() => setQuestions(rows => rows.filter(item => item.key !== q.key))}>删除题目</button></div>
      </fieldset>)}
      <button type="button" className="ds-button" disabled={busy || committed || questions.length >= 100} onClick={() => setQuestions(rows => [...rows, question()])}>添加题目</button>
    </>}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy || committed}>{busy ? "正在保存" : "保存配置草稿"}</button><button type="button" className="ds-button" disabled={busy} onClick={onCancel}>关闭配置编辑</button></div>
  </form>;
}
