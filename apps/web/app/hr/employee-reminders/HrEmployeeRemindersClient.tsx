"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrEmployeeReminder, type HrEmployeeReminderAction, type HrEmployeeReminderGenerateInput, type HrEmployeeReminderKind, type HrEmployeeReminderLeapPolicy, type HrEmployeeReminderRecipient, type HrEmployeeReminderStatus } from "../../../lib/hr-api";
import { hasAnyPermission, hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import { reminderActions, reminderGenerationInput, reminderIdFromMessage, reminderKinds, reminderLeaps, reminderStates } from "./employee-reminder-state";
import styles from "./employee-reminders.module.css";
import workbench from "../hr-workbench.module.css";

type EntryProps = { initialReminder?: string | null; invalidEntry?: boolean };
function useReminderResource<T>(key: string, loader: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const currentKey = useRef(key); currentKey.current = key;
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; data?: T; loading: boolean; error: string }>({ key, loading: enabled, error: "" });
  const reload = useCallback(async () => {
    // A completed mutation may hold a previous render's reload callback.
    // It must not abort or overwrite the currently selected record.
    if (currentKey.current !== key) return true;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const sequence = ++generation.current;
    if (!enabled) { setState({ key, loading: false, error: "" }); return true; }
    setState({ key, loading: true, error: "" });
    try {
      const data = await loader(request.signal);
      if (sequence !== generation.current || currentKey.current !== key || request.signal.aborted) return false;
      setState({ key, data, loading: false, error: "" }); return true;
    } catch (error) {
      if (sequence === generation.current && currentKey.current === key && !request.signal.aborted) setState({ key, loading: false, error: hrLoadErrorMessage(error, "读取失败，请重试。") });
      return false;
    }
  }, [enabled, key, loader]);
  useEffect(() => {
    void reload();
    return () => { generation.current++; controller.current?.abort(); };
  }, [reload]);
  return { ...(state.key === key ? state : { key, loading: enabled, error: "", data: undefined }), reload };
}

export function HrEmployeeRemindersClient(props: EntryProps) {
  const user = useAuthUser();
  const canRead = hasAnyPermission(user, [HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE]);
  const forbidden = <main className={`content ds-page ${workbench.page}`}><section className="ds-panel"><ForbiddenState message="当前账号没有员工重要日期提醒权限。" /></section></main>;
  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_EMPLOYEE_REMINDERS_PAGE} fallback={forbidden}>
    {canRead ? <ReminderBoard key={JSON.stringify(user)} {...props} /> : forbidden}
  </PermissionGuard>;
}

function ReminderBoard({ initialReminder = null, invalidEntry = false }: EntryProps) {
  const user = useAuthUser(), router = useRouter();
  const canRun = hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN);
  const canAck = hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_ACK);
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE);
  const [page, setPage] = useState(1), [kindFilter, setKindFilter] = useState<"" | HrEmployeeReminderKind>("");
  const [status, setStatus] = useState<"" | HrEmployeeReminderStatus>(""), [windowFilter, setWindowFilter] = useState("");
  const [windowDraft, setWindowDraft] = useState("");
  const validWindow = windowDraft === "" || (/^\d+$/.test(windowDraft) && Number(windowDraft) <= 365);
  const [kind, setKind] = useState<HrEmployeeReminderKind>("birthday"), [days, setDays] = useState("7");
  const [leap, setLeap] = useState<"" | HrEmployeeReminderLeapPolicy>("");
  const [recipients, setRecipients] = useState<HrEmployeeReminderRecipient[]>([]);
  const [previewRequest, setPreviewRequest] = useState<{ signature: string; body: HrEmployeeReminderGenerateInput; nonce: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(initialReminder);
  const [messagePage, setMessagePage] = useState(1), [readStatus, setReadStatus] = useState<"all" | "read" | "unread">("all");
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState(""), [writeError, setWriteError] = useState(""), [refreshWarning, setRefreshWarning] = useState("");
  const flight = useRef(false), mounted = useRef(true), keys = useRef(new Map<string, string>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setSelected(initialReminder); }, [initialReminder]);
  const draft = useMemo(() => reminderGenerationInput(kind, days, leap, recipients), [kind, days, leap, recipients]);
  const signature = JSON.stringify(draft);
  const listLoader = useCallback((signal: AbortSignal) => hrApi.employeeReminders(getAccessToken(), page, 20, { kind: kindFilter || undefined, status: status || undefined, window_days: windowFilter === "" ? undefined : Number(windowFilter) }, signal), [page, kindFilter, status, windowFilter]);
  const list = useReminderResource(JSON.stringify([page, kindFilter, status, windowFilter]), listLoader);
  const detailLoader = useCallback((signal: AbortSignal) => hrApi.employeeReminder(selected!, getAccessToken(), signal), [selected]);
  const detail = useReminderResource(selected ?? "none", detailLoader, Boolean(selected));
  const inboxLoader = useCallback((signal: AbortSignal) => hrApi.employeeReminderMessages(getAccessToken(), messagePage, 10, readStatus, signal), [messagePage, readStatus]);
  const inbox = useReminderResource(JSON.stringify([messagePage, readStatus]), inboxLoader);
  const previewLoader = useCallback((signal: AbortSignal) => hrApi.previewEmployeeReminders(previewRequest!.body, getAccessToken(), signal), [previewRequest]);
  const previewCurrent = Boolean(draft && previewRequest?.signature === signature);
  const preview = useReminderResource(`${signature}:${previewRequest?.nonce ?? 0}`, previewLoader, previewCurrent);
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  const messagePages = Math.max(1, Math.ceil((inbox.data?.total ?? 0) / 10));
  useEffect(() => { if (list.data && page > pages) setPage(pages); }, [list.data, page, pages]);
  useEffect(() => { if (inbox.data && messagePage > messagePages) setMessagePage(messagePages); }, [inbox.data, messagePage, messagePages]);

  const openDetail = (id: string) => {
    setSelected(id);
    router.replace(`/hr/employee-reminders?reminder=${encodeURIComponent(id)}`, { scroll: false });
  };
  const mutate = async (fingerprint: string, run: (key: string) => Promise<string>) => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setWriteError(""); setRefreshWarning(""); setReceipt("");
    const key = keys.current.get(fingerprint) ?? createIdempotencyKey("hr-employee-reminder");
    keys.current.set(fingerprint, key);
    try {
      const success = await run(key);
      keys.current.delete(fingerprint);
      if (!mounted.current) return;
      setReceipt(success);
      const refreshed = await Promise.all([list.reload(), inbox.reload(), detail.reload()]);
      if (mounted.current && refreshed.some(value => !value)) setRefreshWarning("操作已成功，部分数据刷新失败。请重试相应读取，无需重复提交。");
    } catch (error) {
      if (mounted.current) setWriteError(hrLoadErrorMessage(error, "提交未获成功确认。可重试原操作，系统会复用原请求避免重复。"));
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const act = (item: HrEmployeeReminder, action: HrEmployeeReminderAction) => mutate(`action:${item.id}:${action}`, async key => {
    await hrApi.actEmployeeReminder(item.id, action, getAccessToken(), key);
    return `${reminderActions[action]}已成功。`;
  });
  const actions = (item: HrEmployeeReminder) => <div className={styles.actions}>
    {canAck && item.status === "open" ? <button className="ds-button ds-button-secondary" disabled={busy} onClick={() => void act(item, "read")}>标记已读</button> : null}
    {canAck && ["open", "read"].includes(item.status) ? <button className="ds-button ds-button-secondary" disabled={busy} onClick={() => void act(item, "acknowledge")}>确认收到</button> : null}
    {canManage && item.status === "acknowledged" ? <button className="ds-button ds-button-secondary" disabled={busy} onClick={() => void act(item, "resolve")}>完成提醒</button> : null}
    {canManage && ["open", "read", "acknowledged"].includes(item.status) ? <button className="ds-button ds-button-secondary" disabled={busy} onClick={() => void act(item, "cancel")}>取消提醒</button> : null}
  </div>;
  const errorBox = (error: string, retry: () => Promise<boolean>) => error ? <div role="alert"><p>{error}</p><button className="ds-button ds-button-secondary" disabled={busy} onClick={() => void retry()}>重试读取</button></div> : null;
  const summary = (item: HrEmployeeReminder) => <><strong>{item.employeeName} · {item.employeeCode}</strong><div className={styles.meta}><span>{reminderKinds[item.kind]}</span><span>发生日期：{item.dueDate}</span><span>{reminderStates[item.status]}</span></div><p>提前 {item.windowDays} 天 · {reminderLeaps[item.leapDayPolicy]}</p></>;

  return <main className={`content ds-page ${workbench.page}`}>
    <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人员运营</span><h1>员工重要日期提醒</h1><p>根据正式员工资料，预览并手动生成生日、入职周年提醒。按上海日期计算，缺少日期时请维护员工资料。</p></div></section>
    {receipt ? <p role="status">{receipt}</p> : null}
    {refreshWarning ? <p role="alert">{refreshWarning}</p> : null}
    {writeError ? <p role="alert">{writeError}</p> : null}
    {invalidEntry ? <p role="alert">提醒链接无效，请从列表或本人的站内提醒重新打开。</p> : null}
    {canRun ? <section className="ds-panel" aria-labelledby="generate-heading"><h2 id="generate-heading">生成提醒</h2>
      <div className={styles.grid}>
        <label className="form-field"><span>生成类型</span><select disabled={busy} value={kind} onChange={event => setKind(event.target.value as HrEmployeeReminderKind)}>{Object.entries(reminderKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>提前天数</span><input type="number" min="0" max="365" step="1" required disabled={busy} value={days} onFocus={event => event.currentTarget.select()} onChange={event => setDays(event.target.value)} /></label>
        <label className="form-field"><span>2 月 29 日非闰年口径</span><select required disabled={busy} value={leap} onChange={event => setLeap(event.target.value as typeof leap)}><option value="">请选择处理口径</option>{Object.entries(reminderLeaps).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <fieldset className={styles.recipients} disabled={busy}><legend>收件范围（至少选择一项）</legend>{([["hr", "HR 管理人员"], ["manager", "直属负责人"], ["employee", "员工本人"]] as const).map(([value, label]) => <label key={value}><input type="checkbox" checked={recipients.includes(value)} onChange={event => setRecipients(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{label}</label>)}</fieldset>
      {!draft ? <p>请填写 0–365 的整数天数，选择闰日口径和收件范围后预览。</p> : null}
      <div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={busy || !draft || preview.loading} onClick={() => draft && setPreviewRequest({ signature, body: draft, nonce: Date.now() })}>预览提醒</button><button className="ds-button ds-button-primary" disabled={busy || !previewCurrent || !preview.data || preview.loading} onClick={() => {
        if (!draft || !preview.data) return;
        void mutate(`generate:${signature}`, async key => { const result = await hrApi.generateEmployeeReminders(draft, getAccessToken(), key); return `已生成 ${result.created} 条提醒；命中 ${result.matched} 人次，无有效收件人 ${result.skippedNoRecipient} 人次。`; });
      }}>生成并发送站内提醒</button></div>
      {previewCurrent && preview.loading ? <p role="status">正在预览…</p> : null}
      {previewCurrent ? errorBox(preview.error, preview.reload) : null}
      {previewCurrent && preview.data ? <p role="status">业务日 {preview.data.businessDate}：命中 {preview.data.matched} 人次；缺少日期 {preview.data.missingDate} 人；命中但无有效收件人 {preview.data.noRecipient} 人次。按所选口径和实际权限发送。</p> : null}
    </section> : null}

    <section className="ds-panel" aria-labelledby="inbox-heading"><div className={styles.heading}><h2 id="inbox-heading">我的站内提醒</h2><button className="ds-button ds-button-secondary" disabled={busy || inbox.loading} onClick={() => void inbox.reload()}>刷新站内提醒</button></div>
      <label className="form-field"><span>消息状态</span><select value={readStatus} disabled={busy} onChange={event => { setReadStatus(event.target.value as typeof readStatus); setMessagePage(1); }}><option value="all">全部消息</option><option value="unread">未读消息</option><option value="read">已读消息</option></select></label>
      {inbox.loading ? <p role="status">正在读取站内提醒…</p> : null}{errorBox(inbox.error, inbox.reload)}
      <div className="ds-scene-grid">{inbox.data?.items.map(message => {
        const id = reminderIdFromMessage(message.targetUrl);
        return <article className="ds-mobile-record" key={message.id}><strong>{message.title}</strong><p className={styles.text}>{message.content}</p><span>{message.readAt ? "已读消息" : "未读消息"}</span><div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={busy || !id} onClick={() => {
          if (!id) return;
          openDetail(id);
          if (!message.readAt) void mutate(`message:${message.id}`, async key => { await hrApi.readEmployeeReminderMessage(message.id, getAccessToken(), key); return "站内消息已标记为已读。"; });
        }}>打开提醒详情</button></div></article>;
      })}</div>
      {inbox.data && !inbox.data.items.length ? <p>暂无符合条件的本人站内提醒。</p> : null}
      <nav className={styles.pagination} aria-label="站内提醒分页"><button className="ds-button ds-button-secondary" disabled={busy || inbox.loading || messagePage <= 1} onClick={() => setMessagePage(value => value - 1)}>上一页消息</button><span>第 {messagePage} / {messagePages} 页，共 {inbox.data?.total ?? 0} 条消息</span><button className="ds-button ds-button-secondary" disabled={busy || inbox.loading || messagePage >= messagePages} onClick={() => setMessagePage(value => value + 1)}>下一页消息</button></nav>
    </section>

    <section className="ds-panel" aria-labelledby="list-heading"><div className={styles.heading}><h2 id="list-heading">提醒台账</h2><button className="ds-button ds-button-secondary" disabled={busy || list.loading} onClick={() => void list.reload()}>刷新台账</button></div>
      <div className={styles.grid}>
        <label className="form-field"><span>筛选类型</span><select value={kindFilter} disabled={busy} onChange={event => { setKindFilter(event.target.value as typeof kindFilter); setPage(1); }}><option value="">全部类型</option>{Object.entries(reminderKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>办理状态</span><select value={status} disabled={busy} onChange={event => { setStatus(event.target.value as typeof status); setPage(1); }}><option value="">全部状态</option>{Object.entries(reminderStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>生成时提前天数</span><input type="number" min="0" max="365" step="1" placeholder="留空查看全部窗口" value={windowDraft} disabled={busy} onFocus={event => event.currentTarget.select()} onChange={event => setWindowDraft(event.target.value)} /></label>
      </div>
      <div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={busy || !validWindow} onClick={() => { setWindowFilter(windowDraft); setPage(1); }}>应用提前天数</button></div>
      {list.loading ? <p role="status">正在读取提醒台账…</p> : null}{errorBox(list.error, list.reload)}
      <div className="ds-scene-grid">{list.data?.items.map(item => <article className="ds-mobile-record" key={item.id}>{summary(item)}<div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={busy} onClick={() => openDetail(item.id)}>查看办理详情</button></div></article>)}</div>
      {list.data && !list.data.items.length ? <p>当前筛选没有可见提醒。</p> : null}
      <nav className={styles.pagination} aria-label="员工重要日期提醒分页"><button className="ds-button ds-button-secondary" disabled={busy || list.loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {pages} 页，共 {list.data?.total ?? 0} 条</span><button className="ds-button ds-button-secondary" disabled={busy || list.loading || page >= pages} onClick={() => setPage(value => value + 1)}>下一页</button></nav>
    </section>

    {selected ? <section className={`ds-panel ${styles.detail}`} aria-labelledby="detail-heading"><h2 id="detail-heading">提醒详情与办理记录</h2>
      {detail.loading ? <p role="status">正在读取提醒详情…</p> : null}{errorBox(detail.error, detail.reload)}
      {detail.data ? <>{summary(detail.data)}{detail.data.cancelReason ? <p>取消原因：{detail.data.cancelReason === "SOURCE_OR_SCOPE_CHANGED" ? "员工日期、在职状态、收件关系或读取权限已变化。" : "管理人员取消。"}</p> : null}{actions(detail.data)}<h3>办理历史</h3>{detail.data.actions.length ? <ol className={styles.history}>{detail.data.actions.map(action => <li key={action.sequence}><strong>第 {action.sequence} 步 · {reminderActions[action.action]}</strong><p>{new Date(action.occurredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</p></li>)}</ol> : <p>暂无办理记录。</p>}</> : null}
    </section> : null}
  </main>;
}
