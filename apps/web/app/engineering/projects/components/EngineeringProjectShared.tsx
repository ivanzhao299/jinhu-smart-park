"use client";

import { StatusPill } from "@jinhu/ui";
import type { ReactNode } from "react";
import {
  engineeringProjectLevelLabels,
  engineeringProjectStatusLabels,
  engineeringProjectTypeLabels,
  engineeringRiskLevelLabels,
  projectRiskVariant,
  projectStatusVariant
} from "../../../../lib/engineering-projects-display";
import type { EngineeringProject, EngineeringProjectLevel, EngineeringProjectStatus, EngineeringProjectType, EngineeringRiskLevel } from "../../../../lib/engineering-projects-types";
import styles from "../engineering-projects.module.css";

export function ProjectStatusPill({ status }: { status: EngineeringProjectStatus }) {
  return <StatusPill variant={projectStatusVariant(status)}>{engineeringProjectStatusLabels[status] ?? status}</StatusPill>;
}

export function RiskPill({ risk }: { risk: EngineeringRiskLevel }) {
  return <StatusPill variant={projectRiskVariant(risk)}>{engineeringRiskLevelLabels[risk] ?? risk}</StatusPill>;
}

export function LevelPill({ level }: { level: EngineeringProjectLevel }) {
  const variant = level === "MAJOR" ? "danger" : level === "IMPORTANT" ? "warning" : "muted";
  return <StatusPill variant={variant}>{engineeringProjectLevelLabels[level] ?? level}</StatusPill>;
}

export function ProjectTypePill({ type }: { type: EngineeringProjectType }) {
  return <StatusPill variant="info">{engineeringProjectTypeLabels[type] ?? type}</StatusPill>;
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

export function formatMoney(value?: string | number | null): string {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue) || numberValue === 0) return value ? String(value) : "-";
  return numberValue.toLocaleString("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 });
}

export function formatPercent(value?: number | null): string {
  return `${Number(value ?? 0)}%`;
}

export function projectTitle(project: EngineeringProject | null): string {
  return project ? `${project.projectCode} · ${project.projectName}` : "工程项目";
}

export function MessageLine({ message }: { message: string }) {
  if (!message) return null;
  return <p className={styles.message}>{message}</p>;
}

export function ForbiddenEngineeringProject() {
  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <div className={styles.forbiddenBox}>
        <h1>403</h1>
        <p>当前账号没有工程项目访问权限。</p>
      </div>
    </main>
  );
}
