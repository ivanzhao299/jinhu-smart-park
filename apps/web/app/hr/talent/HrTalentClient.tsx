"use client";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { ApiError } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  hrApi,
  type HrDevelopmentPlan,
  type HrSuccessionRow,
  type HrTalentOptions,
  type HrTalentProfile,
  type HrTalentSession,
  type HrTalentSubject,
} from "../../../lib/hr-api";
import { hasAnyPermission, hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";

const EMPTY_OPTIONS: HrTalentOptions = { employees: [], positions: [] };
const statusLabel: Record<string, string> = {
  draft: "草稿",
  active: "进行中",
  closed: "已结束",
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
  ready_now: "可立即继任",
  ready_1_2_years: "1–2年可继任",
  ready_3_plus_years: "3年以上",
};
type Panel = "profile" | "session" | "position" | "successor" | "plan" | null;
export function HrTalentClient() {
  const user = useAuthUser(),
    canProfile = hasPermission(user, HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE),
    canReview = hasPermission(user, HR_PERMISSIONS.HR_TALENT_REVIEW),
    canSuccessionRead = hasAnyPermission(user, [
      HR_PERMISSIONS.HR_SUCCESSION_READ,
      HR_PERMISSIONS.HR_SUCCESSION_MANAGE,
    ]),
    canSuccessionManage = hasPermission(
      user,
      HR_PERMISSIONS.HR_SUCCESSION_MANAGE,
    ),
    canDevelopmentManage = hasPermission(
      user,
      HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE,
    ),
    canSelfAction = hasPermission(
      user,
      HR_PERMISSIONS.HR_DEVELOPMENT_SELF_ACTION,
    ),
    canRead = hasAnyPermission(user, [
      HR_PERMISSIONS.HR_TALENT_READ,
      HR_PERMISSIONS.HR_TALENT_TEAM_READ,
      HR_PERMISSIONS.HR_TALENT_SELF_READ,
    ]);
  const [options, setOptions] = useState(EMPTY_OPTIONS),
    [profiles, setProfiles] = useState<HrTalentProfile[]>([]),
    [sessions, setSessions] = useState<HrTalentSession[]>([]),
    [subjects, setSubjects] = useState<HrTalentSubject[]>([]),
    [succession, setSuccession] = useState<HrSuccessionRow[]>([]),
    [plans, setPlans] = useState<HrDevelopmentPlan[]>([]),
    [selectedSession, setSelectedSession] = useState("");
  const [loading, setLoading] = useState(true),
    [forbidden, setForbidden] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [panel, setPanel] = useState<Panel>(null);
  const generation = useRef(0),
    controllerRef = useRef<AbortController | null>(null),
    inFlight = useRef(false);
  const load = useCallback(async () => {
    const g = ++generation.current;
    controllerRef.current?.abort();
    const c = new AbortController();
    controllerRef.current = c;
    setLoading(true);
    setForbidden(false);
    setError("");
    try {
      const token = getAccessToken();
      const [o, p, s, sc, d] = await Promise.all([
        canRead ||
        canProfile ||
        canReview ||
        canSuccessionManage ||
        canDevelopmentManage
          ? hrApi.talentOptions(token, c.signal)
          : Promise.resolve(EMPTY_OPTIONS),
        canRead ? hrApi.talentProfiles(token, c.signal) : Promise.resolve([]),
        canReview ||
        hasPermission(user, HR_PERMISSIONS.HR_TALENT_TEAM_READ) ||
        hasPermission(user, HR_PERMISSIONS.HR_TALENT_READ)
          ? hrApi.talentSessions(token, c.signal)
          : Promise.resolve([]),
        canSuccessionRead
          ? hrApi.talentSuccession(token, c.signal)
          : Promise.resolve([]),
        canRead || canDevelopmentManage || canSelfAction
          ? hrApi.developmentPlans(token, c.signal)
          : Promise.resolve([]),
      ]);
      if (g !== generation.current) return;
      setOptions(o);
      setProfiles(p);
      setSessions(s);
      setSuccession(sc);
      setPlans(d);
    } catch (e) {
      if (
        g !== generation.current ||
        (e instanceof DOMException && e.name === "AbortError")
      )
        return;
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else setError(hrLoadErrorMessage(e, "加载人才发展工作台失败"));
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [
    canDevelopmentManage,
    canProfile,
    canRead,
    canReview,
    canSelfAction,
    canSuccessionManage,
    canSuccessionRead,
    user,
  ]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      controllerRef.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!selectedSession) {
      setSubjects([]);
      return;
    }
    const c = new AbortController();
    void hrApi
      .talentSubjects(selectedSession, getAccessToken(), c.signal)
      .then(setSubjects)
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError(hrLoadErrorMessage(e, "加载盘点对象失败"));
      });
    return () => c.abort();
  }, [selectedSession]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      setMessage(ok);
      setPanel(null);
      await load();
      if (selectedSession)
        setSubjects(
          await hrApi.talentSubjects(selectedSession, getAccessToken()),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const latestProfiles = useMemo(
    () => new Set(profiles.map((x) => x.employeeCode)).size,
    [profiles],
  );
  const freezeProfile = (f: FormData) =>
    act(
      () =>
        hrApi.createTalentProfile(
          {
            employeeId: String(f.get("employeeId")),
            asOfDate: String(f.get("asOfDate")),
          },
          getAccessToken(),
        ),
      "人才画像已按已确认来源冻结",
    );
  const createSession = (f: FormData) =>
    act(
      () =>
        hrApi.createTalentSession(
          {
            sessionCode: String(f.get("sessionCode")),
            sessionName: String(f.get("sessionName")),
            reviewDate: String(f.get("reviewDate")),
            performanceDefinition: String(f.get("performanceDefinition")),
            potentialDefinition: String(f.get("potentialDefinition")),
            employeeIds: f.getAll("employeeIds").map(String),
          },
          getAccessToken(),
        ),
      "人才盘点会已创建",
    );
  const createPosition = (f: FormData) => {
    const note = String(f.get("riskReason"));
    return act(
      () =>
        hrApi.createCriticalPosition(
          {
            positionId: String(f.get("positionId")),
            criticality: String(f.get("criticality")),
            riskLevel: String(f.get("riskLevel")),
            riskReason: note,
            evidence: [{ type: "risk_assessment", note }],
          },
          getAccessToken(),
        ),
      "关键岗位已登记",
    );
  };
  const createSuccessor = (f: FormData) => {
    const note = String(f.get("riskReason"));
    return act(
      () =>
        hrApi.createSuccessor(
          {
            criticalPositionId: String(f.get("criticalPositionId")),
            employeeId: String(f.get("employeeId")),
            readiness: String(f.get("readiness")),
            riskLevel: String(f.get("riskLevel")),
            riskReason: note,
            evidence: [{ type: "assessment_record", note }],
          },
          getAccessToken(),
        ),
      "继任候选版本已记录",
    );
  };
  const createPlan = (f: FormData) =>
    act(
      () =>
        hrApi.createDevelopmentPlan(
          {
            employeeId: String(f.get("employeeId")),
            planCode: String(f.get("planCode")),
            planName: String(f.get("planName")),
            developmentGoal: String(f.get("developmentGoal")),
            startDate: String(f.get("startDate")),
            endDate: String(f.get("endDate")),
          },
          getAccessToken(),
        ),
      "个人发展计划已创建",
    );
  return (
    <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_TALENT_PAGE}>
      <main className={`content ds-page ${styles.page}`}>
        <section className="ds-hero">
          <div className="ds-hero-copy">
            <span className="ds-eyebrow">人才与发展</span>
            <h1>人才发展</h1>
            <p>盘点人才、安排继任，并推动个人发展行动。</p>
          </div>
          <div className={`${styles.heroActions} ${styles.desktopSensitive}`}>
            {canProfile ? (
              <button
                className="ds-button"
                onClick={() => setPanel(panel === "profile" ? null : "profile")}
              >
                冻结画像
              </button>
            ) : null}
            {canReview ? (
              <button
                className="ds-button"
                onClick={() => setPanel(panel === "session" ? null : "session")}
              >
                新建盘点
              </button>
            ) : null}
            {canDevelopmentManage ? (
              <button
                className="ds-button ds-button-primary"
                onClick={() => setPanel(panel === "plan" ? null : "plan")}
              >
                新建发展计划
              </button>
            ) : null}
          </div>
        </section>
        <section className={`ds-kpi-grid ${styles.compactKpiGrid}`}>
          <article className="ds-kpi-card">
            <span>人才画像</span>
            <strong>{latestProfiles}</strong>
            <small>冻结来源版本</small>
          </article>
          <article className="ds-kpi-card">
            <span>盘点会议</span>
            <strong>
              {sessions.filter((x) => x.status !== "closed").length}
            </strong>
            <small>进行中</small>
          </article>
          <article className="ds-kpi-card">
            <span>发展行动</span>
            <strong>
              {
                plans
                  .flatMap((x) => x.actions)
                  .filter((x) => !["completed", "cancelled"].includes(x.status))
                  .length
              }
            </strong>
            <small>待推进</small>
          </article>
        </section>
        {panel === "profile" ? (
          <form
            className={`ds-panel ${styles.formGrid} ${styles.desktopSensitive}`}
            action={freezeProfile}
          >
            <h2>冻结人才画像</h2>
            <label className="form-field">
              <span>员工</span>
              <select name="employeeId" required>
                <option value="">请选择</option>
                {options.employees.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.fullName} · {x.employeeCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>数据时点</span>
              <input name="asOfDate" type="date" required />
            </label>
            <button disabled={busy} className="ds-button ds-button-primary">
              确认冻结
            </button>
          </form>
        ) : null}
        {panel === "session" ? (
          <form
            className={`ds-panel ${styles.formGrid} ${styles.desktopSensitive}`}
            action={createSession}
          >
            <h2>创建人才盘点会</h2>
            <label className="form-field">
              <span>会议编码</span>
              <input
                name="sessionCode"
                pattern="[A-Z][A-Z0-9_-]{1,63}"
                required
              />
            </label>
            <label className="form-field">
              <span>会议名称</span>
              <input name="sessionName" maxLength={160} required />
            </label>
            <label className="form-field">
              <span>盘点日期</span>
              <input name="reviewDate" type="date" required />
            </label>
            <label className="form-field">
              <span>绩效口径</span>
              <textarea
                name="performanceDefinition"
                required
                maxLength={1000}
              />
            </label>
            <label className="form-field">
              <span>潜力口径</span>
              <textarea name="potentialDefinition" required maxLength={1000} />
            </label>
            <label className="form-field">
              <span>盘点员工</span>
              <select name="employeeIds" multiple size={6} required>
                {options.employees.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.fullName} · {x.employeeCode}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy} className="ds-button ds-button-primary">
              创建会议
            </button>
          </form>
        ) : null}
        {panel === "position" ? (
          <form
            className={`ds-panel ${styles.formGrid} ${styles.desktopSensitive}`}
            action={createPosition}
          >
            <h2>登记关键岗位</h2>
            <label className="form-field">
              <span>岗位</span>
              <select name="positionId" required>
                <option value="">请选择</option>
                {options.positions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.positionName} · {x.positionCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>关键程度</span>
              <select name="criticality">
                <option value="critical">关键</option>
                <option value="important">重要</option>
              </select>
            </label>
            <label className="form-field">
              <span>空缺风险</span>
              <select name="riskLevel">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
            <label className="form-field">
              <span>风险依据</span>
              <textarea name="riskReason" required minLength={4} />
            </label>
            <button disabled={busy} className="ds-button ds-button-primary">
              登记岗位
            </button>
          </form>
        ) : null}
        {panel === "successor" ? (
          <form
            className={`ds-panel ${styles.formGrid} ${styles.desktopSensitive}`}
            action={createSuccessor}
          >
            <h2>评估继任候选</h2>
            <label className="form-field">
              <span>关键岗位</span>
              <select name="criticalPositionId" required>
                <option value="">请选择</option>
                {Array.from(
                  new Map(
                    succession.map((x) => [x.criticalPositionId, x]),
                  ).values(),
                ).map((x) => (
                  <option
                    key={x.criticalPositionId}
                    value={x.criticalPositionId}
                  >
                    {x.positionName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>候选员工</span>
              <select name="employeeId" required>
                <option value="">请选择</option>
                {options.employees.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.fullName} · {x.employeeCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>准备度</span>
              <select name="readiness">
                <option value="ready_now">可立即继任</option>
                <option value="ready_1_2_years">1–2年</option>
                <option value="ready_3_plus_years">3年以上</option>
              </select>
            </label>
            <label className="form-field">
              <span>候选风险</span>
              <select name="riskLevel">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
            <label className="form-field">
              <span>风险与证据说明</span>
              <textarea name="riskReason" required minLength={4} />
            </label>
            <button disabled={busy} className="ds-button ds-button-primary">
              保存候选版本
            </button>
          </form>
        ) : null}
        {panel === "plan" ? (
          <form className={`ds-panel ${styles.formGrid}`} action={createPlan}>
            <h2>创建个人发展计划</h2>
            <label className="form-field">
              <span>员工</span>
              <select name="employeeId" required>
                <option value="">请选择</option>
                {options.employees.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.fullName} · {x.employeeCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>计划编码</span>
              <input name="planCode" required />
            </label>
            <label className="form-field">
              <span>计划名称</span>
              <input name="planName" required />
            </label>
            <label className="form-field">
              <span>发展目标</span>
              <textarea name="developmentGoal" required />
            </label>
            <label className="form-field">
              <span>开始日期</span>
              <input name="startDate" type="date" required />
            </label>
            <label className="form-field">
              <span>结束日期</span>
              <input name="endDate" type="date" required />
            </label>
            <button disabled={busy} className="ds-button ds-button-primary">
              创建计划
            </button>
          </form>
        ) : null}
        {message ? (
          <p className="form-success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <section className="ds-panel" role="alert">
            <p className="form-error">{error}</p>
            <button className="ds-button" onClick={() => void load()}>
              重试
            </button>
          </section>
        ) : null}
        {forbidden ? (
          <section className="ds-panel">
            <h2>暂无人才发展权限</h2>
            <p>请联系管理员按岗位分配访问范围。</p>
          </section>
        ) : null}
        {loading ? (
          <section className={`ds-panel ${styles.loadingPanel}`}>
            正在加载人才发展工作台…
          </section>
        ) : null}
        {!loading && !forbidden ? (
          <>
            <section className={`ds-panel ${styles.desktopSensitive}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className="ds-eyebrow">人才盘点</span>
                  <h2>九宫格决策</h2>
                </div>
              </div>
              <label className="form-field">
                <span>盘点会议</span>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                >
                  <option value="">请选择</option>
                  {sessions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.sessionName} · {statusLabel[x.status] ?? x.status}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSession &&
              sessions.find((x) => x.id === selectedSession)?.status ===
                "draft" &&
              canReview ? (
                <button
                  className="ds-button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        hrApi.activateTalentSession(
                          selectedSession,
                          getAccessToken(),
                        ),
                      "盘点会已启动",
                    )
                  }
                >
                  启动盘点
                </button>
              ) : null}
              {selectedSession &&
              sessions.find((x) => x.id === selectedSession)?.status ===
                "active" &&
              canReview ? (
                <button
                  className="ds-button"
                  disabled={busy || subjects.some((x) => !x.nineBox)}
                  onClick={() =>
                    void act(
                      () =>
                        hrApi.closeTalentSession(
                          selectedSession,
                          getAccessToken(),
                        ),
                      "盘点会已结束",
                    )
                  }
                >
                  结束盘点
                </button>
              ) : null}
              <div className="ds-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>员工</th>
                      <th>画像时点</th>
                      <th>九宫格</th>
                      <th>潜力</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {x.employeeName}
                          <br />
                          <small>{x.employeeCode}</small>
                        </td>
                        <td>{x.profileAsOf}</td>
                        <td>{x.nineBox ?? "待评估"}</td>
                        <td>{x.potentialScore ?? "—"}</td>
                        <td>
                          {canReview ? (
                            <details>
                              <summary>记录决议</summary>
                              <form
                                className={styles.formGrid}
                                action={(f) => {
                                  const reason = String(f.get("reason"));
                                  return void act(
                                    () =>
                                      hrApi.decideTalentSubject(
                                        x.id,
                                        {
                                          performanceBand: String(
                                            f.get("performanceBand"),
                                          ),
                                          potentialBand: String(
                                            f.get("potentialBand"),
                                          ),
                                          potentialScore: Number(
                                            f.get("potentialScore"),
                                          ),
                                          reason,
                                          evidence: [
                                            {
                                              type: "meeting_record",
                                              note: reason,
                                            },
                                          ],
                                        },
                                        getAccessToken(),
                                      ),
                                    "九宫格决议已追加",
                                  );
                                }}
                              >
                                <select name="performanceBand">
                                  <option value="high">高绩效</option>
                                  <option value="medium">中绩效</option>
                                  <option value="low">低绩效</option>
                                </select>
                                <select name="potentialBand">
                                  <option value="high">高潜力</option>
                                  <option value="medium">中潜力</option>
                                  <option value="low">低潜力</option>
                                </select>
                                <input
                                  name="potentialScore"
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  required
                                />
                                <textarea
                                  name="reason"
                                  minLength={4}
                                  required
                                />
                                <button
                                  className="ds-button ds-button-primary"
                                  disabled={busy}
                                >
                                  确认
                                </button>
                              </form>
                            </details>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {profiles.length ? (
              <section className="ds-panel">
                <div className={styles.sectionHeading}>
                  <div>
                    <span className="ds-eyebrow">冻结档案</span>
                    <h2>人才画像</h2>
                  </div>
                </div>
                <div className="ds-mobile-record-list">
                  {profiles.map((x) => (
                    <article className="ds-mobile-record" key={x.id}>
                      <strong>
                        {x.employeeName} · {x.employeeCode}
                      </strong>
                      <span>
                        数据时点 {x.asOfDate} · 第 {x.snapshotNo} 版
                      </span>
                      <span>
                        绩效：
                        {String(
                          x.performanceSource?.finalLevelCode ??
                            "暂无已确认结果",
                        )}{" "}
                        · 360：
                        {String(
                          x.feedbackSource?.cycleName ?? "暂无已发布结果",
                        )}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {canSuccessionRead ? (
              <section className={`ds-panel ${styles.desktopSensitive}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className="ds-eyebrow">继任规划</span>
                    <h2>关键岗位与候选</h2>
                  </div>
                  <div className={styles.recordActions}>
                    {canSuccessionManage ? (
                      <>
                        <button
                          className="ds-button"
                          onClick={() =>
                            setPanel(panel === "position" ? null : "position")
                          }
                        >
                          登记岗位
                        </button>
                        <button
                          className="ds-button ds-button-primary"
                          onClick={() =>
                            setPanel(panel === "successor" ? null : "successor")
                          }
                        >
                          评估候选
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="ds-table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>关键岗位</th>
                        <th>候选人</th>
                        <th>准备度</th>
                        <th>风险</th>
                      </tr>
                    </thead>
                    <tbody>
                      {succession.map((x, i) => (
                        <tr
                          key={`${x.criticalPositionId}-${x.employeeCode ?? i}`}
                        >
                          <td>{x.positionName}</td>
                          <td>{x.candidateName ?? "尚无候选"}</td>
                          <td>
                            {x.readiness ? statusLabel[x.readiness] : "—"}
                          </td>
                          <td>{x.candidateRisk ?? x.positionRisk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            <section className="ds-panel">
              <div className={styles.sectionHeading}>
                <div>
                  <span className="ds-eyebrow">个人发展</span>
                  <h2>发展计划与行动</h2>
                </div>
              </div>
              <div className="ds-mobile-record-list">
                {plans.length ? (
                  plans.map((plan) => (
                    <article className="ds-mobile-record" key={plan.id}>
                      <strong>
                        {plan.planName} · {plan.employeeName}
                      </strong>
                      <span>{plan.developmentGoal}</span>
                      <span>
                        {plan.startDate} 至 {plan.endDate} ·{" "}
                        {statusLabel[plan.status] ?? plan.status}
                      </span>
                      {canDevelopmentManage && plan.status === "draft" ? (
                        <button
                          className="ds-button ds-button-primary"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                hrApi.transitionDevelopmentPlan(
                                  plan.id,
                                  { action: "activate" },
                                  getAccessToken(),
                                ),
                              "发展计划已启动",
                            )
                          }
                        >
                          启动计划
                        </button>
                      ) : null}
                      {plan.actions.map((action) => (
                        <div
                          key={action.id}
                          className={styles.actionDisclosure}
                        >
                          <strong>{action.actionName}</strong>
                          <span>
                            {action.ownerName} · 截止 {action.dueDate} ·{" "}
                            {statusLabel[action.status] ?? action.status}
                          </span>
                          {!["completed", "cancelled"].includes(
                            action.status,
                          ) && action.canAct ? (
                            <div className={styles.recordActions}>
                              {action.status === "pending" ? (
                                <button
                                  className="ds-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      () =>
                                        hrApi.transitionDevelopmentAction(
                                          action.id,
                                          { action: "start" },
                                          getAccessToken(),
                                        ),
                                      "发展行动已开始",
                                    )
                                  }
                                >
                                  开始
                                </button>
                              ) : null}
                              <button
                                className="ds-button ds-button-primary"
                                disabled={busy}
                                onClick={() =>
                                  void act(
                                    () =>
                                      hrApi.transitionDevelopmentAction(
                                        action.id,
                                        {
                                          action: "complete",
                                          note: "已完成并提交行动记录",
                                        },
                                        getAccessToken(),
                                      ),
                                    "发展行动已完成",
                                  )
                                }
                              >
                                完成
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {canDevelopmentManage &&
                      !["completed", "cancelled"].includes(plan.status) ? (
                        <details>
                          <summary>添加行动</summary>
                          <form
                            className={styles.formGrid}
                            action={(f) =>
                              void act(
                                () =>
                                  hrApi.addDevelopmentAction(
                                    plan.id,
                                    {
                                      actionName: String(f.get("actionName")),
                                      ownerEmployeeId: String(
                                        f.get("ownerEmployeeId"),
                                      ),
                                      dueDate: String(f.get("dueDate")),
                                    },
                                    getAccessToken(),
                                  ),
                                "发展行动已分配",
                              )
                            }
                          >
                            <input
                              name="actionName"
                              placeholder="行动名称"
                              required
                            />
                            <select name="ownerEmployeeId" required>
                              <option value="">负责人</option>
                              {options.employees.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.fullName}
                                </option>
                              ))}
                            </select>
                            <input name="dueDate" type="date" required />
                            <button
                              className="ds-button ds-button-primary"
                              disabled={busy}
                            >
                              添加
                            </button>
                          </form>
                        </details>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>当前没有可见的发展计划。</p>
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </PermissionGuard>
  );
}
