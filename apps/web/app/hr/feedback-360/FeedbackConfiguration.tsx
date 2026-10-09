"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { hrApi, type HrFeedback360Configuration, type HrFeedback360ConfiguredModel, type HrFeedback360ConfiguredQuestionnaire } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import { FeedbackConfigurationEditor } from "./FeedbackConfigurationEditor";
import { feedbackConfigurationData } from "./feedback-configuration-data";
import styles from "./feedback-configuration.module.css";

type Editor = { kind: "model"; model?: HrFeedback360ConfiguredModel } | { kind: "questionnaire"; questionnaire?: HrFeedback360ConfiguredQuestionnaire };
export function FeedbackConfiguration({ onPublished }: { onPublished?: () => Promise<void> }) { const user = useAuthUser(); return <ConfigurationWorkspace key={JSON.stringify(user)} onPublished={onPublished} />; }
function ConfigurationWorkspace({ onPublished }: { onPublished?: () => Promise<void> }) {
  const user = useAuthUser(), manage = hasPermission(user, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE), read = manage || hasPermission(user, HR_PERMISSIONS.HR_FEEDBACK_READ);
  const [configuration, setConfiguration] = useState<HrFeedback360Configuration>({ models: [], questionnaires: [] }), [editor, setEditor] = useState<Editor | null>(null), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), request = useRef<AbortController | null>(null), writeLock = useRef(false), epoch = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); epoch.current++; }; }, []);
  const load = useCallback(async () => {
    if (!read) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller; setLoading(true); setError("");
    try {
      const data = await hrApi.feedback360Configuration(getAccessToken(), controller.signal);
      if (alive.current && !controller.signal.aborted && request.current === controller) setConfiguration(feedbackConfigurationData(data));
    } catch (reason) {
      if (alive.current && !controller.signal.aborted && request.current === controller) { setError(hrLoadErrorMessage(reason, "加载360配置失败")); throw reason; }
    } finally { if (alive.current && request.current === controller) setLoading(false); }
  }, [read]);
  useEffect(() => { void load().catch(() => undefined); return () => request.current?.abort(); }, [load]);
  const open = (next: Editor | null) => { epoch.current++; setEditor(next); setNotice(""); };
  const publish = async (kind: "model" | "questionnaire", versionId: string) => {
    if (!manage || writeLock.current) return; writeLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (kind === "model") await hrApi.publishFeedback360Model(versionId, getAccessToken());
      else await hrApi.publishFeedback360Questionnaire(versionId, getAccessToken());
      if (!alive.current) return;
      setNotice(kind === "model" ? "模型已发布，可为该版本配置问卷。" : "问卷已发布，可用于匹配模型的新评价周期。");
      try { await load(); if (alive.current) await onPublished?.(); } catch { if (alive.current) setError("发布已成功，配置刷新失败；请重新加载后查看。"); }
    } catch (reason) { if (alive.current) setError(hrLoadErrorMessage(reason, "发布360配置失败")); }
    finally { writeLock.current = false; if (alive.current) setBusy(false); }
  };
  const generation = epoch.current;
  const saved = async () => {
    if (!alive.current || generation !== epoch.current) return;
    setNotice("配置草稿已保存，请核对配置后单独发布。");
    await load();
    if (alive.current && generation === epoch.current) { epoch.current++; setEditor(null); }
  };
  if (!read) return null;
  return <section id="feedback-configuration" className={`ds-panel ${styles.editor}`}>
    <div className={styles.actions}><h2>模型与问卷配置</h2>{manage ? <><button className="ds-button" type="button" disabled={busy} onClick={() => open({ kind: "model" })}>创建模型</button><button className="ds-button" type="button" disabled={busy} onClick={() => open({ kind: "questionnaire" })}>创建问卷</button></> : null}<button className="ds-button" type="button" disabled={busy || loading} onClick={() => void load().catch(() => undefined)}>刷新配置</button></div>
    <p>按实际制度配置维度、行为锚点和题目。先保存草稿，再明确发布；既有评价继续引用其原版本。</p>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <p>正在加载模型与问卷配置…</p> : null}
    {manage && editor ? <FeedbackConfigurationEditor key={`${editor.kind}-${editor.kind === "model" ? editor.model?.versionId ?? "new" : editor.questionnaire?.versionId ?? "new"}`} kind={editor.kind} model={editor.kind === "model" ? editor.model : undefined} questionnaire={editor.kind === "questionnaire" ? editor.questionnaire : undefined} models={configuration.models} writeLock={writeLock} onBusyChange={value => { if (alive.current) setBusy(value); }} onSaved={saved} onCancel={() => open(null)} /> : null}
    <h3>模型版本</h3><div className={`ds-mobile-record-list ${styles.records}`}>
      {!loading && !error && configuration.models.length === 0 ? <p>暂无模型配置。</p> : null}
      {configuration.models.map(m => <article className="ds-mobile-record" key={m.versionId}><strong>{m.modelName} · {m.versionName}</strong><span>V{m.versionNo} · {m.versionStatus === "draft" ? "草稿" : m.versionStatus === "published" ? "已发布" : "已停用"} · 量表{m.scaleMin}–{m.scaleMax}</span><details className={styles.details}><summary>查看模型完整配置</summary>{m.dimensions.map(d => <div key={d.code}><strong>{d.name}（{d.code}） · {(Number(d.weight) * 100).toFixed(2)}%</strong>{d.description ? <p>{d.description}</p> : null}{d.anchors.map(a => <p key={a.level}>{a.level}分：{a.text}</p>)}</div>)}</details>
        {manage && m.versionNo === m.currentVersionNo && m.status !== "retired" ? <div className={styles.actions}><button className="ds-button" type="button" disabled={busy || Boolean(editor)} onClick={() => open({ kind: "model", model: m })}>继续模型版本</button>{m.versionStatus === "draft" ? <button className="ds-button ds-button-primary" type="button" disabled={busy || Boolean(editor)} onClick={() => void publish("model", m.versionId)}>发布模型</button> : null}</div> : null}
      </article>)}
    </div><h3>问卷版本</h3><div className={`ds-mobile-record-list ${styles.records}`}>
      {!loading && !error && configuration.questionnaires.length === 0 ? <p>暂无问卷配置。</p> : null}
      {configuration.questionnaires.map(q => <article className="ds-mobile-record" key={q.versionId}><strong>{q.questionnaireName} · {q.versionName}</strong><span>V{q.versionNo} · {q.versionStatus === "draft" ? "草稿" : q.versionStatus === "published" ? "已发布" : "已停用"} · {q.modelName} / {q.modelVersionName}</span><details className={styles.details}><summary>查看问卷完整配置</summary>{q.questions.map(question => <p key={question.code}>{question.text}（{question.code}） · {question.dimensionCode} · {question.type === "rating" ? "评分题" : "文字题"} · {question.required ? "必填" : "选填"}</p>)}</details>
        {manage && q.versionNo === q.currentVersionNo && q.status !== "retired" ? <div className={styles.actions}><button className="ds-button" type="button" disabled={busy || Boolean(editor)} onClick={() => open({ kind: "questionnaire", questionnaire: q })}>继续问卷版本</button>{q.versionStatus === "draft" ? <button className="ds-button ds-button-primary" type="button" disabled={busy || Boolean(editor)} onClick={() => void publish("questionnaire", q.versionId)}>发布问卷</button> : null}</div> : null}
      </article>)}
    </div>
  </section>;
}
