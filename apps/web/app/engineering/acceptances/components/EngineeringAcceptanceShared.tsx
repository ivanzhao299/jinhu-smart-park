"use client";

import { Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  acceptanceStatusVariant,
  acceptanceTypeVariant,
  engineeringAcceptanceStatusLabels,
  engineeringAcceptanceTypeLabels
} from "../../../../lib/engineering-acceptances-display";
import type { EngineeringAcceptance, EngineeringAcceptanceStatus, EngineeringAcceptanceType, ReviewEngineeringAcceptanceInput } from "../../../../lib/engineering-acceptances-types";
import styles from "../../projects/engineering-projects.module.css";

export function AcceptanceStatusPill({ status }: { status: EngineeringAcceptanceStatus }) {
  return <StatusPill variant={acceptanceStatusVariant(status)}>{engineeringAcceptanceStatusLabels[status] ?? status}</StatusPill>;
}

export function AcceptanceTypePill({ type }: { type: EngineeringAcceptanceType }) {
  return <StatusPill variant={acceptanceTypeVariant(type)}>{engineeringAcceptanceTypeLabels[type] ?? type}</StatusPill>;
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

export function ForbiddenEngineeringAcceptance() {
  return (
    <main className="content">
      <div className={styles.forbiddenBox}>
        <h1>403</h1>
        <p>当前账号没有工程验收访问权限。</p>
      </div>
    </main>
  );
}

export function AcceptanceReviewDrawer({
  acceptance,
  saving,
  onClose,
  onSubmit
}: {
  acceptance: EngineeringAcceptance;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: ReviewEngineeringAcceptanceInput) => Promise<void>;
}) {
  const [form, setForm] = useState({
    result: "passed",
    actualAcceptanceDate: new Date().toISOString().slice(0, 10),
    resultSummary: "",
    reviewComment: ""
  });
  const validationMessage = useMemo(() => {
    if (form.result !== "passed" && !form.reviewComment.trim()) return "未通过或需整改时请填写评审意见";
    return "";
  }, [form]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) return;
    await onSubmit({
      passed: form.result === "passed",
      rectification_required: form.result === "rectification_required",
      actual_acceptance_date: emptyToUndefined(form.actualAcceptanceDate),
      result_summary: emptyToUndefined(form.resultSummary),
      review_comment: emptyToUndefined(form.reviewComment)
    });
  }

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="工程验收评审"
        title={acceptance.acceptanceCode}
        description="评审动作由后端验收 API 处理，前端不直接修改状态。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={(event) => void submit(event)}>
        <label className={styles.formField}>
          <span>评审结果</span>
          <select value={form.result} onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}>
            <option value="passed">通过</option>
            <option value="failed">未通过</option>
            <option value="rectification_required">需整改</option>
          </select>
        </label>
        <label className={styles.formField}>
          <span>实际验收日期</span>
          <input type="date" value={form.actualAcceptanceDate} onChange={(event) => setForm((current) => ({ ...current, actualAcceptanceDate: event.target.value }))} />
        </label>
        <label className={styles.formField}>
          <span>结果摘要</span>
          <textarea rows={4} value={form.resultSummary} onChange={(event) => setForm((current) => ({ ...current, resultSummary: event.target.value }))} />
        </label>
        <label className={styles.formField}>
          <span>评审意见{form.result !== "passed" ? <em>*</em> : null}</span>
          <textarea rows={4} value={form.reviewComment} onChange={(event) => setForm((current) => ({ ...current, reviewComment: event.target.value }))} />
        </label>
        {validationMessage ? <MessageLine message={validationMessage} /> : null}
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={saving || Boolean(validationMessage)}>
            {saving ? "提交中..." : "确认评审"}
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
