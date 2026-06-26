"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringAcceptancesApi } from "../../../../lib/engineering-acceptances-api";
import { engineeringAcceptanceTypeOptions } from "../../../../lib/engineering-acceptances-display";
import { ENGINEERING_ACCEPTANCE_PERMISSIONS, hasEngineeringAcceptancePermission } from "../../../../lib/engineering-acceptances-permissions";
import type {
  CreateEngineeringAcceptanceInput,
  EngineeringAcceptance,
  EngineeringAcceptanceType,
  UpdateEngineeringAcceptanceInput
} from "../../../../lib/engineering-acceptances-types";
import { isAcceptanceEditable, validateAcceptanceName } from "../../../../lib/engineering-acceptances-utils";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import type { EngineeringPlan } from "../../../../lib/engineering-plans-types";
import { engineeringRiskLevelOptions } from "../../../../lib/engineering-projects-display";
import type { EngineeringRiskLevel } from "../../../../lib/engineering-projects-types";
import { AcceptanceStatusPill, AcceptanceTypePill, ForbiddenEngineeringAcceptance, MessageLine, formatDate } from "./EngineeringAcceptanceShared";
import styles from "../../projects/engineering-projects.module.css";

interface AcceptanceFormState {
  projectId: string;
  planId: string;
  acceptanceName: string;
  acceptanceType: EngineeringAcceptanceType;
  plannedAcceptanceDate: string;
  actualAcceptanceDate: string;
  riskLevel: EngineeringRiskLevel;
  description: string;
  acceptanceScope: string;
  acceptanceCriteria: string;
  resultSummary: string;
  responsibleUserId: string;
  acceptanceOrgId: string;
  contractorOrgId: string;
  supervisorOrgId: string;
  locationText: string;
  buildingId: string;
  floorId: string;
  spaceId: string;
}

const defaultForm: AcceptanceFormState = {
  projectId: "",
  planId: "",
  acceptanceName: "",
  acceptanceType: "STAGE",
  plannedAcceptanceDate: new Date().toISOString().slice(0, 10),
  actualAcceptanceDate: "",
  riskLevel: "MEDIUM",
  description: "",
  acceptanceScope: "",
  acceptanceCriteria: "",
  resultSummary: "",
  responsibleUserId: "",
  acceptanceOrgId: "",
  contractorOrgId: "",
  supervisorOrgId: "",
  locationText: "",
  buildingId: "",
  floorId: "",
  spaceId: ""
};

export function EngineeringAcceptanceFormClient({ acceptanceId }: { acceptanceId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const editing = Boolean(acceptanceId);
  const canSubmit = hasEngineeringAcceptancePermission(authUser, editing ? ENGINEERING_ACCEPTANCE_PERMISSIONS.UPDATE : ENGINEERING_ACCEPTANCE_PERMISSIONS.CREATE);
  const lockedProjectId = !editing ? (searchParams.get("projectId") ?? searchParams.get("project_id") ?? "") : "";
  const [form, setForm] = useState<AcceptanceFormState>({ ...defaultForm, projectId: lockedProjectId });
  const [acceptance, setAcceptance] = useState<EngineeringAcceptance | null>(null);
  const [projectPlans, setProjectPlans] = useState<EngineeringPlan[]>([]);
  const [loading, setLoading] = useState(Boolean(acceptanceId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const title = editing ? "编辑工程验收" : "新建工程验收";

  const loadAcceptance = useCallback(async () => {
    if (!acceptanceId) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringAcceptancesApi.getAcceptance(acceptanceId, getAccessToken());
      setAcceptance(detail);
      setForm(fromAcceptance(detail));
      if (!isAcceptanceEditable(detail.acceptanceStatus)) {
        setMessage("当前验收状态不允许编辑，请返回详情页查看。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程验收失败");
    } finally {
      setLoading(false);
    }
  }, [acceptanceId]);

  useEffect(() => {
    void loadAcceptance();
  }, [loadAcceptance]);

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
  const statusBlocksEdit = editing && acceptance && !isAcceptanceEditable(acceptance.acceptanceStatus);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (statusBlocksEdit) {
      setMessage("当前验收状态不允许编辑，请返回详情页查看。");
      return;
    }
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    setSaving(true);
    try {
      const saved = editing && acceptanceId
        ? await engineeringAcceptancesApi.updateAcceptance(acceptanceId, toUpdateInput(form), getAccessToken())
        : await engineeringAcceptancesApi.createAcceptance(toCreateInput(form), getAccessToken());
      router.push(`/engineering/acceptances/${saved.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存工程验收失败");
    } finally {
      setSaving(false);
    }
  }

  if (!canSubmit) return <ForbiddenEngineeringAcceptance />;

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>{title}</strong>
          <span>{editing ? `${acceptance?.acceptanceCode ?? ""} · ${acceptance?.acceptanceName ?? "加载中..."}` : "登记隐蔽、阶段、专项、竣工和移交预验收"}</span>
        </div>
        <Link className="secondary-button" href={acceptanceId ? `/engineering/acceptances/${acceptanceId}` : "/engineering/acceptances"}>
          <ArrowLeft size={16} />
          返回
        </Link>
      </header>

      {acceptance ? (
        <Card>
          <div className={styles.projectSummaryStrip}>
            <span>{acceptance.acceptanceCode}</span>
            <strong>{acceptance.acceptanceName}</strong>
            <AcceptanceStatusPill status={acceptance.acceptanceStatus} />
            <AcceptanceTypePill type={acceptance.acceptanceType} />
          </div>
        </Card>
      ) : null}

      <Card>
        <form className={styles.projectForm} onSubmit={(event) => void submit(event)}>
          <section className={styles.formSection}>
            <h2>基础信息</h2>
            <div className={styles.formGrid}>
              <TextField label="项目 ID" value={form.projectId} required readOnly={editing || Boolean(lockedProjectId)} onChange={(value) => setFormValue("projectId", value)} />
              <PlanSelect value={form.planId} plans={projectPlans} onChange={(value) => setFormValue("planId", value)} />
              <TextField label="验收名称" value={form.acceptanceName} required onChange={(value) => setFormValue("acceptanceName", value)} />
              <SelectField label="验收类型" value={form.acceptanceType} options={engineeringAcceptanceTypeOptions} onChange={(value) => setFormValue("acceptanceType", value as EngineeringAcceptanceType)} />
              <TextField label="计划验收日期" type="date" value={form.plannedAcceptanceDate} required onChange={(value) => setFormValue("plannedAcceptanceDate", value)} />
              <TextField label="实际验收日期" type="date" value={form.actualAcceptanceDate} onChange={(value) => setFormValue("actualAcceptanceDate", value)} />
              <SelectField label="风险等级" value={form.riskLevel} options={engineeringRiskLevelOptions} onChange={(value) => setFormValue("riskLevel", value as EngineeringRiskLevel)} />
              <TextField label="责任人 ID" value={form.responsibleUserId} onChange={(value) => setFormValue("responsibleUserId", value)} />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>验收范围与标准</h2>
            <TextAreaField label="验收描述" value={form.description} onChange={(value) => setFormValue("description", value)} />
            <TextAreaField label="验收范围" value={form.acceptanceScope} onChange={(value) => setFormValue("acceptanceScope", value)} />
            <TextAreaField label="验收标准" value={form.acceptanceCriteria} onChange={(value) => setFormValue("acceptanceCriteria", value)} />
            <TextAreaField label="结果摘要" value={form.resultSummary} onChange={(value) => setFormValue("resultSummary", value)} />
          </section>

          <section className={styles.formSection}>
            <h2>组织与位置</h2>
            <div className={styles.formGrid}>
              <TextField label="验收组织 ID" value={form.acceptanceOrgId} onChange={(value) => setFormValue("acceptanceOrgId", value)} />
              <TextField label="施工单位组织 ID" value={form.contractorOrgId} onChange={(value) => setFormValue("contractorOrgId", value)} />
              <TextField label="监理单位组织 ID" value={form.supervisorOrgId} onChange={(value) => setFormValue("supervisorOrgId", value)} />
              <TextField label="位置描述" value={form.locationText} onChange={(value) => setFormValue("locationText", value)} />
              <TextField label="建筑 ID" value={form.buildingId} onChange={(value) => setFormValue("buildingId", value)} />
              <TextField label="楼层 ID" value={form.floorId} onChange={(value) => setFormValue("floorId", value)} />
              <TextField label="空间 ID" value={form.spaceId} onChange={(value) => setFormValue("spaceId", value)} />
            </div>
            <div className={styles.scopeHint}>附件上传预留：本阶段不接真实附件，后续 Task 025 统一接 EngineeringAttachment。</div>
          </section>

          <div className={styles.formFooter}>
            <Link className="secondary-button" href={acceptanceId ? `/engineering/acceptances/${acceptanceId}` : "/engineering/acceptances"}>取消</Link>
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

  function setFormValue<K extends keyof AcceptanceFormState>(key: K, value: AcceptanceFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function fromAcceptance(acceptance: EngineeringAcceptance): AcceptanceFormState {
  return {
    projectId: acceptance.projectId,
    planId: acceptance.planId ?? "",
    acceptanceName: acceptance.acceptanceName,
    acceptanceType: acceptance.acceptanceType,
    plannedAcceptanceDate: formatDate(acceptance.plannedAcceptanceDate) === "-" ? "" : formatDate(acceptance.plannedAcceptanceDate),
    actualAcceptanceDate: formatDate(acceptance.actualAcceptanceDate) === "-" ? "" : formatDate(acceptance.actualAcceptanceDate),
    riskLevel: acceptance.riskLevel,
    description: acceptance.description ?? "",
    acceptanceScope: acceptance.acceptanceScope ?? "",
    acceptanceCriteria: acceptance.acceptanceCriteria ?? "",
    resultSummary: acceptance.resultSummary ?? "",
    responsibleUserId: acceptance.responsibleUserId ?? "",
    acceptanceOrgId: acceptance.acceptanceOrgId ?? "",
    contractorOrgId: acceptance.contractorOrgId ?? "",
    supervisorOrgId: acceptance.supervisorOrgId ?? "",
    locationText: acceptance.locationText ?? "",
    buildingId: acceptance.buildingId ?? "",
    floorId: acceptance.floorId ?? "",
    spaceId: acceptance.spaceId ?? ""
  };
}

export function validateForm(form: AcceptanceFormState): string {
  if (!form.projectId.trim()) return "请填写项目 ID";
  if (!form.plannedAcceptanceDate) return "请选择计划验收日期";
  return validateAcceptanceName(form.acceptanceName);
}

function toCreateInput(form: AcceptanceFormState): CreateEngineeringAcceptanceInput {
  return {
    project_id: form.projectId.trim(),
    plan_id: emptyToUndefined(form.planId),
    acceptance_name: form.acceptanceName.trim(),
    acceptance_type: form.acceptanceType,
    planned_acceptance_date: form.plannedAcceptanceDate,
    risk_level: form.riskLevel,
    description: emptyToUndefined(form.description),
    acceptance_scope: emptyToUndefined(form.acceptanceScope),
    acceptance_criteria: emptyToUndefined(form.acceptanceCriteria),
    responsible_user_id: emptyToUndefined(form.responsibleUserId),
    acceptance_org_id: emptyToUndefined(form.acceptanceOrgId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    location_text: emptyToUndefined(form.locationText),
    building_id: emptyToUndefined(form.buildingId),
    floor_id: emptyToUndefined(form.floorId),
    space_id: emptyToUndefined(form.spaceId)
  };
}

function toUpdateInput(form: AcceptanceFormState): UpdateEngineeringAcceptanceInput {
  return {
    plan_id: emptyToUndefined(form.planId),
    acceptance_name: form.acceptanceName.trim(),
    acceptance_type: form.acceptanceType,
    planned_acceptance_date: form.plannedAcceptanceDate,
    actual_acceptance_date: emptyToUndefined(form.actualAcceptanceDate),
    risk_level: form.riskLevel,
    description: emptyToUndefined(form.description),
    acceptance_scope: emptyToUndefined(form.acceptanceScope),
    acceptance_criteria: emptyToUndefined(form.acceptanceCriteria),
    result_summary: emptyToUndefined(form.resultSummary),
    responsible_user_id: emptyToUndefined(form.responsibleUserId),
    acceptance_org_id: emptyToUndefined(form.acceptanceOrgId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    location_text: emptyToUndefined(form.locationText),
    building_id: emptyToUndefined(form.buildingId),
    floor_id: emptyToUndefined(form.floorId),
    space_id: emptyToUndefined(form.spaceId)
  };
}

function TextField({ label, value, onChange, required, readOnly, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  type?: "text" | "date";
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <input type={type} value={value} required={required} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField<T extends string>({ label, value, options, onChange }: {
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

function PlanSelect({ value, plans, onChange }: { value: string; plans: EngineeringPlan[]; onChange: (value: string) => void }) {
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

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}
