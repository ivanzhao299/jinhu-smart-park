"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getToken } from "../../lib/auth";
import { useAuthUser } from "../../lib/auth-context";
import styles from "./admin-issue-feedback.module.css";
import triageStyles from "./admin-issue-triage.module.css";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
interface IssueSummary { issueNo: string; title: string; description?: string; severity?: Severity; status: string; runnerStatus: string; acceptanceCriteria?: string | null; resolutionSummary?: string | null; createTime: string; }

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
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<Record<string, string>>({});
  const canManage = Boolean(actor?.is_super || actor?.permissions?.includes("admin_issue:manage"));
  const canSubmit = title.trim().length >= 2 && description.trim().length >= 5 && !submitting;
  const routeLabel = useMemo(() => pathname || "/", [pathname]);

  useEffect(() => {
    if (!open || !["mine", "manage"].includes(view)) return;
    const token = getToken();
    if (!token) return;
    apiRequest<{ items: IssueSummary[] }>(`${view === "manage" ? "/admin-issues" : "/admin-issues/mine"}?page=1&page_size=50`, { token })
      .then((response) => setIssues(response.data.items))
      .catch(() => setMessage("暂时无法读取反馈记录，请稍后重试。"));
  }, [open, view]);

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
      setTitle(""); setDescription(""); setView("mine");
      setIssues((current) => [response.data, ...current]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败，请稍后重试。");
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <button className={styles.trigger} type="button" onClick={() => setOpen(true)} aria-label="反馈问题">
        <span aria-hidden="true">!</span><strong>反馈问题</strong>
      </button>
      {open ? <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="admin-issue-title">
          <header className={styles.header}>
            <div><small>问题修复中心</small><h2 id="admin-issue-title">让 Runner 看见真实问题</h2></div>
            <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="关闭">×</button>
          </header>
          <nav className={styles.tabs} aria-label="问题反馈视图">
            <button type="button" aria-current={view === "create" ? "page" : undefined} onClick={() => setView("create")}>提交问题</button>
            <button type="button" aria-current={view === "mine" ? "page" : undefined} onClick={() => setView("mine")}>我的反馈</button>
            {canManage ? <button type="button" aria-current={view === "manage" ? "page" : undefined} onClick={() => setView("manage")}>审核与派发</button> : null}
          </nav>
          {view === "create" ? <div className={styles.form}>
            <p className={styles.route}>当前页面 <code>{routeLabel}</code>，系统会自动附带页面和设备上下文。</p>
            <label>问题标题<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="例如：工单详情无法提交处理结果" /></label>
            <label>问题描述<textarea value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} placeholder="说明操作步骤、预期结果和实际结果……" /></label>
            <label>影响程度<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}><option value="LOW">轻微</option><option value="MEDIUM">一般</option><option value="HIGH">严重</option><option value="CRITICAL">阻断业务</option></select></label>
            <button className={styles.submit} type="button" disabled={!canSubmit} onClick={submit}>{submitting ? "正在提交…" : "提交给问题修复中心"}</button>
          </div> : <div className={styles.issueList}>
            {issues.length ? issues.map((issue) => <article key={issue.issueNo}>
              <div><strong>{issue.title}</strong><small>{issue.issueNo} · {new Date(issue.createTime).toLocaleString()}</small></div>
              <span data-status={issue.status}>{STATUS_LABELS[issue.status] || issue.status}</span>
              {view === "manage" ? <div className={triageStyles.triage}>
                <p>{issue.description}</p>
                <label>Runner 验收标准<textarea value={acceptanceCriteria[issue.issueNo] ?? issue.acceptanceCriteria ?? ""} onChange={(event) => setAcceptanceCriteria((current) => ({ ...current, [issue.issueNo]: event.target.value }))} placeholder="明确可验证的完成条件；批准前必填" /></label>
                <div><button type="button" onClick={() => triage(issue, "TRIAGED")}>标记已分类</button><button type="button" onClick={() => triage(issue, "REJECTED")}>不进入修复</button><button type="button" disabled={issue.status === "RELEASED"} onClick={() => triage(issue, "APPROVED")}>批准 Runner 修复</button></div>
              </div> : null}
              {issue.resolutionSummary ? <p>{issue.resolutionSummary}</p> : null}
            </article>) : <p className={styles.empty}>还没有问题反馈记录。</p>}
          </div>}
          {message ? <p className={styles.message} role="status">{message}</p> : null}
        </section>
      </div> : null}
    </>
  );
}
