"use client";

import { Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  dailyReportStatusVariant,
  engineeringDailyReportStatusLabels,
  engineeringWeatherTypeLabels,
  weatherVariant
} from "../../../../lib/engineering-daily-reports-display";
import type { EngineeringDailyReport, EngineeringDailyReportStatus, EngineeringWeatherType } from "../../../../lib/engineering-daily-reports-types";
import { validateDailyReportProgress } from "../../../../lib/engineering-daily-reports-utils";
import styles from "../../projects/engineering-projects.module.css";

export function DailyReportStatusPill({ status }: { status: EngineeringDailyReportStatus }) {
  return <StatusPill variant={dailyReportStatusVariant(status)}>{engineeringDailyReportStatusLabels[status] ?? status}</StatusPill>;
}

export function WeatherPill({ weather }: { weather: EngineeringWeatherType }) {
  return <StatusPill variant={weatherVariant(weather)}>{engineeringWeatherTypeLabels[weather] ?? weather}</StatusPill>;
}

export function DailyReportProgressBar({ value }: { value?: number | null }) {
  const progress = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div className={styles.progressWrap} aria-label={`日报进度 ${progress}%`}>
      <span><i style={{ width: `${progress}%` }} /></span>
      <strong>{progress}%</strong>
    </div>
  );
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

export function formatNumber(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

export function MessageLine({ message }: { message: string }) {
  if (!message) return null;
  return <p className={styles.message}>{message}</p>;
}

export function ForbiddenEngineeringDailyReport() {
  return (
    <main className="content">
      <div className={styles.forbiddenBox}>
        <h1>403</h1>
        <p>当前账号没有施工日报访问权限。</p>
      </div>
    </main>
  );
}

export function DailyReportReviewDrawer({
  report,
  saving,
  onClose,
  onSubmit
}: {
  report: EngineeringDailyReport;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: { approved: boolean; review_comment?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    approved: "true",
    reviewComment: ""
  });
  const validationMessage = useMemo(() => {
    if (form.approved === "false" && !form.reviewComment.trim()) {
      return "驳回时建议填写审核意见";
    }
    return "";
  }, [form]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) return;
    await onSubmit({
      approved: form.approved === "true",
      review_comment: emptyToUndefined(form.reviewComment)
    });
  }

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="施工日报审核"
        title={report.reportCode}
        description="审核动作由后端日报 API 处理，前端不直接修改状态。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={(event) => void submit(event)}>
        <label className={styles.formField}>
          <span>审核结果</span>
          <select value={form.approved} onChange={(event) => setForm((current) => ({ ...current, approved: event.target.value }))}>
            <option value="true">审核通过</option>
            <option value="false">驳回</option>
          </select>
        </label>
        <label className={styles.formField}>
          <span>审核意见{form.approved === "false" ? <em>*</em> : null}</span>
          <textarea
            rows={4}
            value={form.reviewComment}
            placeholder={form.approved === "false" ? "请说明驳回原因，例如：缺少现场照片或施工内容不完整" : "可填写通过意见"}
            onChange={(event) => setForm((current) => ({ ...current, reviewComment: event.target.value }))}
          />
        </label>
        {validationMessage ? <MessageLine message={validationMessage} /> : null}
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={saving || Boolean(validationMessage)}>
            {saving ? "提交中..." : "确认审核"}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

export function validateDailyReportFormBase(input: { workContent: string; workerCount: string; managerCount: string; progressPercent: string }): string {
  if (!input.workContent.trim()) return "请填写今日施工内容";
  return (
    validateDailyReportPeopleCount(input.workerCount, "现场工人人数") ||
    validateDailyReportPeopleCount(input.managerCount, "管理人员人数") ||
    validateDailyReportProgress(input.progressPercent)
  );
}

function validateDailyReportPeopleCount(value: string | number, label: string): string {
  if (String(value).trim() === "") return "";
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    return `${label}不能为负数`;
  }
  return "";
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}
