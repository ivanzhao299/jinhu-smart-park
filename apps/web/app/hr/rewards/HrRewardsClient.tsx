"use client";
import { HR_PERMISSIONS, SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ForbiddenState } from "../../../components/auth/ForbiddenState";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  hrApi,
  type HrEmployee,
  type HrRewardCase,
  type HrRewardCaseDetail,
  type HrRewardCategory,
} from "../../../lib/hr-api";
import { hasAnyPermission, hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";
const labels: Record<string, string> = {
  draft: "草稿",
  submitted: "待审核",
  approved: "已批准",
  returned: "已退回",
  withdrawn: "已撤回",
  reward: "奖励",
  discipline: "处分",
};
export function HrRewardsClient() {
  const user = useAuthUser(),
    canRead = hasAnyPermission(user, [
      HR_PERMISSIONS.HR_REWARD_READ,
      HR_PERMISSIONS.HR_REWARD_TEAM_READ,
      HR_PERMISSIONS.HR_REWARD_SELF_READ,
    ]),
    canManage = hasPermission(user, HR_PERMISSIONS.HR_REWARD_MANAGE),
    canReview = hasPermission(user, HR_PERMISSIONS.HR_REWARD_REVIEW),
    canAmount = hasPermission(user, HR_PERMISSIONS.HR_REWARD_AMOUNT_READ),
    canReason = hasPermission(user, HR_PERMISSIONS.HR_REWARD_REASON_READ),
    canDocumentRead =
      hasPermission(user, HR_PERMISSIONS.HR_REWARD_READ) &&
      hasPermission(user, HR_PERMISSIONS.HR_REWARD_DOCUMENT_READ) &&
      hasPermission(user, SYSTEM_PERMISSIONS.FILE_READ),
    canDocumentManage =
      canManage &&
      hasPermission(user, HR_PERMISSIONS.HR_REWARD_DOCUMENT_MANAGE) &&
      hasPermission(user, SYSTEM_PERMISSIONS.FILE_UPLOAD),
    canDocumentDelete =
      canDocumentManage && hasPermission(user, SYSTEM_PERMISSIONS.FILE_DELETE);
  const [cases, setCases] = useState<HrRewardCase[]>([]),
    [categories, setCategories] = useState<HrRewardCategory[]>([]),
    [employees, setEmployees] = useState<
      Array<Pick<HrEmployee, "id" | "employeeCode" | "fullName">>
    >([]),
    [detail, setDetail] = useState<HrRewardCaseDetail | null>(null),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [evidenceRefresh, setEvidenceRefresh] = useState(0),
    [error, setError] = useState("");
  const listAbort = useRef<AbortController | null>(null),
    detailAbort = useRef<AbortController | null>(null),
    generation = useRef(0),
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
    clearDetail();
    setLoading(true);
    setError("");
    try {
      const token = getAccessToken(),
        [rows, options] = await Promise.all([
          hrApi.rewardCases(token, page, pageSize, undefined, c.signal),
          canManage
            ? hrApi.rewardOptions(token, c.signal)
            : hrApi
                .rewardCategories(token, c.signal)
                .then((categories) => ({ categories, employees: [] })),
        ]);
      if (g !== generation.current) return;
      setCases(rows.items);
      setTotal(rows.total);
      setCategories(options.categories);
      setEmployees(options.employees);
    } catch (e) {
      if ((e as Error).name !== "AbortError" && g === generation.current) {
        setCases([]);
        setCategories([]);
        setEmployees([]);
        setTotal(0);
        setError(hrLoadErrorMessage(e, "加载奖惩事项失败"));
      }
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [canManage, canRead, page]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      listAbort.current?.abort();
      detailAbort.current?.abort();
    };
  }, [load]);
  const open = async (id: string) => {
    clearDetail();
    const c = new AbortController();
    detailAbort.current = c;
    setError("");
    try {
      const row = await hrApi.rewardCase(id, getAccessToken(), c.signal);
      if (!c.signal.aborted && detailAbort.current === c) setDetail(row);
    } catch (e) {
      if ((e as Error).name !== "AbortError" && detailAbort.current === c)
        setError(hrLoadErrorMessage(e, "加载奖惩详情失败"));
    }
  };
  const mutate = async (job: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await job();
      await load();
    } catch (e) {
      setError(hrLoadErrorMessage(e, message));
    } finally {
      setBusy(false);
    }
  };
  const create = async (form: FormData) => {
    const reason = form.get("reason"),
      amount = form.get("amount");
    return mutate(
      () =>
        hrApi.createRewardCase(
          {
            code: String(form.get("code")),
            employeeId: String(form.get("employee")),
            categoryId: String(form.get("category")),
            occurredOn: String(form.get("occurredOn")),
            factSummary: String(form.get("summary")),
            ...(typeof reason === "string" && reason
              ? { detailedReason: reason }
              : {}),
            impactLevel: String(form.get("impactLevel")),
            ...(typeof amount === "string" && amount
              ? {
                  amountSuggestion: amount,
                  currency: "CNY",
                }
              : {}),
            evidenceFileIds: [],
          },
          getAccessToken(),
      ),
      "创建奖惩事项失败",
    );
  };
  const update = async (form: FormData) => {
    if (!detail) return;
    const reason = form.get("reason"),
      amount = form.get("amount");
    return mutate(
      () =>
        hrApi.updateRewardCase(
          detail.id,
          {
            occurredOn: String(form.get("occurredOn")),
            factSummary: String(form.get("summary")),
            impactLevel: String(form.get("impactLevel")),
            ...(canReason && typeof reason === "string"
              ? { detailedReason: reason }
              : {}),
            ...(canAmount && typeof amount === "string"
              ? {
                  amountSuggestion: amount || null,
                  currency: amount ? "CNY" : null,
                }
              : {}),
          },
          getAccessToken(),
        ),
      "更新奖惩事项失败",
    );
  };
  const createCategory = async (form: FormData) =>
    mutate(
      () =>
        hrApi.createRewardCategory(
          {
            code: String(form.get("categoryCode")),
            kind: String(form.get("categoryKind")),
            name: String(form.get("categoryName")),
            impactLevel: String(form.get("categoryImpactLevel")),
          },
          getAccessToken(),
        ),
      "创建奖惩类别失败",
    );
  const forbidden = (
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-panel">
        <ForbiddenState message="无权访问奖惩管理" />
      </section>
    </main>
  );
  return (
    <PermissionGuard
      module="hr"
      permission={HR_PERMISSIONS.HR_REWARDS_PAGE}
      fallback={forbidden}
    >
      <main className={`content ds-page ${styles.page}`}>
        <section className={styles.workbenchHeader}>
          <div>
            <span className="ds-eyebrow">人事运营</span>
            <h1>奖惩管理</h1>
          </div>
          <button
            className="ds-button"
            disabled={loading}
            onClick={() => void load()}
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
        {canManage ? (
          <>
            <section className="ds-panel">
              <h2>奖惩类别</h2>
              <form className={styles.formGrid} action={createCategory}>
                <label className="form-field">
                  <span>类别编号</span>
                  <input name="categoryCode" required maxLength={64} />
                </label>
                <label className="form-field">
                  <span>类型</span>
                  <select name="categoryKind" required>
                    <option value="reward">奖励</option>
                    <option value="discipline">处分</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>类别名称</span>
                  <input name="categoryName" required maxLength={120} />
                </label>
                <label className="form-field">
                  <span>默认影响级别</span>
                  <select name="categoryImpactLevel" required>
                    <option value="minor">轻微</option>
                    <option value="normal">一般</option>
                    <option value="major">重大</option>
                    <option value="critical">严重</option>
                  </select>
                </label>
                <button className="ds-button" disabled={busy}>
                  新增类别
                </button>
              </form>
            </section>
            <section className="ds-panel">
              <h2>新增奖惩事项</h2>
            <form className={styles.formGrid} action={create}>
              <label className="form-field">
                <span>事项编号</span>
                <input name="code" required maxLength={64} />
              </label>
              <label className="form-field">
                <span>员工</span>
                <select name="employee" required>
                  <option value="">请选择</option>
                  {employees.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.fullName} · {x.employeeCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>类别</span>
                <select name="category" required>
                  <option value="">请选择</option>
                  {categories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {labels[x.kind]} · {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>发生日期</span>
                <input name="occurredOn" type="date" required />
              </label>
              <label className="form-field">
                <span>影响级别</span>
                <select name="impactLevel" required>
                  <option value="minor">轻微</option>
                  <option value="normal">一般</option>
                  <option value="major">重大</option>
                  <option value="critical">严重</option>
                </select>
              </label>
              <label className="form-field">
                <span>事实摘要</span>
                <input name="summary" required maxLength={300} />
              </label>
              {canReason ? (
                <label className={`form-field ${styles.desktopSensitive}`}>
                  <span>详细原因</span>
                  <textarea name="reason" maxLength={3000} />
                </label>
              ) : null}
              {canAmount ? (
                <label className={`form-field ${styles.desktopSensitive}`}>
                  <span>金额建议</span>
                  <input name="amount" type="number" min="0" step="0.0001" />
                </label>
              ) : null}
              <button className="ds-button ds-button-primary" disabled={busy}>
                保存草稿
              </button>
            </form>
            </section>
          </>
        ) : null}
        <section className="ds-panel">
          <h2>奖惩事项</h2>
          <div className="ds-mobile-record-list">
            {loading ? (
              <p>正在加载…</p>
            ) : cases.length ? (
              cases.map((x) => (
                <article className="ds-mobile-record" key={x.id}>
                  <strong>
                    {x.employeeName} · {x.categoryName ?? labels[x.kind]}
                  </strong>
                  <span>
                    {labels[x.status] ?? x.status} · {x.occurredOn} ·{" "}
                    {x.impactLevel}
                  </span>
                  <span>{x.summary}</span>
                  {canAmount && x.amountSuggestion ? (
                    <span className={styles.desktopSensitive}>
                      建议金额 {x.amountSuggestion} {x.currency}
                    </span>
                  ) : null}
                  <div className={styles.recordActions}>
                    <button
                      className="ds-button"
                      onClick={() => void open(x.id)}
                    >
                      查看
                    </button>
                    {canManage && x.status === "draft" ? (
                      <button
                        className="ds-button ds-button-primary"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            () =>
                              hrApi.rewardCaseAction(
                                x.id,
                                "submit",
                                {},
                                getAccessToken(),
                              ),
                            "提交失败",
                          )
                        }
                      >
                        提交
                      </button>
                    ) : null}
                    {canManage && x.status === "returned" ? (
                      <button
                        className="ds-button ds-button-primary"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            () =>
                              hrApi.rewardCaseAction(
                                x.id,
                                "resubmit",
                                {},
                                getAccessToken(),
                              ),
                            "重提失败",
                          )
                        }
                      >
                        重新提交
                      </button>
                    ) : null}
                    {canManage && x.status === "submitted" ? (
                      <button
                        className="ds-button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            () =>
                              hrApi.rewardCaseAction(
                                x.id,
                                "withdraw",
                                {},
                                getAccessToken(),
                              ),
                            "撤回失败",
                          )
                        }
                      >
                        撤回
                      </button>
                    ) : null}
                    {canReview && x.status === "submitted" ? (
                      <>
                        <button
                          className="ds-button ds-button-primary"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () =>
                                hrApi.rewardCaseAction(
                                  x.id,
                                  "approve",
                                  {},
                                  getAccessToken(),
                                ),
                              "批准失败",
                            )
                          }
                        >
                          批准
                        </button>
                        <button
                          className="ds-button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () =>
                                hrApi.rewardCaseAction(
                                  x.id,
                                  "return",
                                  {},
                                  getAccessToken(),
                                ),
                              "退回失败",
                            )
                          }
                        >
                          退回
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p>当前没有可见奖惩事项。</p>
            )}
          </div>
          {total > pageSize ? (
            <div className={styles.recordActions}>
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
        {detail ? (
          <section className="ds-panel">
            <div className={styles.sectionHeading}>
              <h2>
                {detail.employeeName} · {detail.categoryName}
              </h2>
              <button className="ds-button" onClick={clearDetail}>
                关闭
              </button>
            </div>
            <p>{detail.summary}</p>
            {detail.detailedReason ? (
              <p className={styles.desktopSensitive}>{detail.detailedReason}</p>
            ) : null}
            {canManage && ["draft", "returned"].includes(detail.status) ? (
              <form key={detail.id} className={styles.formGrid} action={update}>
                <label className="form-field">
                  <span>发生日期</span>
                  <input name="occurredOn" type="date" required defaultValue={detail.occurredOn} />
                </label>
                <label className="form-field">
                  <span>影响级别</span>
                  <select name="impactLevel" required defaultValue={detail.impactLevel}>
                    <option value="minor">轻微</option><option value="normal">一般</option><option value="major">重大</option><option value="critical">严重</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>事实摘要</span>
                  <input name="summary" required maxLength={300} defaultValue={detail.summary} />
                </label>
                {canReason ? <label className={`form-field ${styles.desktopSensitive}`}><span>详细原因</span><textarea name="reason" maxLength={3000} defaultValue={detail.detailedReason ?? ""} /></label> : null}
                {canAmount ? <label className={`form-field ${styles.desktopSensitive}`}><span>金额建议</span><input name="amount" type="number" min="0" step="0.0001" defaultValue={detail.amountSuggestion ?? ""} /></label> : null}
                <button className="ds-button ds-button-primary" disabled={busy}>保存修改</button>
              </form>
            ) : null}
            {canDocumentRead ? (
              <div className={styles.formGrid}>
                {canDocumentManage &&
                ["draft", "returned"].includes(detail.status) ? (
                  <FileUploader
                    bizType="hr_reward_evidence"
                    bizId={detail.id}
                    policyKey="receipt"
                    label="上传奖惩证据"
                    helperText="支持 JPG、PNG、WebP 或 PDF，单个文件不超过 20 MB；提交时自动冻结证据清单。"
                    onUploaded={() => setEvidenceRefresh((value) => value + 1)}
                  />
                ) : null}
                <AttachmentList
                  bizType="hr_reward_evidence"
                  bizId={detail.id}
                  refreshKey={evidenceRefresh}
                  mutationDisabled={
                    !canDocumentDelete ||
                    !["draft", "returned"].includes(detail.status)
                  }
                  mutationPermission={HR_PERMISSIONS.HR_REWARD_DOCUMENT_MANAGE}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </PermissionGuard>
  );
}
