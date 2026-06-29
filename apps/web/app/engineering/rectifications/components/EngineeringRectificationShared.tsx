"use client";

import { Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  engineeringIssueSeverityLabels,
  engineeringRectificationActionLabels,
  engineeringRectificationStatusLabels,
  issueSeverityVariant,
  rectificationStatusVariant
} from "../../../../lib/engineering-rectifications-display";
import type {
  EngineeringRectificationAction,
  EngineeringRectificationActionInput,
  EngineeringRectificationStatus
} from "../../../../lib/engineering-rectifications-types";
import styles from "../../projects/engineering-projects.module.css";

export function RectificationStatusPill({ status }: { status: EngineeringRectificationStatus }) {
  return <StatusPill variant={rectificationStatusVariant(status)}>{engineeringRectificationStatusLabels[status] ?? status}</StatusPill>;
}

export function RectificationSeverityPill({ severity }: { severity: keyof typeof engineeringIssueSeverityLabels }) {
  return <StatusPill variant={issueSeverityVariant(severity)}>{engineeringIssueSeverityLabels[severity] ?? severity}</StatusPill>;
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

export function MessageLine({ message }: { message: string }) {
  if (!message) return null;
  return <p className={styles.message}>{message}</p>;
}

export function ForbiddenEngineeringRectification() {
  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <div className={styles.forbiddenBox}>
        <h1>403</h1>
        <p>当前账号没有工程整改访问权限。</p>
      </div>
    </main>
  );
}

export function RectificationActionDrawer({
  action,
  saving,
  onClose,
  onSubmit
}: {
  action: EngineeringRectificationAction;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: EngineeringRectificationActionInput) => Promise<void>;
}) {
  const [form, setForm] = useState({
    reason: engineeringRectificationActionLabels[action] ?? action,
    comment: "",
    feedback: "",
    recheckComment: ""
  });
  const validationMessage = useMemo(() => {
    if (action === "SUBMIT" && !form.feedback.trim()) return "请填写整改反馈";
    if (action === "REJECT" && !form.recheckComment.trim() && !form.comment.trim()) return "请填写驳回复查意见";
    return "";
  }, [action, form.comment, form.feedback, form.recheckComment]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) return;
    await onSubmit({
      action,
      reason: emptyToUndefined(form.reason),
      comment: emptyToUndefined(form.comment),
      feedback: emptyToUndefined(form.feedback),
      recheck_comment: emptyToUndefined(form.recheckComment)
    });
  }

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="工程整改"
        title={engineeringRectificationActionLabels[action] ?? action}
        description="所有整改动作由后端状态机执行，并同步问题状态。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={(event) => void submit(event)}>
        <label className={styles.formField}>
          <span>动作原因</span>
          <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
        </label>
        {action === "SUBMIT" || action === "START" ? (
          <label className={styles.formField}>
            <span>整改反馈{action === "SUBMIT" ? <em>*</em> : null}</span>
            <textarea rows={4} value={form.feedback} onChange={(event) => setForm((current) => ({ ...current, feedback: event.target.value }))} />
          </label>
        ) : null}
        {action === "PASS" || action === "REJECT" || action === "START_RECHECK" ? (
          <label className={styles.formField}>
            <span>复查意见{action === "REJECT" ? <em>*</em> : null}</span>
            <textarea rows={4} value={form.recheckComment} onChange={(event) => setForm((current) => ({ ...current, recheckComment: event.target.value }))} />
          </label>
        ) : null}
        <label className={styles.formField}>
          <span>备注</span>
          <textarea rows={3} value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} />
        </label>
        {validationMessage ? <MessageLine message={validationMessage} /> : null}
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={saving || Boolean(validationMessage)}>
            {saving ? "执行中..." : "确认执行"}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}
