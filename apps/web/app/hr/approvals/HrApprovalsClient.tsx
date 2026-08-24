"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrApproval } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";

const labels: Record<string, string> = { employment_change: "任职变动", profile_change: "档案变更", compensation_change: "薪酬变更", draft: "草稿", submitted: "待审核", pending: "待审核", approved: "已通过", returned: "已退回", withdrawn: "已撤回" };

export function HrApprovalsClient() {
  const user = useAuthUser();
  const canReview = hasPermission(user, HR_PERMISSIONS.HR_APPROVAL_REVIEW);
  const [mine, setMine] = useState<HrApproval[]>([]);
  const [pending, setPending] = useState<HrApproval[]>([]);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      const [myRows, pendingRows] = await Promise.all([hrApi.myApprovals(token), canReview ? hrApi.pendingApprovals(token) : Promise.resolve([])]);
      setMine(myRows); setPending(pendingRows); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载审批失败"); }
  }, [canReview]);

  useEffect(() => { void load(); }, [load]);
  const myActive = useMemo(() => mine.filter((item) => ["draft", "submitted", "pending", "returned"].includes(item.status)).length, [mine]);

  const create = async (form: FormData) => {
    try {
      await hrApi.createApproval({ requestType: String(form.get("requestType")), title: String(form.get("title")), payload: { description: String(form.get("description")) } }, getAccessToken());
      setShowCreate(false); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建申请失败"); }
  };
  const act = async (id: string, action: string, comment?: string) => {
    try { await hrApi.approvalAction(id, { action, comment }, getAccessToken()); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
  };
  const review = async (form: FormData) => {
    try { await hrApi.reviewApproval(String(form.get("id")), { action: String(form.get("action")), comment: String(form.get("comment")) }, getAccessToken()); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "审核失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_APPROVALS_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人事流程</span><h1>人事审批</h1><p>任职、档案和薪酬变更统一申请，完整保留提交、退回、撤回和审批轨迹。</p></div><div className={styles.heroActions}><button type="button" className="ds-button ds-button-primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "收起申请" : "发起申请"}</button></div></section>
      <section className="ds-kpi-grid" aria-label="审批概览"><article className="ds-kpi-card"><span>我的申请</span><strong>{mine.length}</strong><small>当前可见记录</small></article><article className="ds-kpi-card"><span>进行中</span><strong>{myActive}</strong><small>草稿、待审或退回</small></article>{canReview ? <article className="ds-kpi-card"><span>待我审核</span><strong>{pending.length}</strong><small>需要审批处理</small></article> : null}</section>
      {showCreate ? <form className={`ds-panel ${styles.formGrid}`} action={create}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">新申请</span><h2>发起人事申请</h2></div></div><label className="form-field"><span>申请类型</span><select name="requestType"><option value="employment_change">任职变动</option><option value="profile_change">档案变更</option><option value="compensation_change">薪酬变更</option></select></label><label className="form-field"><span>申请标题</span><input name="title" required maxLength={200} /></label><label className="form-field"><span>申请说明</span><textarea name="description" required maxLength={3000} /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存草稿</button><button type="button" className="ds-button" onClick={() => setShowCreate(false)}>取消</button></div></form> : null}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      {canReview ? <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">审批队列</span><h2>待审核申请</h2></div><strong>{pending.length} 项待处理</strong></div><div className="ds-mobile-record-list">{pending.length === 0 ? <p className={styles.emptyState}>当前没有待审核的人事申请。</p> : pending.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{item.title}</strong><span>{labels[item.requestType]} · {item.requestNo}</span><details className={styles.actionDisclosure}><summary>审核申请</summary><form className={styles.formGrid} action={review}><input type="hidden" name="id" value={item.id} /><label className="form-field"><span>审核结果</span><select name="action"><option value="approve">通过</option><option value="return">退回补充</option></select></label><label className="form-field"><span>审核意见</span><input name="comment" required maxLength={1000} /></label><button className="ds-button ds-button-primary">提交审核</button></form></details></article>)}</div></section> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">申请记录</span><h2>我的申请</h2></div><strong>{myActive} 项进行中</strong></div><div className="ds-mobile-record-list">{mine.length === 0 ? <p className={styles.emptyState}>暂无申请，可使用右上角“发起申请”开始办理。</p> : mine.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{item.title}</strong><span>{labels[item.requestType]} · {labels[item.status] ?? item.status}</span><span>{item.requestNo}</span><div className={styles.recordActions}>{item.status === "draft" ? <button className="ds-button ds-button-primary" onClick={() => void act(item.id, "submit")}>提交审核</button> : null}{item.status === "returned" ? <button className="ds-button ds-button-primary" onClick={() => void act(item.id, "resubmit", "已按意见补充")}>重新提交</button> : null}{["submitted", "pending"].includes(item.status) ? <button className="ds-button" onClick={() => void act(item.id, "withdraw", "申请人撤回")}>撤回</button> : null}</div></article>)}</div></section>
    </main>
  </PermissionGuard>;
}
