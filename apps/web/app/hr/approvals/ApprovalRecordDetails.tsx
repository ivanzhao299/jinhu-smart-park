"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrApproval, type HrApprovalHistory, type HrApprovalRevision } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";

const actionLabels: Record<string, string> = { submit: "提交申请", resubmit: "重新提交", withdraw: "撤回申请", approve: "审核通过", return: "退回补充", edit: "修改内容" };
const stateLabels: Record<string, string> = { draft: "草稿", submitted: "待审核", returned: "已退回", approved: "已通过", withdrawn: "已撤回" };

export function ApprovalRecordDetails({ item, canEdit, blocked, onRevise, onEditingChange }: {
  item: HrApproval;
  canEdit: boolean;
  blocked: boolean;
  onRevise: (body: HrApprovalRevision) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HrApprovalHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HrApprovalRevision | null>(null);
  const request = useRef<AbortController | null>(null);
  const editingOwner = useRef(onEditingChange);
  editingOwner.current = onEditingChange;

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await hrApi.approvalHistory(item.id, getAccessToken(), controller.signal);
      if (controller.signal.aborted) return;
      if (result.request?.id !== item.id || !Array.isArray(result.actions)) throw new Error("申请记录无法核对，请刷新重试。");
      setHistory(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "加载办理记录失败");
    } finally {
      if (!controller.signal.aborted && request.current === controller) setLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (open) void load();
    return () => request.current?.abort();
  }, [open, load]);
  useEffect(() => () => editingOwner.current(false), []);

  const editable = canEdit && history && ["draft", "returned"].includes(history.request.status)
    && Number.isInteger(history.request.version) && (history.request.version ?? 0) >= 1;
  const beginEdit = () => {
    if (!editable || blocked || loading || !history) return;
    const description = history.request.payload?.description;
    if (description !== undefined && typeof description !== "string") {
      setError("申请说明格式无法核对，请联系管理员处理。");
      return;
    }
    setDraft({ expectedVersion: history.request.version!, title: history.request.title, description: description ?? "", reason: "" });
    setEditing(true);
    onEditingChange(true);
  };
  const cancelEdit = () => { setEditing(false); setDraft(null); onEditingChange(false); };
  const returned = history ? [...history.actions].reverse().find(action => action.action === "return") : undefined;

  return <div>
    <button type="button" className="ds-button ds-button-secondary" disabled={editing} onClick={() => setOpen(value => !value)}>{open ? "收起办理记录" : "查看办理记录"}</button>
    {open ? <section aria-label={`${item.requestNo}办理记录`}>
      <div className={styles.heroActions}>
        <h3>办理记录</h3>
        <button type="button" className="ds-button" disabled={loading || editing} onClick={() => void load()}>刷新记录</button>
        {editable ? <button type="button" className="ds-button" disabled={blocked || loading || editing} onClick={beginEdit}>修改申请内容</button> : null}
      </div>
      {loading ? <p role="status">正在加载办理记录…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {returned ? <p>最近退回意见：{returned.comment || "未填写意见"}</p> : null}
      {editing && draft ? <form className={styles.formGrid} onSubmit={event => {
        event.preventDefault();
        if (!blocked) onRevise({ ...draft, title: draft.title.trim(), description: draft.description.trim(), reason: draft.reason.trim() });
      }}>
        <label className="form-field"><span>申请标题</span><input required maxLength={200} value={draft.title} disabled={blocked} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="form-field"><span>申请说明</span><textarea required maxLength={3000} value={draft.description} disabled={blocked} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="form-field"><span>修改原因</span><input required maxLength={1000} value={draft.reason} disabled={blocked} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
        <div className={styles.formActions}><button type="submit" className="ds-button ds-button-primary" disabled={blocked || !draft.title.trim() || !draft.description.trim() || !draft.reason.trim()}>保存修改</button><button type="button" className="ds-button" disabled={blocked} onClick={cancelEdit}>取消修改</button></div>
      </form> : null}
      {history ? <div className={styles.approvalHistoryList}>
        {history.actions.length === 0 ? <p>尚无提交或审核记录。</p> : history.actions.map(action => <article className={`ds-mobile-record ${styles.approvalHistoryRecord}`} key={action.id}>
          <strong>{actionLabels[action.action] ?? action.action}</strong>
          <span>{action.actorDisplayName || "办理人姓名未记录"} · {new Date(action.createTime).toLocaleString("zh-CN")}</span>
          <span>{stateLabels[action.beforeStatus] ?? action.beforeStatus} → {stateLabels[action.afterStatus] ?? action.afterStatus}</span>
          {action.comment ? <p>{action.comment}</p> : null}
          {action.beforeContent && action.afterContent ? <div className={styles.approvalContentChanges}><p><strong>修改前标题</strong><span>{action.beforeContent.title}</span></p><p><strong>修改后标题</strong><span>{action.afterContent.title}</span></p><p><strong>修改前说明</strong><span>{action.beforeContent.description || "未填写"}</span></p><p><strong>修改后说明</strong><span>{action.afterContent.description || "未填写"}</span></p></div> : null}
        </article>)}
      </div> : null}
    </section> : null}
  </div>;
}
