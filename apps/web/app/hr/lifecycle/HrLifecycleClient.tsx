"use client";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  hrApi,
  type HrEmployee,
  type HrEmploymentEvent,
  type HrEmploymentEventStatistics,
  type HrLifecycleChecklist,
  type HrLifecycleChecklistDetail,
  type HrLifecycleTemplate,
} from "../../../lib/hr-api";
import { hasAnyPermission, hasPermission } from "../../../lib/permissions";
import {
  fetchReferenceFormOptions,
  type ReferenceUserOption,
} from "../../../lib/reference-data";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";
const typeLabel: Record<string, string> = {
    onboarding: "入职",
    offboarding: "离职",
  },
  eventTypeLabel: Record<string, string> = {
    created: "新建档案",
    start_probation: "入职试用",
    confirm_employment: "转正",
    transfer: "调动",
    suspend: "停职",
    resume: "复职",
    depart: "离职",
  },
  statusLabel: Record<string, string> = {
    open: "待开始",
    in_progress: "办理中",
    completed: "已完成",
    cancelled: "已取消",
    pending: "待办理",
    returned: "已退回",
    waived: "已豁免",
  };
const initialStatisticsTo=new Date().toISOString().slice(0,10),initialStatisticsFrom=`${initialStatisticsTo.slice(0,4)}-01-01`;
export function HrLifecycleClient() {
  const user = useAuthUser(),
    canRead = hasAnyPermission(user, [
      HR_PERMISSIONS.HR_LIFECYCLE_READ,
      HR_PERMISSIONS.HR_LIFECYCLE_TEAM_READ,
      HR_PERMISSIONS.HR_LIFECYCLE_SELF_READ,
    ]),
    canAct = hasPermission(user, HR_PERMISSIONS.HR_LIFECYCLE_SELF_ACTION),
    canReview = hasPermission(user, HR_PERMISSIONS.HR_LIFECYCLE_REVIEW),
    canAssign = hasPermission(user, HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN),
    canReadEmploymentEvents = hasPermission(user, HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ),
    canManageTemplates = hasPermission(
      user,
      HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE,
    );
  const [rows, setRows] = useState<HrLifecycleChecklist[]>([]),
    [detail, setDetail] = useState<HrLifecycleChecklistDetail | null>(null),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [templates, setTemplates] = useState<HrLifecycleTemplate[]>([]),
    [employees, setEmployees] = useState<HrEmployee[]>([]),
    [users, setUsers] = useState<ReferenceUserOption[]>([]),
    [events, setEvents] = useState<HrEmploymentEvent[]>([]),
    [statistics, setStatistics] = useState<HrEmploymentEventStatistics | null>(null),
    [statisticsFrom, setStatisticsFrom] = useState(initialStatisticsFrom),
    [statisticsTo, setStatisticsTo] = useState(initialStatisticsTo),
    [statisticsLoading, setStatisticsLoading] = useState(false),
    [statisticsError, setStatisticsError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    listAbort = useRef<AbortController | null>(null),
    detailAbort = useRef<AbortController | null>(null),
    eventAbort = useRef<AbortController | null>(null),
    statisticsAbort = useRef<AbortController | null>(null),
    pageSize = 20;
  const clearDetail = () => {
    detailAbort.current?.abort();
    detailAbort.current = null;
    setDetail(null);
  };
  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    const g = ++generation.current,
      c = new AbortController();
    listAbort.current?.abort();
    listAbort.current = c;
    setLoading(true);
    setError("");
    clearDetail();
    try {
      const token = getAccessToken();
      const [r, t, e, refs] = await Promise.all([
        hrApi.lifecycleChecklists(token, page, pageSize, c.signal),
        canAssign || canManageTemplates
          ? hrApi.lifecycleTemplates(token, c.signal)
          : Promise.resolve([]),
        canAssign
          ? hrApi.employees(token, 1, 100)
          : Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 }),
        canAssign
          ? fetchReferenceFormOptions()
          : Promise.resolve({ users: [], orgs: [] }),
      ]);
      if (g !== generation.current) return;
      setRows(r.items);
      setTotal(r.total);
      setTemplates(t);
      setEmployees(e.items);
      setUsers(refs.users);
    } catch (e) {
      if ((e as Error).name !== "AbortError" && g === generation.current) {
        setRows([]);
        setTotal(0);
        setError(hrLoadErrorMessage(e, "加载生命周期任务失败"));
      }
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [canAssign, canManageTemplates, canRead, page]);
  const loadStatistics = useCallback(async (from:string,to:string) => {
    if (!canReadEmploymentEvents) return;
    const controller=new AbortController();
    statisticsAbort.current?.abort();
    statisticsAbort.current=controller;
    setStatisticsLoading(true);
    setStatisticsError("");
    try {
      const result=await hrApi.employmentEventStatistics(getAccessToken(),{from,to},controller.signal);
      if(!controller.signal.aborted&&statisticsAbort.current===controller)setStatistics(result);
    } catch (e) {
      if((e as Error).name!=="AbortError"&&statisticsAbort.current===controller)setStatisticsError(hrLoadErrorMessage(e,"加载人事异动统计失败"));
    } finally {
      if(statisticsAbort.current===controller)setStatisticsLoading(false);
    }
  },[canReadEmploymentEvents]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      listAbort.current?.abort();
      detailAbort.current?.abort();
      eventAbort.current?.abort();
    };
  }, [load]);
  useEffect(()=>{
    void loadStatistics(initialStatisticsFrom,initialStatisticsTo);
    return()=>statisticsAbort.current?.abort();
  },[loadStatistics]);
  const open = async (row: HrLifecycleChecklist) => {
    clearDetail();
    const c = new AbortController();
    detailAbort.current = c;
    setDetailLoading(true);
    setError("");
    try {
      const r = await hrApi.lifecycleChecklist(
        row.id,
        getAccessToken(),
        c.signal,
      );
      if (!c.signal.aborted && detailAbort.current === c) setDetail(r);
    } catch (e) {
      if ((e as Error).name !== "AbortError" && detailAbort.current === c)
        setError(hrLoadErrorMessage(e, "加载任务详情失败"));
    } finally {
      if (detailAbort.current === c) setDetailLoading(false);
    }
  };
  const act = async (
    itemId: string,
    action: "complete" | "waive" | "return" | "reassign",
    assigneeUserId?: string,
  ) => {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      await hrApi.lifecycleItemAction(
        detail.id,
        itemId,
        {
          action,
          assigneeUserId,
          note:
            action === "complete"
              ? undefined
              : action === "waive"
                ? "经确认无需办理"
                : action === "return"
                  ? "退回补充材料"
                  : undefined,
        },
        getAccessToken(),
      );
      const refreshed = await hrApi.lifecycleChecklist(
        detail.id,
        getAccessToken(),
      );
      setDetail(refreshed);
      await load();
    } catch (e) {
      setError(hrLoadErrorMessage(e, "办理任务失败"));
    } finally {
      setBusy(false);
    }
  };
  const createTemplate = async (form: FormData) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await hrApi.createLifecycleTemplate(
        {
          code: String(form.get("code")),
          name: String(form.get("name")),
          type: String(form.get("type")),
          items: [
            {
              code: String(form.get("itemCode")),
              name: String(form.get("itemName")),
              category: String(form.get("category")),
              required: true,
            },
          ],
        },
        getAccessToken(),
      );
      await load();
    } catch (e) {
      setError(hrLoadErrorMessage(e, "发布模板失败"));
    } finally {
      setBusy(false);
    }
  };
  const selectEmployee = async (employeeId: string) => {
    eventAbort.current?.abort();
    setEvents([]);
    if (!employeeId) return;
    const c = new AbortController();
    eventAbort.current = c;
    try {
      const result = await hrApi.events(employeeId, getAccessToken(), c.signal);
      if (!c.signal.aborted && eventAbort.current === c) setEvents(result);
    } catch (e) {
      if ((e as Error).name !== "AbortError" && eventAbort.current === c)
        setError(hrLoadErrorMessage(e, "加载任职事件失败"));
    }
  };
  const createChecklist = async (form: FormData) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await hrApi.createLifecycleChecklist(
        {
          employeeId: String(form.get("employee")),
          templateVersionId: String(form.get("template")),
          employmentEventId: String(form.get("event")) || undefined,
          dueDate: String(form.get("dueDate")) || undefined,
        },
        getAccessToken(),
      );
      await load();
    } catch (e) {
      setError(hrLoadErrorMessage(e, "创建清单失败"));
    } finally {
      setBusy(false);
    }
  };
  const forbidden = (
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-panel">
        <ForbiddenState message="无权访问员工生命周期" />
      </section>
    </main>
  );
  return (
    <PermissionGuard
      module="hr"
      permission={HR_PERMISSIONS.HR_LIFECYCLE_PAGE}
      fallback={forbidden}
    >
      <main className={`content ds-page ${styles.page}`}>
        <section className={styles.workbenchHeader}>
          <div>
            <span className="ds-eyebrow">人事运营</span>
            <h1>员工生命周期</h1>
          </div>
          <button
            className="ds-button"
            disabled={loading}
            onClick={() => {void load();void loadStatistics(statisticsFrom,statisticsTo);}}
          >
            {loading ? "刷新中" : "刷新"}
          </button>
        </section>
        {error ? (
          <section className="ds-panel">
            <p className="form-error" role="alert">
              {error}
            </p>
            <button className="ds-button" onClick={() => void load()}>
              重试
            </button>
          </section>
        ) : null}
        {canReadEmploymentEvents ? (
          <section className="ds-panel">
            <div className={styles.sectionHeading}>
              <div>
                <span className="ds-eyebrow">玉舟兼容查询</span>
                <h2>人事异动统计</h2>
              </div>
              <span>{statistics?.from ?? statisticsFrom} 至 {statistics?.to ?? statisticsTo}</span>
            </div>
            <form className={styles.formGrid} onSubmit={(event)=>{event.preventDefault();void loadStatistics(statisticsFrom,statisticsTo);}}>
              <label className="form-field"><span>开始日期</span><input type="date" value={statisticsFrom} max={statisticsTo} onChange={(event)=>setStatisticsFrom(event.target.value)} required /></label>
              <label className="form-field"><span>结束日期</span><input type="date" value={statisticsTo} min={statisticsFrom} onChange={(event)=>setStatisticsTo(event.target.value)} required /></label>
              <button className="ds-button ds-button-primary" disabled={statisticsLoading}>{statisticsLoading?"统计中":"重新统计"}</button>
            </form>
            {statisticsError ? <p className="form-error" role="alert">{statisticsError}</p> : null}
            {statistics ? <>
              <div className={`ds-kpi-grid ${styles.statisticsKpis}`} aria-label="人事异动概览">
                <article className="ds-kpi-card"><span>异动事件</span><strong>{statistics.total}</strong><small>所选日期范围</small></article>
                <article className="ds-kpi-card"><span>涉及员工</span><strong>{statistics.employeeCount}</strong><small>按员工去重</small></article>
                <article className="ds-kpi-card"><span>旧系统历史</span><strong>{statistics.historicalCount}</strong><small>玉舟迁移记录</small></article>
                <article className="ds-kpi-card"><span>新系统办理</span><strong>{statistics.onlineCount}</strong><small>上线后在线记录</small></article>
              </div>
              <div className={`ds-mobile-record-list ${styles.statisticsRecords}`}>
                {statistics.byType.length?statistics.byType.map((item)=><article className="ds-mobile-record" key={item.eventType}><strong>{eventTypeLabel[item.eventType]??item.eventType}</strong><span>{item.count} 次</span></article>):<p>所选日期范围暂无异动记录。</p>}
              </div>
              {statistics.byMonth.length?<div className={`ds-mobile-record-list ${styles.statisticsRecords}`} aria-label="异动月份趋势">{statistics.byMonth.slice(-12).map((item)=><article className="ds-mobile-record" key={item.month}><strong>{item.month}</strong><span>{item.count} 次异动</span></article>)}</div>:null}
            </> : null}
          </section>
        ) : null}
        {canManageTemplates ? (
          <section className="ds-panel">
            <h2>发布清单模板</h2>
            <form className={styles.formGrid} action={createTemplate}>
              <label className="form-field">
                <span>模板编号</span>
                <input name="code" required maxLength={64} />
              </label>
              <label className="form-field">
                <span>模板名称</span>
                <input name="name" required maxLength={160} />
              </label>
              <label className="form-field">
                <span>适用环节</span>
                <select name="type">
                  <option value="onboarding">入职</option>
                  <option value="offboarding">离职</option>
                </select>
              </label>
              <label className="form-field">
                <span>首个任务编号</span>
                <input name="itemCode" required maxLength={64} />
              </label>
              <label className="form-field">
                <span>首个任务</span>
                <input name="itemName" required maxLength={160} />
              </label>
              <label className="form-field">
                <span>任务分类</span>
                <select name="category">
                  <option value="documents">资料</option>
                  <option value="contract">合同</option>
                  <option value="account">账号</option>
                  <option value="asset">资产</option>
                  <option value="training">培训</option>
                </select>
              </label>
              <button className="ds-button ds-button-primary" disabled={busy}>
                发布模板
              </button>
            </form>
          </section>
        ) : null}
        {canAssign ? (
          <section className="ds-panel">
            <h2>创建入离职清单</h2>
            <form className={styles.formGrid} action={createChecklist}>
              <label className="form-field">
                <span>员工</span>
                <select
                  name="employee"
                  required
                  onChange={(event) => void selectEmployee(event.target.value)}
                >
                  <option value="">请选择</option>
                  {employees.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.fullName} · {x.employeeCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>模板版本</span>
                <select name="template" required>
                  <option value="">请选择</option>
                  {templates.map((x) => (
                    <option key={x.versionId} value={x.versionId}>
                      {typeLabel[x.type]} · {x.name}（V{x.versionNo}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>离职任职事件</span>
                <select name="event">
                  <option value="">入职清单无需选择</option>
                  {events
                    .filter((x) => x.eventType === "depart")
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.effectiveDate} · {x.reason || "离职"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="form-field">
                <span>截止日期</span>
                <input name="dueDate" type="date" />
              </label>
              <button className="ds-button ds-button-primary" disabled={busy}>
                创建清单
              </button>
            </form>
          </section>
        ) : null}
        <section className="ds-panel">
          <h2>待办清单</h2>
          <div className="ds-mobile-record-list">
            {loading ? (
              <p>正在加载…</p>
            ) : rows.length ? (
              rows.map((x) => (
                <article className="ds-mobile-record" key={x.id}>
                  <strong>
                    {x.employeeName} · {typeLabel[x.type] ?? x.type}
                  </strong>
                  <span>
                    {statusLabel[x.status] ?? x.status} · 已办 {x.doneCount}/
                    {x.itemCount}
                  </span>
                  <span>
                    {x.overdueCount
                      ? `${x.overdueCount} 项逾期`
                      : x.dueDate
                        ? `截止 ${x.dueDate}`
                        : "未设截止日"}
                  </span>
                  <button className="ds-button" onClick={() => void open(x)}>
                    查看任务
                  </button>
                </article>
              ))
            ) : (
              <p>当前没有可见任务。</p>
            )}
          </div>
          {total > pageSize ? (
            <div className={styles.actionRow}>
              <button
                className="ds-button"
                disabled={page === 1 || loading}
                onClick={() => setPage((x) => Math.max(1, x - 1))}
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                className="ds-button"
                disabled={page * pageSize >= total || loading}
                onClick={() => setPage((x) => x + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </section>
        {detailLoading ? (
          <section className="ds-panel">正在加载任务详情…</section>
        ) : null}
        {detail ? (
          <section className="ds-panel">
            <div className={styles.sectionHeader}>
              <h2>
                {detail.employeeName} · {typeLabel[detail.type]}
              </h2>
              <button className="ds-button" onClick={clearDetail}>
                关闭
              </button>
            </div>
            <div className="ds-mobile-record-list">
              {detail.items.length ? (
                detail.items.map((i) => (
                  <article className="ds-mobile-record" key={i.id}>
                    <strong>{i.itemName}</strong>
                    <span>
                      {statusLabel[i.status] ?? i.status}
                      {i.overdue ? " · 已逾期" : ""}
                    </span>
                    <span>
                      {i.dueDate ? `截止 ${i.dueDate}` : "未设截止日"}
                    </span>
                    {canAssign ? (
                      <label className="form-field">
                        <span>任务负责人</span>
                        <select
                          value={i.responsibleUserId ?? ""}
                          disabled={busy}
                          onChange={(event) =>
                            event.target.value &&
                            void act(i.id, "reassign", event.target.value)
                          }
                        >
                          <option value="">待分配</option>
                          {users.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.realName || x.displayName || x.username}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {["pending", "returned"].includes(i.status) &&
                    canAct &&
                    i.responsibleUserId === user?.id ? (
                      <div className={styles.actionRow}>
                        <button
                          className="ds-button ds-button-primary"
                          disabled={busy}
                          onClick={() => void act(i.id, "complete")}
                        >
                          完成
                        </button>
                      </div>
                    ) : null}
                    {["pending", "returned"].includes(i.status) && canReview ? (
                      <button
                        className="ds-button"
                        disabled={busy}
                        onClick={() => void act(i.id, "waive")}
                      >
                        豁免
                      </button>
                    ) : null}
                    {["completed", "waived"].includes(i.status) && canReview ? (
                      <button
                        className="ds-button"
                        disabled={busy}
                        onClick={() => void act(i.id, "return")}
                      >
                        退回重办
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <p>此清单没有任务项。</p>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </PermissionGuard>
  );
}
