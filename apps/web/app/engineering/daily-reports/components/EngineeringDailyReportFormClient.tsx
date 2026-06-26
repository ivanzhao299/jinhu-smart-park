"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringDailyReportsApi } from "../../../../lib/engineering-daily-reports-api";
import { engineeringWeatherTypeOptions } from "../../../../lib/engineering-daily-reports-display";
import { ENGINEERING_DAILY_REPORT_PERMISSIONS, hasEngineeringDailyReportPermission } from "../../../../lib/engineering-daily-reports-permissions";
import type {
  CreateEngineeringDailyReportInput,
  EngineeringDailyReport,
  EngineeringWeatherType,
  UpdateEngineeringDailyReportInput
} from "../../../../lib/engineering-daily-reports-types";
import { todayDateString } from "../../../../lib/engineering-daily-reports-utils";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import type { EngineeringPlan } from "../../../../lib/engineering-plans-types";
import {
  DailyReportStatusPill,
  ForbiddenEngineeringDailyReport,
  MessageLine,
  WeatherPill,
  formatDate,
  validateDailyReportFormBase
} from "./EngineeringDailyReportShared";
import styles from "../../projects/engineering-projects.module.css";

interface DailyReportFormState {
  projectId: string;
  planId: string;
  reportDate: string;
  weather: EngineeringWeatherType;
  temperature: string;
  workContent: string;
  completedWork: string;
  unfinishedWork: string;
  tomorrowPlan: string;
  workerCount: string;
  managerCount: string;
  machineSummary: string;
  materialSummary: string;
  qualitySummary: string;
  safetySummary: string;
  issueSummary: string;
  progressPercent: string;
  contractorOrgId: string;
  supervisorOrgId: string;
  remark: string;
}

const defaultForm: DailyReportFormState = {
  projectId: "",
  planId: "",
  reportDate: todayDateString(),
  weather: "SUNNY",
  temperature: "",
  workContent: "",
  completedWork: "",
  unfinishedWork: "",
  tomorrowPlan: "",
  workerCount: "0",
  managerCount: "0",
  machineSummary: "",
  materialSummary: "",
  qualitySummary: "",
  safetySummary: "",
  issueSummary: "",
  progressPercent: "0",
  contractorOrgId: "",
  supervisorOrgId: "",
  remark: ""
};

export function EngineeringDailyReportFormClient({ reportId }: { reportId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const editing = Boolean(reportId);
  const canSubmit = hasEngineeringDailyReportPermission(authUser, editing ? ENGINEERING_DAILY_REPORT_PERMISSIONS.UPDATE : ENGINEERING_DAILY_REPORT_PERMISSIONS.CREATE);
  const lockedProjectId = !editing ? (searchParams.get("projectId") ?? searchParams.get("project_id") ?? "") : "";
  const [form, setForm] = useState<DailyReportFormState>({ ...defaultForm, projectId: lockedProjectId });
  const [report, setReport] = useState<EngineeringDailyReport | null>(null);
  const [projectPlans, setProjectPlans] = useState<EngineeringPlan[]>([]);
  const [loading, setLoading] = useState(Boolean(reportId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const title = editing ? "编辑施工日报" : "新建施工日报";

  const loadReport = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringDailyReportsApi.getDailyReport(reportId, getAccessToken());
      setReport(detail);
      setForm(fromReport(detail));
      if (detail.reportStatus !== "DRAFT" && detail.reportStatus !== "REJECTED") {
        setMessage("当前日报状态不允许编辑，请返回详情页查看。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载施工日报失败");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    const projectId = form.projectId.trim();
    if (!projectId) {
      setProjectPlans([]);
      return;
    }
    let active = true;
    engineeringPlansApi.getProjectPlans(projectId, getAccessToken())
      .then((items) => {
        if (active) setProjectPlans(items);
      })
      .catch(() => {
        if (active) setProjectPlans([]);
      });
    return () => {
      active = false;
    };
  }, [form.projectId]);

  const validationMessage = useMemo(() => validateForm(form), [form]);
  const statusBlocksEdit = editing && report && report.reportStatus !== "DRAFT" && report.reportStatus !== "REJECTED";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (statusBlocksEdit) {
      setMessage("当前日报状态不允许编辑，请返回详情页查看。");
      return;
    }
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    setSaving(true);
    try {
      const saved = editing && reportId
        ? await engineeringDailyReportsApi.updateDailyReport(reportId, toUpdateInput(form), getAccessToken())
        : await engineeringDailyReportsApi.createDailyReport(toCreateInput(form), getAccessToken());
      router.push(`/engineering/daily-reports/${saved.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存施工日报失败");
    } finally {
      setSaving(false);
    }
  }

  if (!canSubmit) {
    return <ForbiddenEngineeringDailyReport />;
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>{title}</strong>
          <span>{editing ? `${report?.reportCode ?? ""} · ${report?.reportDate ?? "加载中..."}` : "填写现场施工、人员、设备、材料、质量安全和问题信息"}</span>
        </div>
        <Link className="secondary-button" href={reportId ? `/engineering/daily-reports/${reportId}` : "/engineering/daily-reports"}>
          <ArrowLeft size={16} />
          返回
        </Link>
      </header>

      {report ? (
        <Card>
          <div className={styles.projectSummaryStrip}>
            <span>{report.reportCode}</span>
            <strong>{formatDate(report.reportDate)}</strong>
            <DailyReportStatusPill status={report.reportStatus} />
            <WeatherPill weather={report.weather} />
            <span>项目：{report.projectId}</span>
          </div>
        </Card>
      ) : null}

      <Card>
        <form className={styles.projectForm} onSubmit={(event) => void submit(event)}>
          <section className={styles.formSection}>
            <h2>基础信息</h2>
            <div className={styles.scopeHint}>施工日报必须归属一个工程项目。项目 ID 可从工程项目详情入口自动带入，后端仍会校验 DataScope。</div>
            <div className={styles.formGrid}>
              <TextField label="项目 ID" value={form.projectId} required readOnly={editing || Boolean(lockedProjectId)} onChange={(value) => setFormValue("projectId", value)} />
              <PlanSelect value={form.planId} plans={projectPlans} onChange={(value) => setFormValue("planId", value)} />
              <TextField label="日报日期" type="date" value={form.reportDate} required readOnly={editing} onChange={(value) => setFormValue("reportDate", value)} />
              <SelectField label="天气" value={form.weather} options={engineeringWeatherTypeOptions} onChange={(value) => setFormValue("weather", value as EngineeringWeatherType)} />
              <TextField label="温度描述" value={form.temperature} placeholder="例如：22-30℃" onChange={(value) => setFormValue("temperature", value)} />
              <TextField label="当日进度" type="number" value={form.progressPercent} min="0" max="100" onChange={(value) => setFormValue("progressPercent", value)} />
            </div>
            <TextAreaField label="今日施工内容" value={form.workContent} required onChange={(value) => setFormValue("workContent", value)} />
          </section>

          <section className={styles.formSection}>
            <h2>施工过程</h2>
            <div className={styles.formGrid}>
              <TextField label="现场工人人数" type="number" value={form.workerCount} min="0" onChange={(value) => setFormValue("workerCount", value)} />
              <TextField label="管理人员人数" type="number" value={form.managerCount} min="0" onChange={(value) => setFormValue("managerCount", value)} />
              <TextField label="施工单位组织 ID" value={form.contractorOrgId} onChange={(value) => setFormValue("contractorOrgId", value)} />
              <TextField label="监理单位组织 ID" value={form.supervisorOrgId} onChange={(value) => setFormValue("supervisorOrgId", value)} />
            </div>
            <TextAreaField label="已完成工作" value={form.completedWork} onChange={(value) => setFormValue("completedWork", value)} />
            <TextAreaField label="未完成工作" value={form.unfinishedWork} onChange={(value) => setFormValue("unfinishedWork", value)} />
            <TextAreaField label="明日计划" value={form.tomorrowPlan} onChange={(value) => setFormValue("tomorrowPlan", value)} />
          </section>

          <section className={styles.formSection}>
            <h2>现场资料</h2>
            <TextAreaField label="机械设备情况" value={form.machineSummary} onChange={(value) => setFormValue("machineSummary", value)} />
            <TextAreaField label="材料进场情况" value={form.materialSummary} onChange={(value) => setFormValue("materialSummary", value)} />
            <TextAreaField label="质量情况" value={form.qualitySummary} onChange={(value) => setFormValue("qualitySummary", value)} />
            <TextAreaField label="安全文明施工情况" value={form.safetySummary} onChange={(value) => setFormValue("safetySummary", value)} />
            <TextAreaField label="存在问题" value={form.issueSummary} onChange={(value) => setFormValue("issueSummary", value)} />
            <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value)} />
            <div className={styles.scopeHint}>附件上传预留：本阶段不接真实附件，后续 Task 025 统一接 EngineeringAttachment。</div>
          </section>

          <div className={styles.formFooter}>
            <Link className="secondary-button" href={reportId ? `/engineering/daily-reports/${reportId}` : "/engineering/daily-reports"}>取消</Link>
            <button className="primary-button" type="submit" disabled={saving || loading || Boolean(statusBlocksEdit)}>
              <Save size={16} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
          <MessageLine message={message} />
        </form>
      </Card>
    </main>
  );

  function setFormValue<K extends keyof DailyReportFormState>(key: K, value: DailyReportFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function fromReport(report: EngineeringDailyReport): DailyReportFormState {
  return {
    projectId: report.projectId,
    planId: report.planId ?? "",
    reportDate: formatDate(report.reportDate) === "-" ? "" : formatDate(report.reportDate),
    weather: report.weather,
    temperature: report.temperature ?? "",
    workContent: report.workContent ?? "",
    completedWork: report.completedWork ?? "",
    unfinishedWork: report.unfinishedWork ?? "",
    tomorrowPlan: report.tomorrowPlan ?? "",
    workerCount: String(report.workerCount ?? 0),
    managerCount: String(report.managerCount ?? 0),
    machineSummary: report.machineSummary ?? "",
    materialSummary: report.materialSummary ?? "",
    qualitySummary: report.qualitySummary ?? "",
    safetySummary: report.safetySummary ?? "",
    issueSummary: report.issueSummary ?? "",
    progressPercent: String(report.progressPercent ?? 0),
    contractorOrgId: report.contractorOrgId ?? "",
    supervisorOrgId: report.supervisorOrgId ?? "",
    remark: report.remark ?? ""
  };
}

export function validateForm(form: DailyReportFormState): string {
  if (!form.projectId.trim()) return "请填写项目 ID";
  if (!form.reportDate) return "请选择日报日期";
  return validateDailyReportFormBase({
    workContent: form.workContent,
    workerCount: form.workerCount,
    managerCount: form.managerCount,
    progressPercent: form.progressPercent
  });
}

function toCreateInput(form: DailyReportFormState): CreateEngineeringDailyReportInput {
  return {
    project_id: form.projectId.trim(),
    plan_id: emptyToUndefined(form.planId),
    report_date: form.reportDate,
    weather: form.weather,
    temperature: emptyToUndefined(form.temperature),
    work_content: form.workContent.trim(),
    completed_work: emptyToUndefined(form.completedWork),
    unfinished_work: emptyToUndefined(form.unfinishedWork),
    tomorrow_plan: emptyToUndefined(form.tomorrowPlan),
    worker_count: optionalNumber(form.workerCount),
    manager_count: optionalNumber(form.managerCount),
    machine_summary: emptyToUndefined(form.machineSummary),
    material_summary: emptyToUndefined(form.materialSummary),
    quality_summary: emptyToUndefined(form.qualitySummary),
    safety_summary: emptyToUndefined(form.safetySummary),
    issue_summary: emptyToUndefined(form.issueSummary),
    progress_percent: optionalNumber(form.progressPercent),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    remark: emptyToUndefined(form.remark)
  };
}

function toUpdateInput(form: DailyReportFormState): UpdateEngineeringDailyReportInput {
  return {
    plan_id: emptyToUndefined(form.planId),
    weather: form.weather,
    temperature: emptyToUndefined(form.temperature),
    work_content: form.workContent.trim(),
    completed_work: emptyToUndefined(form.completedWork),
    unfinished_work: emptyToUndefined(form.unfinishedWork),
    tomorrow_plan: emptyToUndefined(form.tomorrowPlan),
    worker_count: optionalNumber(form.workerCount),
    manager_count: optionalNumber(form.managerCount),
    machine_summary: emptyToUndefined(form.machineSummary),
    material_summary: emptyToUndefined(form.materialSummary),
    quality_summary: emptyToUndefined(form.qualitySummary),
    safety_summary: emptyToUndefined(form.safetySummary),
    issue_summary: emptyToUndefined(form.issueSummary),
    progress_percent: optionalNumber(form.progressPercent),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    remark: emptyToUndefined(form.remark)
  };
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  return Number(value);
}

function TextField({
  label,
  value,
  onChange,
  required,
  readOnly,
  placeholder,
  type = "text",
  min,
  max
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  type?: "text" | "date" | "number";
  min?: string;
  max?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <input
        type={type}
        value={value}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function PlanSelect({
  value,
  plans,
  onChange
}: {
  value: string;
  plans: EngineeringPlan[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.formField}>
      <span>关联计划</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">不关联计划</option>
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>{plan.planCode} · {plan.planName}</option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <textarea value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
