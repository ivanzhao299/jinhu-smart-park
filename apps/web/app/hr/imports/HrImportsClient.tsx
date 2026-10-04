"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { YUZHOU_INCREMENTAL_MAX_ITEMS } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { LocalJsonFilePicker } from "../../../components/files/LocalJsonFilePicker";
import { useAuthUser } from "../../../lib/auth-context";
import { apiRequest, createIdempotencyKey, type ApiRequestOptions } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { canEnterImport, createImportWorkbench, DOMAIN_LABELS, IMPORT_FILE_POLICY, importContextKey, missingImportPermissions } from "../import-workbench";
import styles from "./imports.module.css";

const endpoint = "/hr/imports/yuzhou/incremental";
async function request(path: string, options: ApiRequestOptions = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await apiRequest<unknown>(path, { ...options, token: getAccessToken(), signal: controller.signal })).data;
  } finally { clearTimeout(timer); }
}

export function HrImportsClient() {
  const user = useAuthUser();
  const context = importContextKey(user);
  const currentContext = useRef(context);
  currentContext.current = context;
  return <PermissionGuard module="hr" fallback={<ForbiddenState variant="page" reason="module" />}>
    {canEnterImport(user)
      ? <ImportWorkbench key={context} isCurrent={() => currentContext.current === context} />
      : <ForbiddenState variant="page" message="当前账号没有组织、岗位、员工、个人资料、劳动合同、家庭成员、技能、证照或培训导入与结果查询权限。" />}
  </PermissionGuard>;
}

function ImportWorkbench({ isCurrent }: { isCurrent: () => boolean }) {
  const user = useAuthUser();
  const [store] = useState(() => createImportWorkbench({ user, isCurrent, transport: {
    key: createIdempotencyKey,
    preview: (pkg, key) => request(`${endpoint}/preview`, { method: "POST", body: pkg, idempotencyKey: key }),
    commit: (id, key) => request(`${endpoint}/${id}/commit`, { method: "POST", idempotencyKey: key }, 90_000),
    status: id => request(`${endpoint}/${id}`)
  } }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => () => store.cancel(), [store]);
  useEffect(() => { setConfirmed(false); }, [state.operation, state.summary, state.uncertain]);
  const missing = state.summary ? missingImportPermissions(user, state.summary).length > 0 : false;
  const operation = state.operation;
  const statusLabel = operation?.status === "committed" ? "已完成" : operation?.status === "conflicted" ? "已完成，含冲突" : "已预览，待提交";
  const activeQueryId = state.uncertain ? operation?.id ?? "" : queryId ?? operation?.id ?? "";
  return <main className={`content ds-page ${styles.page}`}>
    <section className="ds-hero">
      <div className="ds-hero-copy"><span className="ds-eyebrow">人力资源管理</span><h1>数据导入</h1>
        <p>选择源数据包，检查预览后明确提交。导入的记录进入正常组织岗位、员工档案、合同台账、家庭成员、技能、证照和培训记录。</p>
        <p>当前园区：{user?.current_park?.park_name ?? user?.park_name ?? "当前登录园区"}</p></div>
      <Link className="ds-button ds-button-secondary" href="/hr/employees">返回员工档案</Link>
    </section>
    {state.error ? <div className="ds-panel" role="alert">{state.error}</div> : null}
    <section className={`ds-panel ${styles.section}`} aria-labelledby="source-heading">
      <div><span className="ds-eyebrow">第一步</span><h2 id="source-heading">选择数据包</h2>
        <p>当前园区内支持组织、岗位、员工、个人资料、劳动合同、家庭成员、技能、证照和培训历史，每包最多 {YUZHOU_INCREMENTAL_MAX_ITEMS} 条。混合包需要每个所含模块的管理权限。</p>
        <p className="ds-field-hint">招聘、考勤、薪酬、保险、培训计划和附件等来源尚不支持通过此入口导入。</p></div>
      <LocalJsonFilePicker policy={IMPORT_FILE_POLICY} fileName={state.summary?.fileName} disabled={!!state.busy || state.uncertain}
        onSelect={file => { setQueryId(null); setConfirmed(false); void store.select(file); }} />
      {state.summary ? <div className={styles.records}>
        {state.summary.domains.map(row => <article className="ds-mobile-record" key={row.domain}>
          <strong>{DOMAIN_LABELS[row.domain]} · {row.count} 条</strong>
          <span>涉及字段：{row.fields.length ? row.fields.join("、") : "无业务字段变更"}</span>
        </article>)}
      </div> : null}
      <div className={styles.actions}><button className="ds-button ds-button-primary" type="button"
        disabled={!!state.busy || !state.summary || !!missing || state.uncertain}
        onClick={() => { setQueryId(null); setConfirmed(false); void store.preview(); }}>预览数据包</button>
        {state.previewRetryAvailable ? <button className="ds-button ds-button-secondary" type="button" disabled={!!state.busy || state.uncertain}
          onClick={() => { setQueryId(null); setConfirmed(false); void store.preview(true); }}>重试本次预览</button> : null}
        <span className="ds-field-hint">预览不修改业务记录；提交前由服务端验证来源、权限和字段冲突。</span></div>
    </section>
    <section className={`ds-panel ${styles.section}`} aria-labelledby="preview-heading">
      <div><span className="ds-eyebrow">第二步</span><h2 id="preview-heading">检查预览与提交</h2></div>
      {operation ? <>
        <p role="status">{state.uncertain ? "提交结果待确认" : statusLabel} · 共 {operation.itemCount} 条</p>
        <label className="form-field"><span>操作编号（可复制保存，用于恢复查询）</span><input readOnly value={operation.id} /></label>
        {operation.actions ? <div className="ds-kpi-grid">
          {([["create", "新增"], ["update", "更新"], ["unchanged", "不变"], ["conflict", "冲突"]] as const).map(([action, label]) =>
            <article className="ds-kpi-card" key={action}><span>{label}</span><strong>{operation.actions![action]}</strong></article>)}
        </div> : operation.status === "previewed" ? <p>此数据包已有预览操作，服务端返回其当前状态。逐项计划未重新返回；提交时会重新检查冲突。</p> : null}
        {operation.results ? <div className={styles.records}>
          <article className="ds-mobile-record"><strong>最终结果</strong><span>已应用 {operation.results.applied} 条 · 不变 {operation.results.unchanged} 条 · 冲突 {operation.results.conflicts} 条</span>
            <span>{operation.results.conflicts ? "冲突记录未应用，请按业务流程核对处理；重复提交此操作不会重新执行。" : "此操作已完成，重复预览相同数据包会返回已有结果。"}</span></article>
        </div> : null}
        {state.canCommit ? <div className={styles.section}>
          <label className={styles.confirmation}><input type="checkbox" checked={confirmed} disabled={!!state.busy} onChange={event => setConfirmed(event.target.checked)} />
            <span>我已检查此数据包和当前园区，确认提交。无冲突的记录将应用，冲突记录需另行处理。</span></label>
          <button className="ds-button ds-button-primary" type="button" disabled={!!state.busy || !confirmed} onClick={() => void store.commit()}>确认提交此数据包</button>
        </div> : operation.status === "previewed" && !state.uncertain ? <p>如需提交，请在当前园区重新选择此数据包并预览，以确认对应文件和管理权限。</p> : null}
        {state.uncertain ? <button type="button" className="ds-button ds-button-primary" disabled={!!state.busy} onClick={() => void store.query(operation.id)}>查询本次提交状态</button> : null}
      </> : <p>选择文件并点击“预览数据包”，将在此显示新增、更新、不变和冲突数量。</p>}
    </section>
    <section className={`ds-panel ${styles.section}`} aria-labelledby="result-heading">
      <div><span className="ds-eyebrow">结果查询</span><h2 id="result-heading">按操作编号恢复结果</h2>
        <p>刷新页面或重新登录后，可使用已保存的操作编号查询。请保持创建此操作时的园区上下文。</p></div>
      <form className={styles.section} onSubmit={event => { event.preventDefault(); setConfirmed(false); void store.query(activeQueryId.trim()); }}>
        <label className="form-field"><span>操作编号</span><input value={activeQueryId} maxLength={36} required disabled={!!state.busy || state.uncertain}
          placeholder="输入预览或提交返回的操作编号" onChange={event => setQueryId(event.target.value)} autoComplete="off" spellCheck={false} /></label>
        <div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={!!state.busy || !activeQueryId} type="submit">查询状态</button>
          <span className="ds-field-hint">查询需要包内所有模块的读取或管理权限。</span></div>
      </form>
    </section>
    {state.busy ? <p role="status" aria-live="polite">{({ reading: "正在读取数据包…", preview: "正在生成预览…", commit: "正在提交，请保留操作编号…", status: "正在查询状态…" })[state.busy]}</p> : null}
  </main>;
}
