"use client";

import {useEffect, useRef, useState} from 'react';
import {validateHrPerformanceChannelDefinition, validateHrPerformanceWorkflowPolicy, validateHrPerformanceSourceTemplateActivation, validateHrPerformanceSourceReviewActivation, type HrPerformanceChannelDefinition, type HrPerformanceWorkflowPolicy, type HrPerformanceSourceDraftDetail, type HrPerformanceSourceActivationPreview, type HrPerformanceSourceActivationReceipt, type HrPerformanceSourceActivationHistory, type HrPerformanceSourceTemplateTarget, type HrPerformanceSourceTemplateActivation, type HrPerformanceSourceReviewActivation} from '@jinhu/shared';
import {hrApi, type HrPerformanceTemplateDetailV2, type HrPerformanceTemplateV2} from '../../../lib/hr-api';
import {getAccessToken} from '../../../lib/authz';
import {ApiError, createIdempotencyKey} from '../../../lib/api-client';
import styles from './performance-source-drafts.module.css';
import {sourceFieldLabel} from './performance-source-fields';

/** Copy only explicitly selected business policies; source catalog and independent details stay intact. */
export function copyPerformanceSourcePolicies(
  definition: HrPerformanceChannelDefinition,
  workflow: HrPerformanceWorkflowPolicy,
  template: Pick<HrPerformanceTemplateDetailV2, 'calculationMode' | 'channelDefinition' | 'channelWorkflow'>,
): {definition: HrPerformanceChannelDefinition; workflow: HrPerformanceWorkflowPolicy} {
  if (template.calculationMode !== 'five_channel_v1' || !template.channelDefinition || !template.channelWorkflow) {
    throw new Error('该版本没有可复制的五渠道办理政策。');
  }
  const nextDefinition = structuredClone(definition);
  const nextWorkflow = structuredClone(workflow);
  nextDefinition.channels = structuredClone(template.channelDefinition.channels);
  for (const field of ['master', 'timekeep', 'bonus'] as const) {
    nextDefinition.adjustmentPolicy[field] = {
      ...structuredClone(template.channelDefinition.adjustmentPolicy[field]),
      sourceSwitch: definition.adjustmentPolicy[field].sourceSwitch,
    };
  }
  nextWorkflow.masterPolicies = structuredClone(template.channelWorkflow.masterPolicies);
  // A template without the optional capability must not silently discard source detail notes.
  const detailAppeal = nextWorkflow.appealReviewAllowed.detailAppraisal;
  nextWorkflow.appealReviewAllowed = structuredClone(template.channelWorkflow.appealReviewAllowed);
  if (template.channelWorkflow.detailAppraisalPolicy) {
    nextWorkflow.detailAppraisalPolicy = structuredClone(template.channelWorkflow.detailAppraisalPolicy);
  } else if (nextWorkflow.detailAppraisalPolicy) {
    nextWorkflow.appealReviewAllowed.detailAppraisal = detailAppeal ?? null;
  }
  return {definition: nextDefinition, workflow: nextWorkflow};
}

type ActivationProps = {
  detail: HrPerformanceSourceDraftDetail;
  canManage: boolean;
  dirty: boolean;
  externalBlocked?: boolean;
  writeLock?: {current: boolean};
  onBusyChange?: (busy: boolean) => void;
  configure: (value: {definition: HrPerformanceChannelDefinition; workflow: HrPerformanceWorkflowPolicy}) => void;
  onOpenFormal?: (receipt: HrPerformanceSourceActivationReceipt) => void;
};
type ActivationAttempt = {
  body: HrPerformanceSourceTemplateActivation | HrPerformanceSourceReviewActivation;
  token: string | undefined;
  key: string;
};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sha = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const definitionFieldLabels: Record<string, string> = {
  'definition.schemaVersion': '评分定义格式', 'definition.displayName': '考核表名称', 'definition.departmentLabel': '适用部门',
  'definition.weights': '渠道权重', 'definition.channels': '渠道办理政策', 'definition.adjustmentPolicy': '调整项办理政策',
  'definition.items': '考核项目与等级指南', 'definition.gradeCandidates': '考核等级',
};
const readinessMessages: Record<string, string> = {
  DEFINITION_REQUIRED: '请配置评分定义。', WORKFLOW_REQUIRED: '请配置办理政策。', WORKFLOW_INCOMPLETE: '请补齐办理阶段、职责和必填政策。',
  PROFILE_REQUIRED: '当前资料尚未匹配到明确的考核表。', MAPPING_INCOMPLETE: '项目、等级或明细关联不完整，请核对配置。', MAPPED_IDENTITY_MISMATCH: '配置中的项目、等级或明细与资料不一致，请比较后修订。',
  SOURCE_NOT_QUALIFIED: '来源依据尚未满足初值启用条件；如按当前业务新建，请明确选择建立方式。',
  EMPLOYEE_REQUIRED: '请在业务绑定中选择员工。', EMPLOYEE_NOT_ACTIVE: '绑定员工当前不可用于建立考核，请核对员工状态。', EMPLOYEE_IDENTITY_MISMATCH: '绑定员工与来源对应人员不一致；来源初值启用需要对应同一员工。',
  ORG_REQUIRED: '请在业务绑定中选择组织。', ORG_NOT_ACTIVE: '绑定组织当前不可用，请重新选择。', EMPLOYEE_ORG_MISMATCH: '绑定组织与员工当前所属组织不一致，请核对。',
  PERIOD_REQUIRED: '请补齐开始日期、结束日期和业务期间编号。', DETAIL_APPRAISAL_POLICY_REQUIRED: '资料有逐条明细评语，请明确启用明细评语并配置其办理政策。',
  SOURCE_POLICY_TEXT_CONFLICT: '来源正文与当前必填或空值政策不兼容，请核对相应明细及政策。',
};
function validReceipt(value: HrPerformanceSourceActivationReceipt, detail: HrPerformanceSourceDraftDetail, currentRevision = true, target?: HrPerformanceSourceTemplateTarget) {
  if (!value || Object.keys(value).sort().join(',') !== 'cycleId,draftId,draftRevisionId,inputRevisionId,outcome,receiptId,reviewId,templateId,templateVersionId') return false;
  if (value.draftId !== detail.draftId || !uuid(value.draftRevisionId) || currentRevision && value.draftRevisionId !== detail.revisionId || !['created', 'alreadyActivated'].includes(value.outcome)) return false;
  if (![value.receiptId, value.templateId, value.templateVersionId].every(uuid)) return false;
  if (target?.mode === 'new_version' && (value.templateId !== target.templateId || value.templateVersionId === target.expectedVersionId)) return false;
  return detail.kind === 'template' ? value.cycleId === null && value.reviewId === null && value.inputRevisionId === null : [value.cycleId, value.reviewId, value.inputRevisionId].every(uuid);
}
function FormalReceipt({receipt, open, disabled}: {receipt: HrPerformanceSourceActivationReceipt; open?: ActivationProps['onOpenFormal']; disabled: boolean}) {
  return <section className={`ds-panel ${styles.record}`} aria-label="正式办理回执"><h4>正式记录已建立</h4>
    <p>{receipt.reviewId ? '考核已建立，请继续通过普通绩效流程办理。' : '可编辑的正式模板版本已建立，请检查配置后发布。'}</p>
    {open ? <button type="button" className="ds-button ds-button-primary" disabled={disabled} onClick={() => open(receipt)}>{receipt.reviewId ? '继续办理正式考核' : '查看正式模板'}</button> : <a className="ds-button ds-button-secondary" href="/hr/performance">进入绩效工作台</a>}
    <details><summary>办理凭据</summary><dl className={styles.trace}><div><dt>回执编号</dt><dd>{receipt.receiptId}</dd></div><div><dt>正式版本编号</dt><dd>{receipt.templateVersionId}</dd></div>{receipt.reviewId ? <div><dt>考核编号</dt><dd>{receipt.reviewId}</dd></div> : null}</dl></details>
  </section>;
}

export function PerformanceSourceActivation({detail, canManage, dirty, externalBlocked = false, writeLock, onBusyChange, configure, onOpenFormal}: ActivationProps) {
  const [open, setOpen] = useState(false), [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<HrPerformanceSourceActivationPreview | null>(null);
  const [history, setHistory] = useState<HrPerformanceSourceActivationHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(1), [historyReload, setHistoryReload] = useState(0);
  const [historyError, setHistoryError] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<HrPerformanceSourceActivationReceipt | null>(null);
  const [mode, setMode] = useState<'qualified_source' | 'manual_current'>('qualified_source');
  const [targetMode, setTargetMode] = useState<'new' | 'new_version'>('new');
  const [templateCode, setTemplateCode] = useState(''), [templateName, setTemplateName] = useState(''), [versionName, setVersionName] = useState('');
  const [cycleCode, setCycleCode] = useState(''), [cycleName, setCycleName] = useState(''), [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false), [differencePage, setDifferencePage] = useState(1);
  const [templates, setTemplates] = useState<HrPerformanceTemplateV2[] | null>(null), [selectedTemplate, setSelectedTemplate] = useState('');
  const [targetDetail, setTargetDetail] = useState<HrPerformanceTemplateDetailV2 | null>(null), [targetReload, setTargetReload] = useState(0), [targetError, setTargetError] = useState('');
  const alive = useRef(true), generation = useRef(0), flight = useRef(false), ownsLock = useRef(false);
  const attempt = useRef<ActivationAttempt | null>(null), request = useRef<AbortController | null>(null);
  const callback = useRef(onBusyChange); callback.current = onBusyChange;
  const release = () => {if (!ownsLock.current) return; ownsLock.current = false; if (writeLock) writeLock.current = false; callback.current?.(false);};
  const acquire = () => {if (writeLock?.current && !ownsLock.current) return false; ownsLock.current = true; if (writeLock) writeLock.current = true; callback.current?.(true); return true;};
  useEffect(() => {alive.current = true; return () => {alive.current = false; generation.current++; request.current?.abort(); if (ownsLock.current) {ownsLock.current = false; if (writeLock) writeLock.current = false; callback.current?.(false);}};}, [writeLock]);
  useEffect(() => {
    if (!open || attempt.current || receipt || !acquire()) return;
    const controller = new AbortController(), current = ++generation.current;
    request.current?.abort(); request.current = controller;
    setPreview(null); setError(''); setBusy(true); setAcknowledged(false); setDifferencePage(1);
    hrApi.performanceSourceActivationPreview(detail.draftId, detail.revisionId, getAccessToken(), controller.signal).then(row => {
      if (!alive.current || controller.signal.aborted || current !== generation.current) return;
      if (row.draftId !== detail.draftId || row.kind !== detail.kind || row.currentRevisionId !== detail.revisionId || row.manifestSha256 !== detail.revision.manifest.manifestSha256 || !sha(row.qualificationHash) || !sha(row.differenceSha256) || typeof row.sourceQualified !== 'boolean' || !Array.isArray(row.availableModes) || row.availableModes.some(value => !['template_draft', 'qualified_source', 'manual_current'].includes(value))) throw new Error('INVALID_PREVIEW');
      setPreview(row);
      if (row.existingActivation) {if (!validReceipt(row.existingActivation, detail, false)) throw new Error('INVALID_EXISTING_RECEIPT'); setReceipt(row.existingActivation);}
    }).catch(reason => {
      if (alive.current && !controller.signal.aborted && current === generation.current) setError(reason instanceof ApiError && reason.status === 409 ? '资料或来源已更新，请先重新读取资料并比较修改。当前草稿保留。' : '读取正式办理预览失败，请重新读取。');
    }).finally(() => {if (alive.current && current === generation.current) {setBusy(false); release();}});
    return () => {controller.abort(); if (!attempt.current) release();};
    // The target is keyed by its saved revision. Busy publication must not cancel its own read.
  }, [open, reload, detail.draftId, detail.revisionId]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setHistory(null); setHistoryError('');
    hrApi.performanceSourceActivations(detail.draftId, historyPage, getAccessToken(), controller.signal).then(row => {
      if (!controller.signal.aborted && alive.current) setHistory(row);
    }).catch(() => {if (!controller.signal.aborted && alive.current) setHistoryError(receipt ? '正式记录已建立，读取办理历史失败；请重试读取，勿重复启用。' : '读取办理历史失败，请重试。');});
    return () => controller.abort();
    // Receipt publication schedules a read separately; it never resends a successful POST.
  }, [open, detail.draftId, historyPage, historyReload]);
  useEffect(() => {
    if (!open || !canManage || targetMode !== 'new_version' || uncertain || receipt) return;
    const controller = new AbortController(); setTemplates(null); setTargetError('');
    hrApi.performanceTemplatesV2(getAccessToken(), controller.signal).then(rows => {if (!controller.signal.aborted) setTemplates(rows.filter(row => row.calculationMode === 'five_channel_v1'));}).catch(() => {if (!controller.signal.aborted) setTargetError('读取正式模板失败，请重试。');});
    return () => controller.abort();
  }, [open, canManage, targetMode, uncertain, receipt, targetReload]);
  useEffect(() => {
    setTargetDetail(null);
    const selected = templates?.find(row => row.id === selectedTemplate);
    if (!selected?.versionId || targetMode !== 'new_version' || !canManage || uncertain || receipt) return;
    const controller = new AbortController(); setTargetError('');
    hrApi.performanceTemplateDetailV2(selected.id, getAccessToken(), controller.signal).then(row => {
      if (controller.signal.aborted) return;
      if (row.templateId !== selected.id || row.versionId !== selected.versionId || row.calculationMode !== 'five_channel_v1' || !row.currentRevisionId) throw new Error('TARGET_MISMATCH');
      setTargetDetail(row);
    }).catch(() => {if (!controller.signal.aborted) setTargetError('读取目标模板当前版本失败，请重试。');});
    return () => controller.abort();
  }, [templates, selectedTemplate, targetMode, canManage, uncertain, receipt, targetReload]);
  const blocked = busy || uncertain || Boolean(externalBlocked && !ownsLock.current);
  const frozen = blocked || Boolean(receipt) || !canManage;
  const execute = async (current: ActivationAttempt) => {
    if (!alive.current || flight.current || attempt.current !== current || !acquire()) return;
    flight.current = true; setBusy(true); setError('');
    const controller = new AbortController(), currentGeneration = ++generation.current;
    request.current?.abort(); request.current = controller;
    try {
      const next = detail.kind === 'template' ? await hrApi.activatePerformanceSourceTemplate(detail.draftId, current.body, current.token, current.key, controller.signal) : await hrApi.activatePerformanceSourceReview(detail.draftId, current.body as HrPerformanceSourceReviewActivation, current.token, current.key, controller.signal);
      if (!alive.current || currentGeneration !== generation.current) return;
      if (!validReceipt(next, detail, true, current.body.target)) throw new Error('INVALID_RECEIPT');
      attempt.current = null; setUncertain(false); setReceipt(next); setHistoryReload(value => value + 1);
    } catch (reason) {
      if (!alive.current || currentGeneration !== generation.current) return;
      const definite = reason instanceof ApiError && ([400, 401, 403, 404, 422].includes(reason.status) || reason.status === 409 && !/idempotency.*(processing|does not match|reservation changed)/i.test(reason.message));
      if (definite) attempt.current = null;
      setUncertain(!definite);
      setError(definite ? reason instanceof ApiError && reason.status === 409 ? '资料、来源或正式版本已变化；当前填写已保留，请重新读取并比较后继续。' : '启用未通过，请核对字段、配置和当前操作权限；当前填写已保留。' : '尚未确认启用结果，请按原请求重试。');
    } finally {
      flight.current = false;
      if (alive.current) {setBusy(false); if (!attempt.current) release();}
    }
  };
  const submit = () => {
    if (!preview || frozen || dirty || flight.current || attempt.current || writeLock?.current) return;
    try {
      if (!acknowledged) throw new Error('请先核对并确认配置与待办差异。');
      let target: HrPerformanceSourceTemplateTarget;
      if (targetMode === 'new') target = {mode: 'new', templateCode, templateName, versionName};
      else {if (!targetDetail?.currentRevisionId) throw new Error('请先读取目标模板当前版本。'); target = {mode: 'new_version', templateId: targetDetail.templateId, expectedVersionId: targetDetail.versionId, expectedDefinitionRevisionId: targetDetail.currentRevisionId, expectedWorkflowRevisionId: targetDetail.workflowRevisionId ?? null, versionName};}
      const base = {expectedRevisionId: detail.revisionId, expectedManifestSha256: preview.manifestSha256, expectedQualificationSha256: preview.qualificationHash, target, reason, acknowledgedDifferenceSha256: preview.differenceSha256};
      const body = detail.kind === 'template' ? base : {...base, mode, cycleCode, cycleName};
      if (detail.kind === 'template') validateHrPerformanceSourceTemplateActivation(body); else validateHrPerformanceSourceReviewActivation(body);
      const current = {body: structuredClone(body), token: getAccessToken(), key: createIdempotencyKey('hr-performance-source-activation')};
      attempt.current = current; void execute(current);
    } catch (reason) {setError(reason instanceof Error && reason.message !== 'INVALID_SOURCE_ACTIVATION' ? reason.message : '请填写完整名称、编号和至少两字办理理由。');}
  };
  const visibleDifferences = preview?.pendingInputDifference.changes.filter(change => preview.salaryReferenceAvailable || change.field !== 'source_pay') ?? [];
  const canActivate = preview?.availableModes.includes(detail.kind === 'template' ? 'template_draft' : mode);
  return <section className={`ds-panel ${styles.record}`} aria-label="正式绩效办理">
    <h3>正式办理</h3><p>建立正式记录后，使用同一套绩效页面继续自评、主管评价、校准和结果签收。</p>
    <button type="button" className="ds-button ds-button-secondary" disabled={blocked || Boolean(attempt.current)} aria-expanded={open} onClick={() => setOpen(value => !value)}>查看正式办理与历史</button>
    {open ? <>
      {error ? <p role="alert">{error}</p> : null}
      {receipt ? <FormalReceipt receipt={receipt} open={onOpenFormal} disabled={blocked}/> : <>
        <button type="button" className="ds-button ds-button-secondary" disabled={blocked} onClick={() => setReload(value => value + 1)}>重新读取正式办理预览</button>
        {dirty ? <p role="status">当前资料有未保存修改，请先保存资料修订，再启用正式记录。</p> : null}
        {preview ? <>
          <p>当前资料含 {preview.mapping.items.length} 个项目、{preview.mapping.guides.length} 条指南、{preview.mapping.grades.length} 个等级和 {preview.mapping.details.length} 条独立明细。</p>
          {preview.readinessIssues.length ? <section aria-label="待完善事项"><h4>待完善事项</h4><ul>{preview.readinessIssues.map((issue, index) => {
            const detailIndex = issue.detailId ? preview.configuredWorkflow?.detailDefinitions.findIndex(row => row.id === issue.detailId) : undefined;
            return <li key={`${issue.code}:${issue.field ?? ''}:${issue.detailId ?? ''}:${index}`}>{detailIndex !== undefined && detailIndex >= 0 ? `明细 ${detailIndex + 1}：` : ''}{readinessMessages[issue.code] ?? '请核对当前资料的配置与业务绑定。'}</li>;
          })}</ul></section> : null}
          {canManage && preview.definitionProposal && preview.workflowProposal ? <button type="button" className="ds-button ds-button-secondary" disabled={frozen || dirty} onClick={() => configure({definition: structuredClone(preview.definitionProposal!), workflow: structuredClone(preview.workflowProposal!)})}>用来源目录建立配置草稿</button> : null}
          <section aria-label="启用差异"><h4>配置与后续待办</h4><p>评分配置相对来源有 {preview.definitionDifference.count} 处变化；资料中另有 {preview.pendingInputDifference.count} 处人工录入变化。来源初值启用保留原始值，这些人工变化继续按正常阶段权限办理。</p>
            <details><summary>查看全部差异</summary><ul>{preview.definitionDifference.fields.map(field => <li key={field}>{definitionFieldLabels[field] ?? '其他评分配置'}</li>)}</ul>
              {visibleDifferences.slice((differencePage - 1) * 10, differencePage * 10).map((change, index) => <dl className={styles.trace} key={`${change.family}:${change.sourceFactId}:${change.field}`}><div><dt>待办 {(differencePage - 1) * 10 + index + 1} · {sourceFieldLabel(change.field,{definition:preview.configuredDefinition})}</dt><dd>{Object.hasOwn(change, 'originalValue') ? `来源：${change.originalValue === null ? '未填写' : String(change.originalValue)}` : '来源值按当前权限隐藏'}</dd><dd>{Object.hasOwn(change, 'currentValue') ? `本次资料：${change.currentValue === null ? '未填写' : String(change.currentValue)}` : '资料值按当前权限隐藏'}</dd></div></dl>)}
              <div className={styles.actions}><button type="button" className="ds-button ds-button-secondary" disabled={differencePage === 1} onClick={() => setDifferencePage(value => value - 1)}>差异上一页</button><span>第 {differencePage} 页 · 共 {preview.pendingInputDifference.count} 项</span><button type="button" className="ds-button ds-button-secondary" disabled={differencePage * 10 >= visibleDifferences.length} onClick={() => setDifferencePage(value => value + 1)}>差异下一页</button></div>
            </details>
          </section>
          {canManage ? <fieldset className="ds-panel" aria-label="正式办理配置" disabled={frozen}>
            {detail.kind === 'review' ? <><label className="form-field"><span>考核建立方式</span><select value={mode} onChange={event => {setMode(event.target.value as typeof mode); setAcknowledged(false);}}><option value="qualified_source" disabled={!preview.availableModes.includes('qualified_source')}>来源初值启用</option><option value="manual_current" disabled={!preview.availableModes.includes('manual_current')}>作为当前业务新建</option></select></label><p>{mode === 'qualified_source' ? '带入已验证的原始初值，后续操作仍由实际角色完成。' : '按当前人员、期间和配置建立空白考核，由实际角色在各阶段录入。'}</p><p>人员、组织和业务期间使用已保存的资料绑定；请在上方业务绑定中维护。</p></> : null}
            <label className="form-field"><span>正式模板目标</span><select value={targetMode} onChange={event => {setTargetMode(event.target.value as typeof targetMode); setAcknowledged(false);}}><option value="new">建立新模板</option><option value="new_version">已有模板续建新版本</option></select></label>
            {targetMode === 'new' ? <div className={styles.fields}><label className="form-field"><span>新模板编号</span><input maxLength={128} value={templateCode} onChange={event => setTemplateCode(event.target.value)}/></label><label className="form-field"><span>新模板名称</span><input maxLength={240} value={templateName} onChange={event => setTemplateName(event.target.value)}/></label></div> : <><label className="form-field"><span>目标正式模板</span><select value={selectedTemplate} onChange={event => {setSelectedTemplate(event.target.value); setTargetDetail(null);}}><option value="">请选择模板</option>{templates?.map(row => <option key={row.id} value={row.id}>{row.templateName} · {row.templateCode}</option>)}</select></label>{targetError ? <p role="alert">{targetError}</p> : null}<button type="button" className="ds-button ds-button-secondary" onClick={() => setTargetReload(value => value + 1)}>重新读取目标模板</button>{targetDetail ? <p>基于当前版本：{targetDetail.versionName}。启用时将再次核对该版本是否已变化。</p> : <p>请读取并选择目标模板当前版本。</p>}</>}
            <label className="form-field"><span>新版本名称</span><input maxLength={240} value={versionName} onChange={event => setVersionName(event.target.value)}/></label>
            {detail.kind === 'review' ? <div className={styles.fields}><label className="form-field"><span>新考核周期编号</span><input maxLength={128} value={cycleCode} onChange={event => setCycleCode(event.target.value)}/></label><label className="form-field"><span>新考核周期名称</span><input maxLength={240} value={cycleName} onChange={event => setCycleName(event.target.value)}/></label></div> : null}
            <label className="form-field"><span>正式办理理由</span><textarea minLength={2} maxLength={4000} value={reason} onChange={event => setReason(event.target.value)}/></label>
            <label className={styles.choice}><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/>我已核对配置与待办差异，确认按所选方式建立正式记录</label>
            <button type="button" className="ds-button ds-button-primary" disabled={dirty || !canActivate || !acknowledged || targetMode === 'new_version' && !targetDetail} onClick={submit}>{detail.kind === 'template' ? '建立正式模板草稿' : '启用正式考核'}</button>
          </fieldset> : <p>当前角色可查看办理依据与历史；正式启用需要对应资料和模板的管理权限。</p>}
          <details><summary>来源核对依据</summary><dl className={styles.trace}><div><dt>资料版本校验</dt><dd>{preview.manifestSha256}</dd></div><div><dt>资格校验</dt><dd>{preview.qualificationHash}</dd></div><div><dt>待完善项</dt><dd>{preview.qualificationGateCodes.join('、') || '来源依据核对通过'}</dd></div></dl></details>
        </> : busy ? <p>正在核对资料与正式办理配置…</p> : null}
      </>}
      {uncertain ? <button type="button" className="ds-button ds-button-primary" disabled={busy} onClick={() => {if (attempt.current) void execute(attempt.current);}}>按原请求重试正式启用</button> : null}
      <section aria-label="正式办理历史"><h4>正式办理历史</h4>{historyError ? <p role="alert">{historyError}</p> : null}<button type="button" className="ds-button ds-button-secondary" disabled={busy} onClick={() => setHistoryReload(value => value + 1)}>重试读取办理历史</button>
        {history ? <><div className={styles.actions}><button type="button" className="ds-button ds-button-secondary" disabled={historyPage === 1} onClick={() => setHistoryPage(value => value - 1)}>办理历史上一页</button><span>第 {historyPage} 页 · 共 {history.total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={historyPage * 10 >= history.total} onClick={() => setHistoryPage(value => value + 1)}>办理历史下一页</button></div><div className="ds-scene-grid">{history.items.map(row => <article className="ds-mobile-record" key={row.receiptId}><strong>{row.mode === 'template_draft' ? '正式模板草稿' : row.mode === 'manual_current' ? '当前业务考核' : '来源初值考核'}</strong><span>{row.actorName ?? '办理人'} · {row.createdAt}</span><p>{row.reason}</p><details><summary>本次启用依据与待办</summary><p>配置变化 {row.definitionDifference.count} 处；待按正常权限办理的人工变化 {row.pendingInputDifference.count} 处。</p><dl className={styles.trace}><div><dt>资料版本校验</dt><dd>{row.provenance.manifestSha256}</dd></div><div><dt>启用时来源核对</dt><dd>{row.sourceQualifiedAtActivation?"通过":"作为当前业务参考"}</dd></div><div><dt>来源身份校验</dt><dd>{row.provenance.sourceIdentitySha256}</dd></div></dl></details><FormalReceipt receipt={{receiptId: row.receiptId, draftId: row.draftId, draftRevisionId: row.draftRevisionId, templateId: row.templateId, templateVersionId: row.templateVersionId, cycleId: row.cycleId, reviewId: row.reviewId, inputRevisionId: row.inputRevisionId, outcome: 'alreadyActivated'}} open={onOpenFormal} disabled={blocked}/></article>)}</div>{!history.total ? <p>暂无正式办理记录。</p> : null}</> : historyError ? null : <p>正在读取办理历史…</p>}
      </section>
    </> : null}
  </section>;
}

export function PerformanceSourcePolicyCopy({definition, workflow, disabled, change}: {
  definition: HrPerformanceChannelDefinition;
  workflow: HrPerformanceWorkflowPolicy;
  disabled: boolean;
  change: (value: {definition: HrPerformanceChannelDefinition; workflow: HrPerformanceWorkflowPolicy}) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<HrPerformanceTemplateV2[] | null>(null);
  const [selected, setSelected] = useState('');
  const [version, setVersion] = useState('');
  const [detail, setDetail] = useState<Pick<HrPerformanceTemplateDetailV2, 'calculationMode' | 'channelDefinition' | 'channelWorkflow'> | null>(null);
  const [policyParent, setPolicyParent] = useState<HrPerformanceTemplateDetailV2 | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    setTemplates(null);
    setError('');
    hrApi.performanceTemplatesV2(getAccessToken(), controller.signal).then(rows => {
      if (!controller.signal.aborted) setTemplates(rows);
    }).catch(() => {
      if (!controller.signal.aborted) setError('读取可复制政策的模板失败，请重试。');
    });
    return () => controller.abort();
  }, [open, disabled, reload]);
  useEffect(() => {
    setPolicyParent(null); setDetail(null);
    if (!open || disabled || !selected) return;
    const controller = new AbortController(); setError('');
    hrApi.performanceTemplateDetailV2(selected, getAccessToken(), controller.signal).then(parent => {
      if (controller.signal.aborted) return;
      if (parent.templateId !== selected || !parent.versionId) throw new Error('模板版本归属不匹配');
      setPolicyParent(parent);
    }).catch(() => {if (!controller.signal.aborted) setError('读取所选政策版本失败，请重新读取。');});
    return () => controller.abort();
  }, [open, disabled, selected, reload]);
  useEffect(() => {
    setDetail(null);
    if (!open || disabled || !version || !policyParent) return;
    const controller = new AbortController(), current = ++generation.current;
    setError('');
    const member = policyParent.versions?.some(row => row.id === version && row.calculationMode === 'five_channel_v1') || policyParent.versionId === version && policyParent.calculationMode === 'five_channel_v1';
    if (!member) {setError('读取所选政策版本失败，请重新读取。'); return () => controller.abort();}
    const token = getAccessToken();
    Promise.all([
      hrApi.performanceChannelHistoryV2(version, 1, token, controller.signal),
      hrApi.performanceChannelWorkflowHistoryV2(version, 1, token, controller.signal),
    ]).then(([definitions, workflows]) => {
      if (controller.signal.aborted || current !== generation.current) return;
      if (definitions.versionId !== version || workflows.versionId !== version) throw new Error('政策版本不匹配');
      const definition = definitions.items.find(row => row.id === definitions.currentRevisionId);
      const workflow = workflows.items.find(row => row.id === workflows.currentRevisionId);
      if (!definition || !workflow || workflow.definitionRevisionId !== definition.id) throw new Error('定义与政策版本不匹配');
      validateHrPerformanceChannelDefinition(definition.config);
      validateHrPerformanceWorkflowPolicy(workflow.policy, definition.config);
      setDetail({calculationMode: 'five_channel_v1', channelDefinition: definition.config, channelWorkflow: workflow.policy});
    }).catch(() => {
      if (!controller.signal.aborted && current === generation.current) setError('读取所选政策版本失败，请重新读取。');
    });
    return () => {generation.current++; controller.abort();};
  }, [open, disabled, policyParent, version]);
  const versions = policyParent?.versions?.filter(row => row.calculationMode === 'five_channel_v1') ?? (policyParent?.calculationMode === 'five_channel_v1' ? [{id: policyParent.versionId, versionName: policyParent.versionName}] : []);
  return <section className={`ds-panel ${styles.record}`} aria-label="复制办理政策">
    <button type="button" className="ds-button ds-button-secondary" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}>从已有模板复制办理政策</button>
    {open ? <>
      <p>只复制填写职责、阶段和申诉政策；当前资料的评分项目、等级、指南、比例和独立明细保留。复制后请检查并保存资料修订。</p>
      {error ? <><p role="alert">{error}</p><button type="button" className="ds-button ds-button-secondary" disabled={disabled} onClick={() => setReload(value => value + 1)}>重试读取办理政策</button></> : null}
      {templates ? <div className={styles.fields}>
        <label className="form-field"><span>政策参考模板</span><select disabled={disabled} value={selected} onChange={event => {setSelected(event.target.value); setVersion(''); setDetail(null);}}><option value="">请选择模板</option>{templates.map(row => <option key={row.id} value={row.id}>{row.templateName} · {row.templateCode}</option>)}</select></label>
        <label className="form-field"><span>政策参考版本</span><select disabled={disabled || !policyParent || !versions.length} value={version} onChange={event => {setVersion(event.target.value); setDetail(null);}}><option value="">请选择版本</option>{versions.map(row => <option key={row.id} value={row.id}>{row.versionName}</option>)}</select></label>
      </div> : error ? null : <p>正在读取可复制政策的模板…</p>}
      <button type="button" className="ds-button ds-button-secondary" disabled={disabled || !detail?.channelWorkflow || !detail.channelDefinition} onClick={() => {
        if (!detail || disabled) return;
        try {change(copyPerformanceSourcePolicies(definition, workflow, detail)); setError('');}
        catch (reason) {setError(reason instanceof Error ? reason.message : '复制政策失败，当前配置已保留。');}
      }}>将所选政策复制到当前配置</button>
    </> : null}
  </section>;
}
