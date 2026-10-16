"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {ApiError,createIdempotencyKey} from "../../../lib/api-client";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { hrApi, type HrPerformanceTemplateDetailV2, type HrPerformanceTemplateV2 } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import { PerformanceTemplateEditor } from "./PerformanceTemplateEditor";
import { performanceTemplateDetail } from "./performance-template-data";
import {PerformanceChannelWorkflowPolicyEditor} from "./PerformanceChannelWorkflowPolicyEditor";
import {PerformanceChannelDefinitionFields,PerformanceChannelDefinitionHistory} from "./PerformanceChannelDefinitionEditor";
import {validateHrPerformanceChannelDefinition} from "@jinhu/shared";
import styles from "./performance-template.module.css";

type TemplateWorkspaceProps={writeLock?:{current:boolean};externalBlocked?:boolean;onWorkspaceBusyChange?:(value:boolean)=>void};
export function PerformanceTemplates(props:TemplateWorkspaceProps={}) {
  const user = useAuthUser();
  return <TemplateWorkspace key={JSON.stringify(user)} {...props} />;
}
function TemplateWorkspace({writeLock,externalBlocked=false,onWorkspaceBusyChange}:TemplateWorkspaceProps) {
  const user = useAuthUser(), canManage = hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE), canRead = canManage || hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ);
  const [templates, setTemplates] = useState<HrPerformanceTemplateV2[]>([]), [detail, setDetail] = useState<HrPerformanceTemplateDetailV2 | null>(null), [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [detailError, setDetailError] = useState(""), [notice, setNotice] = useState("");
  const listRequest = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null), editGeneration = useRef(0), alive = useRef(true), localMutation = useRef(false);
  const mutation=writeLock??localMutation, publishFlight=useRef(false), publishAttempt=useRef<{id:string;token:string|undefined;key:string}|null>(null);
  const [publishUncertain,setPublishUncertain]=useState(false);
  const changeBusy=(value:boolean)=>{if(alive.current)setBusy(value);onWorkspaceBusyChange?.(value);};
  useEffect(() => { alive.current = true; return () => { alive.current = false; listRequest.current?.abort(); detailRequest.current?.abort(); editGeneration.current++; }; }, []);
  const load = useCallback(async () => {
    if (!canRead) return;
    const request = new AbortController(); listRequest.current?.abort(); listRequest.current = request; setLoading(true); setError("");
    try {
      const rows = await hrApi.performanceTemplatesV2(getAccessToken(), request.signal);
      if (request.signal.aborted || listRequest.current !== request || !alive.current) return;
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== "string" || !row.id.trim() || typeof row.templateName !== "string" || typeof row.templateCode !== "string" || typeof row.versionName !== "string" || typeof row.versionId !== "string" || !row.versionId.trim() || !Number.isSafeInteger(row.currentVersionNo) || row.currentVersionNo < 1 || !["draft", "published"].includes(row.versionStatus ?? "") || !Array.isArray(row.dimensions)) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("评价模板列表响应无效，请重新加载。");
      for(const row of rows)if(row.calculationMode==='five_channel_v1')validateHrPerformanceChannelDefinition(row.channelDefinition);
      setTemplates(rows);
    } catch (reason) { if (!request.signal.aborted && listRequest.current === request && alive.current) { setError(hrLoadErrorMessage(reason, "加载评价模板失败")); throw reason; } }
    finally { if (listRequest.current === request && alive.current) setLoading(false); }
  }, [canRead]);
  useEffect(() => { void load().catch(() => undefined); return () => listRequest.current?.abort(); }, [load]);
  const close = () => { editGeneration.current++; detailRequest.current?.abort(); setDetail(null); setCreating(false); setDetailError(""); };
  const open = async (id: string) => {
    const generation = ++editGeneration.current, request = new AbortController(); detailRequest.current?.abort(); detailRequest.current = request; setDetail(null); setCreating(false); setDetailError("");
    try {
      const result = await hrApi.performanceTemplateDetailV2(id, getAccessToken(), request.signal);
      if (!alive.current || request.signal.aborted || generation !== editGeneration.current) return;
      setDetail(performanceTemplateDetail(result, id));
    } catch (reason) { if (alive.current && !request.signal.aborted && generation === editGeneration.current) setDetailError(hrLoadErrorMessage(reason, "加载评价模板配置失败")); }
  };
  const saved = async (generation: number, id?: string) => {
    if (!alive.current || generation !== editGeneration.current) return;
    setNotice("模板草稿已保存。");
    await load();
    if (!alive.current || generation !== editGeneration.current) return;
    if (id) await open(id); else setCreating(false);
  };
  const publish = async (versionId: string) => {
    if(publishFlight.current||mutation.current&&!publishAttempt.current)return;publishFlight.current=true;
    if(!publishAttempt.current)publishAttempt.current={id:versionId,token:getAccessToken(),key:createIdempotencyKey('hr-perf-template-publish')};
    const current=publishAttempt.current;mutation.current=true;changeBusy(true);setError('');setNotice('');listRequest.current?.abort();detailRequest.current?.abort();
    try{const response=await hrApi.publishPerformanceTemplateV2(current.id,current.token,current.key) as {versionId?:string;status?:string};if(!response||response.versionId!==current.id||response.status!=='published')throw new Error('模板发布回执无效，请按原请求重试。');if(!alive.current)return;publishAttempt.current=null;setPublishUncertain(false);setNotice('评价模板已发布，新绩效周期可选择该版本。');try{await load();}catch{if(alive.current)setError('发布已成功，列表刷新失败；请重新加载后查看。');}}
    catch(reason){if(alive.current){const definite=reason instanceof ApiError&&([400,401,403,404,422].includes(reason.status)||reason.status===409&&!/idempotency.*(processing|does not match|reservation changed)/i.test(reason.message));if(definite)publishAttempt.current=null;setPublishUncertain(!definite);setError(hrLoadErrorMessage(reason,'发布评价模板失败'));}}
    finally{publishFlight.current=false;const unresolved=alive.current&&publishAttempt.current!==null;mutation.current=unresolved;changeBusy(unresolved);}
  };
  if (!canRead) return null;
  const generation = editGeneration.current;
  return <section id="performance-templates" className={`ds-panel ${styles.editor}`}>
    <div className={styles.actions}><h2>评价模板配置</h2>{canManage ? <button type="button" className="ds-button ds-button-secondary" disabled={busy||externalBlocked} onClick={() => { close(); setCreating(true); }}>创建评价模板</button> : null}<button type="button" className="ds-button ds-button-secondary" disabled={loading || busy||externalBlocked} onClick={() => void load().catch(() => undefined)}>刷新模板</button></div>
    <p>按企业制度配置维度、权重和等级。保存草稿后单独发布，既有周期继续使用其冻结版本。</p>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className={`ds-mobile-record-list ${styles.records}`}>{templates.map(template => <article className="ds-mobile-record" key={template.id}><strong>{template.displayName??template.templateName}</strong><span>{template.templateCode} · V{template.currentVersionNo} · {template.versionName} · {template.versionStatus === "published" ? "已发布" : "草稿"}</span><span>{template.calculationMode==='five_channel_v1'?`五渠道定义 · ${template.channelDefinition?.items.length??0}个项目 · ${template.channelDefinition?.gradeCandidates.length??0}个等级候选 · ${template.versionStatus==='published'?'已启用':'草稿'}`:`${template.dimensions.length}个评价维度`}</span><div className={styles.actions}><button type="button" className="ds-button ds-button-secondary" disabled={busy||externalBlocked} onClick={() => void open(template.id)}>{canManage ? template.calculationMode==='five_channel_v1'?"维护五渠道定义":"续建模板版本" : "查看模板配置"}</button>{canManage && template.versionStatus === "draft" && template.versionId ? <button type="button" className="ds-button ds-button-primary" disabled={busy ||externalBlocked|| creating || Boolean(detail)} onClick={() => void publish(template.versionId!)}>发布模板</button> : null}</div></article>)}</div>
    {loading ? <p aria-busy="true">正在加载模板…</p> : !templates.length && !error ? <p>当前没有评价模板。</p> : null}
    {publishUncertain&&publishAttempt.current?<button type="button" className="ds-button ds-button-secondary" onClick={()=>void publish(publishAttempt.current!.id)}>按原请求重试模板发布</button>:null}
    {detailError ? <p className="form-error" role="alert">{detailError}</p> : null}
    {(creating || detail) && canManage ? <PerformanceTemplateEditor key={detail?.versionId ?? `new-${generation}`} template={detail ?? undefined} externalBlocked={externalBlocked||busy} writeLock={mutation} onBusyChange={changeBusy} onCancel={close} onSaved={() => saved(generation, detail?.templateId)} /> : null}
    {detail?.calculationMode==='five_channel_v1'&&detail.channelDefinition?<PerformanceChannelWorkflowPolicyEditor key={`workflow-${detail.workflowRevisionId??detail.versionId}-${detail.currentRevisionId}`} template={detail} canManage={canManage} onSaved={()=>saved(generation,detail.templateId)} externalBlocked={externalBlocked||busy} writeLock={mutation} onBusyChange={changeBusy}/>:null}
    {detail && !canManage ? <section className="ds-panel"><h3>{detail.displayName??detail.templateName} · V{detail.versionNo}</h3>{detail.calculationMode==='five_channel_v1'&&detail.channelDefinition?<><PerformanceChannelDefinitionFields config={detail.channelDefinition} change={()=>undefined} readOnly/><PerformanceChannelDefinitionHistory template={detail}/></>:null}{detail.dimensions.map(row => <p key={row.code}>{row.code} · {row.name} · 权重{Number(row.weight) * 100}% · {row.scoreMin}至{row.scoreMax}分</p>)}{detail.levels.map(row => <p key={row.code}>{row.code} · {row.name} · {row.scoreMin}至{row.scoreMax}分</p>)}<button type="button" className="ds-button ds-button-secondary" onClick={close}>关闭模板配置</button></section> : null}
  </section>;
}
