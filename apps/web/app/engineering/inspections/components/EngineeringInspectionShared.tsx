"use client";

import { Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  engineeringInspectionStatusLabels,
  engineeringInspectionTypeLabels,
  engineeringIssueSeverityLabels,
  engineeringIssueStatusLabels,
  engineeringIssueTypeLabels,
  inspectionStatusVariant,
  issueSeverityVariant,
  issueStatusVariant
} from "../../../../lib/engineering-inspections-display";
import type {
  CreateEngineeringIssueInput,
  EngineeringInspectionStatus,
  EngineeringInspectionType,
  EngineeringIssue,
  EngineeringIssueSeverity,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "../../../../lib/engineering-inspections-types";
import { validateInspectionCounts } from "../../../../lib/engineering-inspections-utils";
import styles from "../../projects/engineering-projects.module.css";

export function InspectionStatusPill({ status }: { status: EngineeringInspectionStatus }) {
  return <StatusPill variant={inspectionStatusVariant(status)}>{engineeringInspectionStatusLabels[status] ?? status}</StatusPill>;
}

export function InspectionTypePill({ type }: { type: EngineeringInspectionType }) {
  return <StatusPill variant="info">{engineeringInspectionTypeLabels[type] ?? type}</StatusPill>;
}

export function IssueSeverityPill({ severity }: { severity: EngineeringIssueSeverity }) {
  return <StatusPill variant={issueSeverityVariant(severity)}>{engineeringIssueSeverityLabels[severity] ?? severity}</StatusPill>;
}

export function IssueStatusPill({ status }: { status: EngineeringIssueStatus }) {
  return <StatusPill variant={issueStatusVariant(status)}>{engineeringIssueStatusLabels[status] ?? status}</StatusPill>;
}

export function IssueTypePill({ type }: { type: EngineeringIssueType }) {
  return <StatusPill variant="info">{engineeringIssueTypeLabels[type] ?? type}</StatusPill>;
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.detailItem}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

export function MessageLine({ message, testId }: { message: string; testId?: string }) {
  if (!message) return null;
  return <p className={styles.message} data-testid={testId}>{message}</p>;
}

export function ForbiddenEngineeringInspection() {
  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <div className={styles.forbiddenBox}>
        <h1>403</h1>
        <p>当前账号没有工程巡检访问权限。</p>
      </div>
    </main>
  );
}

export function validateInspectionFormBase(input: { title: string; issueCount: string; criticalIssueCount: string }): string {
  if (!input.title.trim()) return "请填写巡检标题";
  return validateInspectionCounts(input.issueCount, input.criticalIssueCount);
}

export function EngineeringIssueDrawer({
  saving,
  onClose,
  onSubmit,
  responsibleUsers,
  responsibleOrgs
}: {
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEngineeringIssueInput) => Promise<void>;
  responsibleUsers: Array<{ id: string; label: string }>;
  responsibleOrgs: Array<{ id: string; label: string }>;
}) {
  const [form, setForm] = useState({
    issueTitle: "",
    issueType: "QUALITY" as EngineeringIssueType,
    severity: "MEDIUM" as EngineeringIssueSeverity,
    description: "",
    deadline: "",
    responsibleUserId: "",
    responsibleOrgId: "",
    remark: ""
  });
  const validationMessage = useMemo(() => {
    if (!form.issueTitle.trim()) return "请填写问题标题";
    if (!form.description.trim()) return "请填写问题描述";
    return "";
  }, [form]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) return;
    await onSubmit({
      issue_title: form.issueTitle.trim(),
      issue_type: form.issueType,
      severity: form.severity,
      description: form.description.trim(),
      deadline: emptyToUndefined(form.deadline),
      responsible_user_id: emptyToUndefined(form.responsibleUserId),
      responsible_org_id: emptyToUndefined(form.responsibleOrgId),
      remark: emptyToUndefined(form.remark)
    });
  }

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="巡检问题"
        title="新增问题"
        description="记录巡检发现的问题，用于后续整改、复查和责任跟进。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={(event) => void submit(event)}>
        <label className={styles.formField}>
          <span>问题标题<em>*</em></span>
          <input value={form.issueTitle} onChange={(event) => setForm((current) => ({ ...current, issueTitle: event.target.value }))} />
        </label>
        <label className={styles.formField}>
          <span>问题类型</span>
          <select value={form.issueType} onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value as EngineeringIssueType }))}>
            {(Object.entries(engineeringIssueTypeLabels) as Array<[EngineeringIssueType, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={styles.formField}>
          <span>严重等级</span>
          <select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as EngineeringIssueSeverity }))}>
            {(Object.entries(engineeringIssueSeverityLabels) as Array<[EngineeringIssueSeverity, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={styles.formField}>
          <span>问题描述<em>*</em></span>
          <textarea rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <label className={styles.formField}>
          <span>整改期限</span>
          <input type="date" value={form.deadline} onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} />
        </label>
        <label className={styles.formField}>
          <span>责任人</span>
          <select value={form.responsibleUserId} onChange={(event) => setForm((current) => ({ ...current, responsibleUserId: event.target.value }))}>
            <option value="">暂不指定</option>
            {responsibleUsers.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.formField}>
          <span>责任组织</span>
          <select value={form.responsibleOrgId} onChange={(event) => setForm((current) => ({ ...current, responsibleOrgId: event.target.value }))}>
            <option value="">暂不指定</option>
            {responsibleOrgs.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.formField}>
          <span>备注</span>
          <textarea rows={3} value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} />
        </label>
        {validationMessage ? <MessageLine message={validationMessage} /> : null}
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={saving || Boolean(validationMessage)}>
            {saving ? "保存中..." : "保存问题"}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

export function openIssueCount(issues: EngineeringIssue[]): number {
  return issues.filter((issue) => issue.issueStatus !== "CLOSED" && issue.issueStatus !== "CANCELLED").length;
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}
