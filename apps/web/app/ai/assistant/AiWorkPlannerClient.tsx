"use client";

import { ContentCard, EmptyState, FeedbackNotice, LoadingState, PageHeader, PageShell, StatusPill } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { ArrowRight, Check, ClipboardList, ExternalLink, RefreshCw, Send, Sparkles, UserRoundCheck, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import {
  approveAiWorkPlan,
  createAiWorkPlan,
  getAiWorkPlan,
  getWorkforceDirectory,
  listAiWorkPlans,
  materializeAiWorkPlan,
  rejectAiWorkPlan,
  updateAiWorkPlanTask
} from "../../../lib/ai-work-plans-api";
import type { AiWorkPlan, AiWorkPlanDetail, AiWorkPlanTask, WorkforceDirectoryPerson } from "../../../lib/ai-work-plans-types";
import { getAccessToken } from "../../../lib/authz";
import styles from "./ai-work-planner.module.css";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草案",
  NEEDS_CLARIFICATION: "待补充",
  READY_FOR_REVIEW: "待审核",
  APPROVED: "已批准",
  MATERIALIZED: "已生成工单",
  REJECTED: "已驳回",
  CANCELLED: "已取消"
};

const EXAMPLE = "本周五前完成 A1 楼消防设施专项检查，由安全部牵头，工程部配合，发现重大隐患后 24 小时内整改，物业负责人最终复核。";

export function AiWorkPlannerClient() {
  const searchParams = useSearchParams();
  const [instruction, setInstruction] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [location, setLocation] = useState("");
  const [detail, setDetail] = useState<AiWorkPlanDetail | null>(null);
  const [recent, setRecent] = useState<AiWorkPlan[]>([]);
  const [directory, setDirectory] = useState<WorkforceDirectoryPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);

  const token = getAccessToken() ?? "";
  const loadBase = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [plans, people] = await Promise.all([listAiWorkPlans(token), getWorkforceDirectory(token)]);
      setRecent(plans.items);
      setDirectory(people);
      const requestedId = searchParams.get("plan");
      if (requestedId) setDetail(await getAiWorkPlan(token, requestedId));
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "工作计划加载失败" });
    } finally {
      setLoading(false);
    }
  }, [searchParams, token]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const summary = useMemo(() => {
    if (!detail) return null;
    return {
      assigned: detail.tasks.filter((task) => task.confirmedAssigneeId).length,
      due: detail.tasks.filter((task) => task.dueAt).length,
      materialized: detail.tasks.filter((task) => task.workOrderId).length
    };
  }, [detail]);

  async function generate() {
    if (instruction.trim().length < 8) {
      setMessage({ tone: "danger", text: "请先输入清晰的工作目标、范围和时间要求。" });
      return;
    }
    setWorking(true);
    setMessage({ tone: "info", text: "正在解析目标、匹配部门和责任人…" });
    try {
      const result = await createAiWorkPlan(token, {
        instruction,
        default_due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        location: location || undefined
      });
      setDetail(result);
      setRecent((items) => [result.plan, ...items.filter((item) => item.id !== result.plan.id)].slice(0, 12));
      setMessage({ tone: "success", text: `已生成 ${result.tasks.length} 项工作草案，请确认责任人和期限。` });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "生成工作计划失败" });
    } finally {
      setWorking(false);
    }
  }

  async function saveTask(task: AiWorkPlanTask, patch: Parameters<typeof updateAiWorkPlanTask>[3]) {
    if (!detail) return;
    setWorking(true);
    try {
      setDetail(await updateAiWorkPlanTask(token, detail.plan.id, task.id, patch));
      setMessage({ tone: "success", text: `${task.taskCode} 已更新。` });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "更新任务失败" });
    } finally {
      setWorking(false);
    }
  }

  async function runAction(action: "approve" | "materialize" | "reject") {
    if (!detail) return;
    setWorking(true);
    try {
      const result = action === "approve"
        ? await approveAiWorkPlan(token, detail.plan.id, "工作安排已核对")
        : action === "materialize"
          ? await materializeAiWorkPlan(token, detail.plan.id)
          : await rejectAiWorkPlan(token, detail.plan.id, "工作安排需要重新编制");
      setDetail(result);
      setRecent((items) => items.map((item) => item.id === result.plan.id ? result.plan : item));
      setMessage({
        tone: "success",
        text: action === "approve" ? "工作计划已批准，责任人已收到消息。" : action === "materialize" ? "真实工单已生成并进入个人待办。" : "工作计划已驳回。"
      });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "操作失败" });
    } finally {
      setWorking(false);
    }
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.AI_ASSISTANT} module="ai" fallback={<PageShell><EmptyState title="无权访问 AI 工作台" /></PageShell>}>
      <PageShell className={`${styles.page} ds-page`}>
        <PageHeader
          eyebrow="Natural Language Work Orchestration"
          title="工作安排"
          description="用一句话拆解部门、责任人、期限和验收标准；确认后生成真实工单。"
          actions={(
            <Link className="secondary-button" href="/workflow/inbox">
              流程收件箱 <ArrowRight size={16} />
            </Link>
          )}
        />

        {message ? <FeedbackNotice variant={message.tone === "danger" ? "danger" : "info"}>{message.text}</FeedbackNotice> : null}

        <section className={styles.composer} aria-label="自然语言工作安排">
          <div className={styles.composerMain}>
            <label htmlFor="work-instruction">工作目标</label>
            <textarea
              id="work-instruction"
              data-testid="ai-work-instruction"
              placeholder={EXAMPLE}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className={styles.composerFields}>
              <label>
                <span>统一截止时间（可选）</span>
                <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <label>
                <span>地点（可选）</span>
                <input placeholder="例如 A1 楼" value={location} onChange={(event) => setLocation(event.target.value)} />
              </label>
            </div>
          </div>
          <div className={styles.composerActions}>
            <button className="secondary-button" type="button" onClick={() => setInstruction(EXAMPLE)}>填入示例</button>
            <button className="primary-button" data-testid="ai-work-generate" disabled={working} type="button" onClick={() => void generate()}>
              <Sparkles size={17} /> {working ? "生成中" : "生成工作清单"}
            </button>
          </div>
        </section>

        {loading ? <ContentCard><LoadingState title="正在加载工作计划" /></ContentCard> : null}

        {detail ? (
          <section className={styles.planSection}>
            <header className={styles.planHeader}>
              <div>
                <span>{detail.plan.planCode}</span>
                <h2>{detail.plan.normalizedGoal}</h2>
              </div>
              <div className={styles.statusRow}>
                <StatusPill value={STATUS_LABELS[detail.plan.status] ?? detail.plan.status} />
                <StatusPill value={`风险 ${detail.plan.riskLevel}`} />
              </div>
            </header>

            <div className={styles.planProgress}>
              <span><b>{detail.tasks.length}</b> 项工作</span>
              <span><b>{summary?.assigned}</b> 已确认责任人</span>
              <span><b>{summary?.due}</b> 已确认期限</span>
              <span><b>{summary?.materialized}</b> 已生成工单</span>
            </div>

            {!detail.readiness.ready && detail.plan.status !== "APPROVED" ? (
              <FeedbackNotice variant="info">
                批准前需补齐：{[
                  detail.readiness.missingAssigneeTaskCodes.length ? `${detail.readiness.missingAssigneeTaskCodes.join("、")} 责任人` : "",
                  detail.readiness.missingDueAtTaskCodes.length ? `${detail.readiness.missingDueAtTaskCodes.join("、")} 截止时间` : ""
                ].filter(Boolean).join("；")}
              </FeedbackNotice>
            ) : null}

            <div className={styles.taskList}>
              {detail.tasks.map((task) => (
                <TaskEditor directory={directory} disabled={working || !["DRAFT", "NEEDS_CLARIFICATION", "READY_FOR_REVIEW"].includes(detail.plan.status)} key={task.id} onSave={saveTask} task={task} />
              ))}
            </div>

            <footer className={styles.planActions}>
              {detail.plan.status === "READY_FOR_REVIEW" ? (
                <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_ASSIGN}>
                  <button className="secondary-button danger-button" disabled={working} type="button" onClick={() => void runAction("reject")}><X size={16} /> 驳回</button>
                  <button className="primary-button" data-testid="ai-work-approve" disabled={working} type="button" onClick={() => void runAction("approve")}><Check size={16} /> 批准工作安排</button>
                </PermissionGuard>
              ) : null}
              {detail.plan.status === "APPROVED" ? (
                <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_CREATE}>
                  <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_ASSIGN}>
                    <button className="primary-button" data-testid="ai-work-materialize" disabled={working} type="button" onClick={() => void runAction("materialize")}><Send size={16} /> 生成并派发工单</button>
                  </PermissionGuard>
                </PermissionGuard>
              ) : null}
              {detail.plan.status === "MATERIALIZED" ? <Link className="primary-button" href="/workflow/inbox">查看个人待办 <ExternalLink size={16} /></Link> : null}
            </footer>
          </section>
        ) : !loading ? (
          <ContentCard>
            <EmptyState title="输入工作目标开始编排" description="系统会先生成草案，不会跳过人工确认直接派单。" />
          </ContentCard>
        ) : null}

        <section className={styles.recentSection}>
          <div className={styles.sectionTitle}>
            <div><h2>最近工作计划</h2><p>继续审核、派单或查看结果。</p></div>
            <button className="secondary-button" disabled={loading} type="button" onClick={() => void loadBase()}><RefreshCw size={16} /> 刷新</button>
          </div>
          <div className={styles.recentList}>
            {recent.map((plan) => (
              <button className={styles.recentItem} key={plan.id} type="button" onClick={() => void getAiWorkPlan(token, plan.id).then(setDetail)}>
                <span><ClipboardList size={18} /><b>{plan.planCode}</b></span>
                <strong>{plan.normalizedGoal}</strong>
                <small>{STATUS_LABELS[plan.status] ?? plan.status} · {plan.taskCount} 项</small>
              </button>
            ))}
            {recent.length === 0 ? <EmptyState compact title="暂无工作计划" /> : null}
          </div>
        </section>
      </PageShell>
    </PermissionGuard>
  );
}

function TaskEditor({ task, directory, disabled, onSave }: {
  task: AiWorkPlanTask;
  directory: WorkforceDirectoryPerson[];
  disabled: boolean;
  onSave: (task: AiWorkPlanTask, patch: Parameters<typeof updateAiWorkPlanTask>[3]) => Promise<void>;
}) {
  const [assigneeId, setAssigneeId] = useState(task.confirmedAssigneeId ?? "");
  const [taskDueAt, setTaskDueAt] = useState(toLocalDateTime(task.dueAt));
  const [criteria, setCriteria] = useState(task.acceptanceCriteria);
  useEffect(() => {
    setAssigneeId(task.confirmedAssigneeId ?? "");
    setTaskDueAt(toLocalDateTime(task.dueAt));
    setCriteria(task.acceptanceCriteria);
  }, [task]);
  const candidates = useMemo(() => {
    const candidateIds = new Set(task.candidates.map((candidate) => candidate.candidateUserId));
    return [
      ...task.candidates.map((candidate) => directory.find((person) => person.userId === candidate.candidateUserId)).filter((person): person is WorkforceDirectoryPerson => Boolean(person)),
      ...directory.filter((person) => !candidateIds.has(person.userId))
    ];
  }, [directory, task.candidates]);
  return (
    <article className={styles.taskCard} data-ready={task.confirmedAssigneeId && task.dueAt ? "true" : "false"}>
      <header>
        <span>{task.taskCode}</span>
        <StatusPill value={task.status === "MATERIALIZED" ? "已生成工单" : task.confirmedAssigneeId ? "已匹配" : "待确认"} />
      </header>
      <h3>{task.title}</h3>
      <p>{task.departmentName ?? "待确认部门"} · {task.priority === "high" ? "高优先级" : task.priority === "low" ? "低优先级" : "中优先级"}</p>
      <div className={styles.taskFields}>
        <label>
          <span>责任人</span>
          <select disabled={disabled} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">请选择责任人</option>
            {candidates.map((person) => (
              <option key={person.userId} value={person.userId}>{person.displayName} · {person.orgName ?? "未归属部门"} · 在办 {person.activeWorkload}</option>
            ))}
          </select>
        </label>
        <label>
          <span>截止时间</span>
          <input disabled={disabled} type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} />
        </label>
        <label className={styles.criteriaField}>
          <span>验收标准</span>
          <textarea disabled={disabled} value={criteria} onChange={(event) => setCriteria(event.target.value)} />
        </label>
      </div>
      <div className={styles.taskFooter}>
        <span><UserRoundCheck size={15} /> 匹配置信度 {Math.round(task.assignmentConfidence * 100)}%</span>
        {task.workOrderId ? <Link href={`/workorders/${task.workOrderId}`}>查看工单 <ExternalLink size={14} /></Link> : null}
        {!disabled ? (
          <button className="secondary-button" type="button" onClick={() => void onSave(task, {
            confirmed_assignee_id: assigneeId || null,
            due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
            acceptance_criteria: criteria
          })}>保存确认</button>
        ) : null}
      </div>
    </article>
  );
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
