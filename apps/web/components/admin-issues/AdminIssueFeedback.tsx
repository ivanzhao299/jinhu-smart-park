"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getToken } from "../../lib/auth";
import { useAuthUser } from "../../lib/auth-context";
import { ADMIN_ISSUE_PAGE_SIZE, adminIssuePageCount, buildAdminIssueHistoryPath, type AdminIssueHistoryView } from "./admin-issue-feedback.logic";
import styles from "./admin-issue-feedback.module.css";
import triageStyles from "./admin-issue-triage.module.css";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
interface IssueSummary { issueNo: string; title: string; description?: string; severity?: Severity; status: string; runnerStatus: string; acceptanceCriteria?: string | null; resolutionSummary?: string | null; createTime: string; }
interface IssuePage { items: IssueSummary[]; total: number; page: number; page_size: number; }

const STATUS_LABELS: Record<string, string> = {
  OPEN: "已收到", TRIAGED: "已分类", APPROVED: "已批准修复", IN_PROGRESS: "Runner 修复中",
  VERIFIED: "修复待发布", RELEASED: "已发布", CLOSED: "已关闭", REJECTED: "不进入修复"
};

export function AdminIssueFeedback() {
  const actor = useAuthUser();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"create" | "mine" | "manage">("create");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: ADMIN_ISSUE_PAGE_SIZE });
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<Record<string, string>>({});
  const canManage = Boolean(actor?.is_super || actor?.permissions?.includes(SYSTEM_PERMISSIONS.ADMIN_ISSUE_MANAGE));
  const canSubmit = title.trim().length >= 2 && description.trim().length >= 5 && !submitting;
  const routeLabel = useMemo(() => pathname || "/", [pathname]);
  const pageCount = adminIssuePageCount(pagination.total, pagination.pageSize);

  useEffect(() => {
    if (!open || !["mine", "manage"].includes(view)) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setIssues([]);
    setPagination({ total: 0, page, pageSize: ADMIN_ISSUE_PAGE_SIZE });
    setLoadingIssues(true);
    apiRequest<IssuePage>(buildAdminIssueHistoryPath(view as AdminIssueHistoryView, page), { token })
      .then((response) => {
        if (cancelled) return;
        const availablePages = adminIssuePageCount(response.data.total, response.data.page_size);
        if (response.data.page > availablePages) {
          setPage(availablePages);
          return;
        }
        setIssues(response.data.items);
        setPagination({ total: response.data.total, page: response.data.page, pageSize: response.data.page_size });
      })
      .catch(() => { if (!cancelled) setMessage("暂时无法读取反馈记录，请稍后重试。"); })
      .finally(() => { if (!cancelled) setLoadingIssues(false); });
    return () => { cancelled = true; };
  }, [open, page, view]);

  const selectView = (nextView: typeof view) => {
    setView(nextView);
    setPage(1);
    setMessage("");
  };

  const triage = async (issue: IssueSummary, status: "TRIAGED" | "APPROVED" | "REJECTED") => {
    const token = getToken();
    if (!token || !canManage) return;
    setMessage("");
    try {
      const response = await apiRequest<IssueSummary>(`/admin-issues/${issue.issueNo}/triage`, {
        method: "PATCH", token,
        body: { status, acceptance_criteria: acceptanceCriteria[issue.issueNo]?.trim() || undefined }
      });
      setIssues((current) => current.map((item) => item.issueNo === issue.issueNo ? response.data : item));
      setMessage(status === "APPROVED" ? "已批准，Runner 可以领取该问题。" : "问题状态已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败。");
    }
  };

  const submit = async () => {
    const token = getToken();
    if (!token || !canSubmit) return;
    setSubmitting(true); setMessage("");
    try {
      const response = await apiRequest<IssueSummary>("/admin-issues", {
        method: "POST", token, idempotencyKey: createIdempotencyKey("admin-issue-create"),
        body: {
          title: title.trim(), description: description.trim(), severity, route: routeLabel,
          url: window.location.href,
          module_code: routeLabel.split("/").filter(Boolean)[0] || "dashboard",
          client_context: {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            language: navigator.language,
            user_agent: navigator.userAgent.slice(0, 500)
          }
        }
      });
      setMessage(`反馈已提交：${response.data.issueNo}`);
      setTitle(""); setDescription(""); setPage(1); setView("mine");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败，请稍后重试。");
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <button className={`${styles.trigger} ds-button ds-button-secondary`} type="button" onClick={() => setOpen(true)} aria-label="反馈问题">
        <span aria-hidden="true">!</span><strong>反馈问题</strong>
      </button>
      {open ? <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className={`${styles.dialog} ds-panel`} role="dialog" aria-modal="true" aria-labelledby="admin-issue-title">
          <header className={styles.header}>
            <div><small>问题修复中心</small><h2 id="admin-issue-title">让 Runner 看见真实问题</h2></div>
            <button className={`${styles.close} ds-button ds-button-secondary`} type="button" onClick={() => setOpen(false)} aria-label="关闭">×</button>
          </header>
          <nav className={styles.tabs} aria-label="问题反馈视图">
            <button className="ds-button ds-button-secondary" type="button" aria-current={view === "create" ? "page" : undefined} onClick={() => selectView("create")}>提交问题</button>
            <button className="ds-button ds-button-secondary" type="button" aria-current={view === "mine" ? "page" : undefined} onClick={() => selectView("mine")}>我的反馈</button>
            {canManage ? <button className="ds-button ds-button-secondary" type="button" aria-current={view === "manage" ? "page" : undefined} onClick={() => selectView("manage")}>审核与派发</button> : null}
          </nav>
          {view === "create" ? <div className={styles.form}>
            <p className={styles.route}>当前页面 <code>{routeLabel}</code>，系统会自动附带页面和设备上下文。</p>
            <label className="form-field">问题标题<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="例如：工单详情无法提交处理结果" /></label>
            <label className="form-field">问题描述<textarea value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} placeholder="说明操作步骤、预期结果和实际结果……" /></label>
            <label className="form-field">影响程度<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}><option value="LOW">轻微</option><option value="MEDIUM">一般</option><option value="HIGH">严重</option><option value="CRITICAL">阻断业务</option></select></label>
            <button className="ds-button ds-button-primary" type="button" disabled={!canSubmit} onClick={submit}>{submitting ? "正在提交…" : "提交给问题修复中心"}</button>
          </div> : <div className={styles.issueList}>
            {loadingIssues ? <p className={styles.empty}>正在读取反馈记录…</p> : issues.length ? issues.map((issue) => <article className="ds-mobile-record" key={issue.issueNo}>
              <div><strong>{issue.title}</strong><small>{issue.issueNo} · {new Date(issue.createTime).toLocaleString()}</small></div>
              <span data-status={issue.status}>{STATUS_LABELS[issue.status] || issue.status}</span>
              {view === "manage" ? <div className={triageStyles.triage}>
                <p>{issue.description}</p>
                <label className="form-field">Runner 验收标准<textarea value={acceptanceCriteria[issue.issueNo] ?? issue.acceptanceCriteria ?? ""} onChange={(event) => setAcceptanceCriteria((current) => ({ ...current, [issue.issueNo]: event.target.value }))} placeholder="明确可验证的完成条件；批准前必填" /></label>
                <div><button className="ds-button ds-button-secondary" type="button" onClick={() => triage(issue, "TRIAGED")}>标记已分类</button><button className="ds-button ds-button-secondary" type="button" onClick={() => triage(issue, "REJECTED")}>不进入修复</button><button className="ds-button ds-button-primary" type="button" disabled={issue.status === "RELEASED"} onClick={() => triage(issue, "APPROVED")}>批准 Runner 修复</button></div>
              </div> : null}
              {issue.resolutionSummary ? <p>{issue.resolutionSummary}</p> : null}
            </article>) : <p className={styles.empty}>还没有问题反馈记录。</p>}
            {!loadingIssues && pagination.total > 0 ? <footer className={styles.pagination}>
              <span>共 {pagination.total} 条 · 第 {pagination.page}/{pageCount} 页</span>
              <div>
                <button className="ds-button ds-button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
                <button className="ds-button ds-button-secondary" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页</button>
              </div>
            </footer> : null}
          </div>}
          {message ? <p className={styles.message} role="status">{message}</p> : null}
        </section>
      </div> : null}
    </>
  );
}
