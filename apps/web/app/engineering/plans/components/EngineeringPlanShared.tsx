"use client";

import { DataTable, Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  engineeringPlanLevelLabels,
  engineeringPlanStatusLabels,
  engineeringPlanStatusOptions,
  engineeringPlanTypeLabels,
  planLevelVariant,
  planStatusVariant
} from "../../../../lib/engineering-plans-display";
import type { EngineeringPlan, EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanTreeNode } from "../../../../lib/engineering-plans-types";
import { validateActualDateRange, validatePlanProgress } from "../../../../lib/engineering-plans-utils";
import { engineeringRiskLevelLabels, projectRiskVariant } from "../../../../lib/engineering-projects-display";
import type { EngineeringRiskLevel } from "../../../../lib/engineering-projects-types";
import styles from "../../projects/engineering-projects.module.css";

export function PlanStatusPill({ status }: { status: EngineeringPlanStatus }) {
  return <StatusPill variant={planStatusVariant(status)}>{engineeringPlanStatusLabels[status] ?? status}</StatusPill>;
}

export function PlanTypePill({ type }: { type: EngineeringPlan["planType"] }) {
  return <StatusPill variant="info">{engineeringPlanTypeLabels[type] ?? type}</StatusPill>;
}

export function PlanLevelPill({ level }: { level: EngineeringPlanLevel }) {
  return <StatusPill variant={planLevelVariant(level)}>{engineeringPlanLevelLabels[level] ?? level}</StatusPill>;
}

export function PlanRiskPill({ risk }: { risk: EngineeringRiskLevel }) {
  return <StatusPill variant={projectRiskVariant(risk)}>{engineeringRiskLevelLabels[risk] ?? risk}</StatusPill>;
}

export function PlanProgressBar({ value }: { value?: number | null }) {
  const progress = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div className={styles.progressWrap} aria-label={`计划进度 ${progress}%`}>
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

export function formatNumber(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

export function MessageLine({ message }: { message: string }) {
  if (!message) return null;
  return <p className={styles.message}>{message}</p>;
}

export function ForbiddenEngineeringPlan() {
  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <div className={styles.forbiddenBox}>
        <h1>403</h1>
        <p>当前账号没有工程计划访问权限。</p>
      </div>
    </main>
  );
}

export function PlanTreeTable({
  rows,
  emptyText = "暂无工程计划"
}: {
  rows: EngineeringPlanTreeNode[];
  emptyText?: string;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th>计划名称</th>
          <th>类型</th>
          <th>层级</th>
          <th>状态</th>
          <th>计划周期</th>
          <th>进度</th>
          <th>延期</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <span className={styles.treeName} style={{ paddingLeft: `${row.depth * 18}px` }}>
                {row.depth > 0 ? "└ " : ""}
                <strong>{row.planName}</strong>
              </span>
            </td>
            <td><PlanTypePill type={row.planType} /></td>
            <td><PlanLevelPill level={row.planLevel} /></td>
            <td><PlanStatusPill status={row.status} /></td>
            <td>{formatDate(row.plannedStartDate)} - {formatDate(row.plannedEndDate)}</td>
            <td><PlanProgressBar value={row.actualProgressPercent} /></td>
            <td>{row.delayDays > 0 ? <StatusPill variant="warning">{row.delayDays} 天</StatusPill> : "-"}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={7}>{emptyText}</td>
          </tr>
        ) : null}
      </tbody>
    </DataTable>
  );
}

export interface PlanProgressSubmitInput {
  actual_progress_percent: number;
  actual_start_date?: string;
  actual_end_date?: string;
  comment?: string;
}

export function PlanProgressDrawer({
  plan,
  saving,
  onClose,
  onSubmit
}: {
  plan: EngineeringPlan;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: PlanProgressSubmitInput) => Promise<void>;
}) {
  const [form, setForm] = useState({
    actualProgressPercent: String(plan.actualProgressPercent ?? 0),
    actualStartDate: formatDate(plan.actualStartDate) === "-" ? "" : formatDate(plan.actualStartDate),
    actualEndDate: formatDate(plan.actualEndDate) === "-" ? "" : formatDate(plan.actualEndDate),
    comment: ""
  });
  const validationMessage = useMemo(() => {
    return validatePlanProgress(form.actualProgressPercent) || validateActualDateRange(form.actualStartDate, form.actualEndDate);
  }, [form]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) return;
    await onSubmit({
      actual_progress_percent: Number(form.actualProgressPercent),
      actual_start_date: emptyToUndefined(form.actualStartDate),
      actual_end_date: emptyToUndefined(form.actualEndDate),
      comment: emptyToUndefined(form.comment)
    });
  }

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="工程计划进度"
        title={plan.planName}
        description="提交后由后端计划 API 计算状态、延期与事件。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={(event) => void submit(event)}>
        <label className={styles.formField}>
          <span>实际进度<em>*</em></span>
          <input
            type="number"
            min="0"
            max="100"
            value={form.actualProgressPercent}
            onChange={(event) => setForm((current) => ({ ...current, actualProgressPercent: event.target.value }))}
          />
        </label>
        <label className={styles.formField}>
          <span>实际开始日期</span>
          <input
            type="date"
            value={form.actualStartDate}
            onChange={(event) => setForm((current) => ({ ...current, actualStartDate: event.target.value }))}
          />
        </label>
        <label className={styles.formField}>
          <span>实际结束日期</span>
          <input
            type="date"
            value={form.actualEndDate}
            onChange={(event) => setForm((current) => ({ ...current, actualEndDate: event.target.value }))}
          />
        </label>
        <label className={styles.formField}>
          <span>备注</span>
          <textarea value={form.comment} rows={4} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} />
        </label>
        {Number(form.actualProgressPercent) === 100 ? (
          <p className={styles.scopeHint}>进度为 100% 时，后端会按计划规则返回最终状态；如需显式状态动作，可继续使用“更新状态”。</p>
        ) : null}
        {validationMessage ? <MessageLine message={validationMessage} /> : null}
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={saving || Boolean(validationMessage)}>
            {saving ? "提交中..." : "更新进度"}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

export interface PlanStatusSubmitInput {
  status: EngineeringPlanStatus;
  reason: string;
  comment?: string;
}

export function PlanStatusDrawer({
  plan,
  saving,
  onClose,
  onSubmit
}: {
  plan: EngineeringPlan;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: PlanStatusSubmitInput) => Promise<void>;
}) {
  const [form, setForm] = useState({
    status: plan.status,
    reason: "",
    comment: ""
  });
  const validationMessage = form.reason.trim() ? "" : "请填写状态更新原因";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) return;
    await onSubmit({
      status: form.status,
      reason: form.reason.trim(),
      comment: emptyToUndefined(form.comment)
    });
  }

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="工程计划状态"
        title={plan.planName}
        description="状态更新由后端 API 处理，前端不直接修改数据库状态。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={(event) => void submit(event)}>
        <label className={styles.formField}>
          <span>目标状态</span>
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EngineeringPlanStatus }))}>
            {engineeringPlanStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {form.status === "COMPLETED" ? (
          <p className={styles.scopeHint}>完成状态会由后端自动将实际进度置为 100%，页面以接口返回结果为准。</p>
        ) : null}
        <label className={styles.formField}>
          <span>原因<em>*</em></span>
          <input value={form.reason} required onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
        </label>
        <label className={styles.formField}>
          <span>备注</span>
          <textarea value={form.comment} rows={4} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} />
        </label>
        {validationMessage ? <MessageLine message={validationMessage} /> : null}
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={saving || Boolean(validationMessage)}>
            {saving ? "提交中..." : "更新状态"}
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
