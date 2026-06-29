"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import { engineeringPlanLevelOptions, engineeringPlanTypeOptions } from "../../../../lib/engineering-plans-display";
import { ENGINEERING_PLAN_PERMISSIONS, hasEngineeringPlanPermission } from "../../../../lib/engineering-plans-permissions";
import type {
  CreateEngineeringPlanInput,
  EngineeringPlan,
  EngineeringPlanLevel,
  EngineeringPlanType,
  UpdateEngineeringPlanInput
} from "../../../../lib/engineering-plans-types";
import { validateActualDateRange, validatePlanDateRange, validatePlanProgress, validatePlanWeight } from "../../../../lib/engineering-plans-utils";
import { engineeringRiskLevelOptions } from "../../../../lib/engineering-projects-display";
import type { EngineeringRiskLevel } from "../../../../lib/engineering-projects-types";
import { ForbiddenEngineeringPlan, MessageLine, PlanStatusPill, formatDate } from "./EngineeringPlanShared";
import styles from "../../projects/engineering-projects.module.css";

interface PlanFormState {
  projectId: string;
  planName: string;
  planType: EngineeringPlanType;
  parentPlanId: string;
  planLevel: EngineeringPlanLevel;
  description: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  plannedProgressPercent: string;
  actualProgressPercent: string;
  weight: string;
  ownerUserId: string;
  ownerOrgId: string;
  contractorOrgId: string;
  riskLevel: EngineeringRiskLevel;
  sortOrder: string;
  remark: string;
}

const defaultForm: PlanFormState = {
  projectId: "",
  planName: "",
  planType: "MASTER",
  parentPlanId: "",
  planLevel: "L1",
  description: "",
  plannedStartDate: "",
  plannedEndDate: "",
  actualStartDate: "",
  actualEndDate: "",
  plannedProgressPercent: "0",
  actualProgressPercent: "0",
  weight: "",
  ownerUserId: "",
  ownerOrgId: "",
  contractorOrgId: "",
  riskLevel: "MEDIUM",
  sortOrder: "0",
  remark: ""
};

export function EngineeringPlanFormClient({ planId }: { planId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const editing = Boolean(planId);
  const canSubmit = hasEngineeringPlanPermission(authUser, editing ? ENGINEERING_PLAN_PERMISSIONS.UPDATE : ENGINEERING_PLAN_PERMISSIONS.CREATE);
  const lockedProjectId = !editing ? (searchParams.get("projectId") ?? searchParams.get("project_id") ?? "") : "";
  const [form, setForm] = useState<PlanFormState>({ ...defaultForm, projectId: lockedProjectId });
  const [plan, setPlan] = useState<EngineeringPlan | null>(null);
  const [projectPlans, setProjectPlans] = useState<EngineeringPlan[]>([]);
  const [loading, setLoading] = useState(Boolean(planId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const title = editing ? "编辑工程计划" : "新建工程计划";

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringPlansApi.getPlan(planId, getAccessToken());
      setPlan(detail);
      setForm(fromPlan(detail));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程计划失败");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

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

  const validationMessage = useMemo(() => validateForm(form, editing), [form, editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    setSaving(true);
    try {
      const saved = editing && planId
        ? await engineeringPlansApi.updatePlan(planId, toUpdateInput(form), getAccessToken())
        : await engineeringPlansApi.createPlan(toCreateInput(form), getAccessToken());
      router.push(`/engineering/plans/${saved.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存工程计划失败");
    } finally {
      setSaving(false);
    }
  }

  if (!canSubmit) {
    return <ForbiddenEngineeringPlan />;
  }

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{title}</strong>
          <span>{editing ? `${plan?.planCode ?? ""} · ${plan?.planName ?? "加载中..."}` : "把工程项目拆解为可跟踪的计划任务"}</span>
        </div>
        <Link className="secondary-button" href={planId ? `/engineering/plans/${planId}` : "/engineering/plans"}>
          <ArrowLeft size={16} />
          返回
        </Link>
      </header>

      {plan ? (
        <Card>
          <div className={styles.projectSummaryStrip}>
            <span>{plan.planCode}</span>
            <strong>{plan.planName}</strong>
            <PlanStatusPill status={plan.status} />
            <span>项目：{plan.projectId}</span>
          </div>
        </Card>
      ) : null}

      <Card>
        <form className={styles.projectForm} onSubmit={(event) => void submit(event)}>
          <section className={styles.formSection}>
            <h2>基础信息</h2>
            <div className={styles.scopeHint}>计划必须归属一个工程项目。项目 ID 来自工程项目详情入口时会自动带入，后端仍会校验项目访问权限。</div>
            <div className={styles.formGrid}>
              <TextField label="项目 ID" value={form.projectId} required readOnly={editing || Boolean(lockedProjectId)} onChange={(value) => setFormValue("projectId", value)} />
              <TextField label="计划名称" value={form.planName} required onChange={(value) => setFormValue("planName", value)} />
              <SelectField label="计划类型" value={form.planType} options={engineeringPlanTypeOptions} onChange={(value) => setFormValue("planType", value as EngineeringPlanType)} />
              <SelectField label="计划层级" value={form.planLevel} options={engineeringPlanLevelOptions} onChange={(value) => setFormValue("planLevel", value as EngineeringPlanLevel)} />
              <ParentPlanSelect value={form.parentPlanId} plans={projectPlans} currentPlanId={planId} onChange={(value) => setFormValue("parentPlanId", value)} />
              <SelectField label="风险等级" value={form.riskLevel} options={engineeringRiskLevelOptions} onChange={(value) => setFormValue("riskLevel", value as EngineeringRiskLevel)} />
            </div>
            <TextAreaField label="计划描述" value={form.description} onChange={(value) => setFormValue("description", value)} />
          </section>

          <section className={styles.formSection}>
            <h2>计划与进度</h2>
            <div className={styles.formGrid}>
              <TextField label="计划开始日期" type="date" value={form.plannedStartDate} onChange={(value) => setFormValue("plannedStartDate", value)} />
              <TextField label="计划结束日期" type="date" value={form.plannedEndDate} onChange={(value) => setFormValue("plannedEndDate", value)} />
              {editing ? <TextField label="实际开始日期" type="date" value={form.actualStartDate} onChange={(value) => setFormValue("actualStartDate", value)} /> : null}
              {editing ? <TextField label="实际结束日期" type="date" value={form.actualEndDate} onChange={(value) => setFormValue("actualEndDate", value)} /> : null}
              <TextField label="计划进度" type="number" value={form.plannedProgressPercent} min="0" max="100" onChange={(value) => setFormValue("plannedProgressPercent", value)} />
              {editing ? <TextField label="实际进度" type="number" value={form.actualProgressPercent} min="0" max="100" onChange={(value) => setFormValue("actualProgressPercent", value)} /> : null}
              <TextField label="权重" type="number" value={form.weight} min="0" onChange={(value) => setFormValue("weight", value)} />
              <TextField label="排序" type="number" value={form.sortOrder} min="0" onChange={(value) => setFormValue("sortOrder", value)} />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>责任信息</h2>
            <div className={styles.formGrid}>
              <TextField label="责任人 ID" value={form.ownerUserId} onChange={(value) => setFormValue("ownerUserId", value)} />
              <TextField label="责任单位 ID" value={form.ownerOrgId} onChange={(value) => setFormValue("ownerOrgId", value)} />
              <TextField label="施工单位组织 ID" value={form.contractorOrgId} onChange={(value) => setFormValue("contractorOrgId", value)} />
            </div>
            <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value)} />
          </section>

          <div className={styles.formFooter}>
            <Link className="secondary-button" href={planId ? `/engineering/plans/${planId}` : "/engineering/plans"}>取消</Link>
            <button className="primary-button" type="submit" disabled={saving || loading}>
              <Save size={16} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
          <MessageLine message={message} />
        </form>
      </Card>
    </main>
  );

  function setFormValue<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function fromPlan(plan: EngineeringPlan): PlanFormState {
  return {
    projectId: plan.projectId,
    planName: plan.planName,
    planType: plan.planType,
    parentPlanId: plan.parentPlanId ?? "",
    planLevel: plan.planLevel,
    description: plan.description ?? "",
    plannedStartDate: formatDate(plan.plannedStartDate) === "-" ? "" : formatDate(plan.plannedStartDate),
    plannedEndDate: formatDate(plan.plannedEndDate) === "-" ? "" : formatDate(plan.plannedEndDate),
    actualStartDate: formatDate(plan.actualStartDate) === "-" ? "" : formatDate(plan.actualStartDate),
    actualEndDate: formatDate(plan.actualEndDate) === "-" ? "" : formatDate(plan.actualEndDate),
    plannedProgressPercent: String(plan.plannedProgressPercent ?? 0),
    actualProgressPercent: String(plan.actualProgressPercent ?? 0),
    weight: plan.weight ?? "",
    ownerUserId: plan.ownerUserId ?? "",
    ownerOrgId: plan.ownerOrgId ?? "",
    contractorOrgId: plan.contractorOrgId ?? "",
    riskLevel: plan.riskLevel,
    sortOrder: String(plan.sortOrder ?? 0),
    remark: plan.remark ?? ""
  };
}

export function validateForm(form: PlanFormState, editing: boolean): string {
  if (!form.projectId.trim()) return "请填写项目 ID";
  if (!form.planName.trim()) return "请填写计划名称";
  return (
    validatePlanDateRange(form.plannedStartDate, form.plannedEndDate) ||
    validateActualDateRange(form.actualStartDate, form.actualEndDate) ||
    validatePlanProgress(form.plannedProgressPercent) ||
    (editing ? validatePlanProgress(form.actualProgressPercent) : "") ||
    validatePlanWeight(form.weight)
  );
}

function toCreateInput(form: PlanFormState): CreateEngineeringPlanInput {
  return {
    project_id: form.projectId.trim(),
    plan_name: form.planName.trim(),
    plan_type: form.planType,
    parent_plan_id: emptyToUndefined(form.parentPlanId),
    plan_level: form.planLevel,
    description: emptyToUndefined(form.description),
    planned_start_date: emptyToUndefined(form.plannedStartDate),
    planned_end_date: emptyToUndefined(form.plannedEndDate),
    planned_progress_percent: optionalNumber(form.plannedProgressPercent),
    weight: optionalNumber(form.weight),
    owner_user_id: emptyToUndefined(form.ownerUserId),
    owner_org_id: emptyToUndefined(form.ownerOrgId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    risk_level: form.riskLevel,
    sort_order: optionalNumber(form.sortOrder),
    remark: emptyToUndefined(form.remark)
  };
}

function toUpdateInput(form: PlanFormState): UpdateEngineeringPlanInput {
  return {
    plan_name: form.planName.trim(),
    plan_type: form.planType,
    parent_plan_id: emptyToUndefined(form.parentPlanId),
    plan_level: form.planLevel,
    description: emptyToUndefined(form.description),
    planned_start_date: emptyToUndefined(form.plannedStartDate),
    planned_end_date: emptyToUndefined(form.plannedEndDate),
    actual_start_date: emptyToUndefined(form.actualStartDate),
    actual_end_date: emptyToUndefined(form.actualEndDate),
    planned_progress_percent: optionalNumber(form.plannedProgressPercent),
    actual_progress_percent: optionalNumber(form.actualProgressPercent),
    weight: optionalNumber(form.weight),
    owner_user_id: emptyToUndefined(form.ownerUserId),
    owner_org_id: emptyToUndefined(form.ownerOrgId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    risk_level: form.riskLevel,
    sort_order: optionalNumber(form.sortOrder),
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
  type = "text",
  min,
  max
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
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

function ParentPlanSelect({
  value,
  plans,
  currentPlanId,
  onChange
}: {
  value: string;
  plans: EngineeringPlan[];
  currentPlanId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.formField}>
      <span>父计划</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">无父计划</option>
        {plans.filter((item) => item.id !== currentPlanId).map((item) => (
          <option key={item.id} value={item.id}>{item.planCode} · {item.planName}</option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <textarea value={value} rows={4} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
