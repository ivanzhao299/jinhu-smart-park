"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringInspectionsApi } from "../../../../lib/engineering-inspections-api";
import { engineeringInspectionTypeOptions } from "../../../../lib/engineering-inspections-display";
import { ENGINEERING_INSPECTION_PERMISSIONS, hasEngineeringInspectionPermission } from "../../../../lib/engineering-inspections-permissions";
import type {
  CreateEngineeringInspectionInput,
  EngineeringInspection,
  EngineeringInspectionType,
  UpdateEngineeringInspectionInput
} from "../../../../lib/engineering-inspections-types";
import { isInspectionEditable, todayDateString } from "../../../../lib/engineering-inspections-utils";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import type { EngineeringPlan } from "../../../../lib/engineering-plans-types";
import { ForbiddenEngineeringInspection, InspectionStatusPill, InspectionTypePill, MessageLine, formatDate, validateInspectionFormBase } from "./EngineeringInspectionShared";
import styles from "../../projects/engineering-projects.module.css";

interface InspectionFormState {
  projectId: string;
  planId: string;
  dailyReportId: string;
  inspectionTitle: string;
  inspectionType: EngineeringInspectionType;
  inspectionDate: string;
  inspectorUserId: string;
  inspectorOrgId: string;
  contractorOrgId: string;
  supervisorOrgId: string;
  locationText: string;
  buildingId: string;
  floorId: string;
  spaceId: string;
  summary: string;
  overallResult: string;
  issueCount: string;
  criticalIssueCount: string;
  remark: string;
}

const defaultForm: InspectionFormState = {
  projectId: "",
  planId: "",
  dailyReportId: "",
  inspectionTitle: "",
  inspectionType: "ROUTINE",
  inspectionDate: todayDateString(),
  inspectorUserId: "",
  inspectorOrgId: "",
  contractorOrgId: "",
  supervisorOrgId: "",
  locationText: "",
  buildingId: "",
  floorId: "",
  spaceId: "",
  summary: "",
  overallResult: "",
  issueCount: "0",
  criticalIssueCount: "0",
  remark: ""
};

export function EngineeringInspectionFormClient({ inspectionId }: { inspectionId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const editing = Boolean(inspectionId);
  const canSubmit = hasEngineeringInspectionPermission(authUser, editing ? ENGINEERING_INSPECTION_PERMISSIONS.UPDATE : ENGINEERING_INSPECTION_PERMISSIONS.CREATE);
  const lockedProjectId = !editing ? (searchParams.get("projectId") ?? searchParams.get("project_id") ?? "") : "";
  const [form, setForm] = useState<InspectionFormState>({ ...defaultForm, projectId: lockedProjectId });
  const [inspection, setInspection] = useState<EngineeringInspection | null>(null);
  const [projectPlans, setProjectPlans] = useState<EngineeringPlan[]>([]);
  const [loading, setLoading] = useState(Boolean(inspectionId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const validationMessage = useMemo(() => validateForm(form), [form]);
  const statusBlocksEdit = editing && inspection && !isInspectionEditable(inspection.inspectionStatus);

  const loadInspection = useCallback(async () => {
    if (!inspectionId) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringInspectionsApi.getInspection(inspectionId, getAccessToken());
      setInspection(detail);
      setForm(fromInspection(detail));
      if (!isInspectionEditable(detail.inspectionStatus)) {
        setMessage("当前巡检状态不允许编辑，请返回详情页查看。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程巡检失败");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void loadInspection();
  }, [loadInspection]);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (statusBlocksEdit) {
      setMessage("当前巡检状态不允许编辑，请返回详情页查看。");
      return;
    }
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    setSaving(true);
    try {
      const saved = editing && inspectionId
        ? await engineeringInspectionsApi.updateInspection(inspectionId, toUpdateInput(form), getAccessToken())
        : await engineeringInspectionsApi.createInspection(toCreateInput(form), getAccessToken());
      router.push(`/engineering/inspections/${saved.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存工程巡检失败");
    } finally {
      setSaving(false);
    }
  }

  if (!canSubmit) return <ForbiddenEngineeringInspection />;

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{editing ? "编辑工程巡检" : "新建工程巡检"}</strong>
          <span>{editing ? `${inspection?.inspectionCode ?? ""} · ${inspection?.inspectionTitle ?? "加载中..."}` : "记录现场质量、安全、进度、材料和隐蔽工程巡检"}</span>
        </div>
        <Link className="secondary-button" href={inspectionId ? `/engineering/inspections/${inspectionId}` : "/engineering/inspections"}>
          <ArrowLeft size={16} />
          返回
        </Link>
      </header>

      {inspection ? (
        <Card>
          <div className={styles.projectSummaryStrip}>
            <span>{inspection.inspectionCode}</span>
            <strong>{inspection.inspectionTitle}</strong>
            <InspectionStatusPill status={inspection.inspectionStatus} />
            <InspectionTypePill type={inspection.inspectionType} />
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
              <TextField label="施工日报 ID" value={form.dailyReportId} onChange={(value) => setFormValue("dailyReportId", value)} />
              <TextField label="巡检标题" value={form.inspectionTitle} required onChange={(value) => setFormValue("inspectionTitle", value)} />
              <SelectField label="巡检类型" value={form.inspectionType} options={engineeringInspectionTypeOptions} onChange={(value) => setFormValue("inspectionType", value as EngineeringInspectionType)} />
              <TextField label="巡检日期" type="date" value={form.inspectionDate} required onChange={(value) => setFormValue("inspectionDate", value)} />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>人员与位置</h2>
            <div className={styles.formGrid}>
              <TextField label="巡检人 ID" value={form.inspectorUserId} onChange={(value) => setFormValue("inspectorUserId", value)} />
              <TextField label="巡检组织 ID" value={form.inspectorOrgId} onChange={(value) => setFormValue("inspectorOrgId", value)} />
              <TextField label="施工单位组织 ID" value={form.contractorOrgId} onChange={(value) => setFormValue("contractorOrgId", value)} />
              <TextField label="监理单位组织 ID" value={form.supervisorOrgId} onChange={(value) => setFormValue("supervisorOrgId", value)} />
              <TextField label="位置描述" value={form.locationText} onChange={(value) => setFormValue("locationText", value)} />
              <TextField label="建筑 ID" value={form.buildingId} onChange={(value) => setFormValue("buildingId", value)} />
              <TextField label="楼层 ID" value={form.floorId} onChange={(value) => setFormValue("floorId", value)} />
              <TextField label="空间 ID" value={form.spaceId} onChange={(value) => setFormValue("spaceId", value)} />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>巡检结论</h2>
            <div className={styles.formGrid}>
              <TextField label="问题数量" type="number" value={form.issueCount} min="0" onChange={(value) => setFormValue("issueCount", value)} />
              <TextField label="重大问题数量" type="number" value={form.criticalIssueCount} min="0" onChange={(value) => setFormValue("criticalIssueCount", value)} />
            </div>
            <TextAreaField label="巡检摘要" value={form.summary} onChange={(value) => setFormValue("summary", value)} />
            <TextAreaField label="综合结论" value={form.overallResult} onChange={(value) => setFormValue("overallResult", value)} />
            <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value)} />
            <div className={styles.scopeHint}>附件上传预留：本阶段不接真实附件，后续 Task 025 统一接 EngineeringAttachment。</div>
          </section>

          <div className={styles.formFooter}>
            <Link className="secondary-button" href={inspectionId ? `/engineering/inspections/${inspectionId}` : "/engineering/inspections"}>取消</Link>
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

  function setFormValue<K extends keyof InspectionFormState>(key: K, value: InspectionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function fromInspection(inspection: EngineeringInspection): InspectionFormState {
  return {
    projectId: inspection.projectId,
    planId: inspection.planId ?? "",
    dailyReportId: inspection.dailyReportId ?? "",
    inspectionTitle: inspection.inspectionTitle,
    inspectionType: inspection.inspectionType,
    inspectionDate: formatDate(inspection.inspectionDate) === "-" ? "" : formatDate(inspection.inspectionDate),
    inspectorUserId: inspection.inspectorUserId ?? "",
    inspectorOrgId: inspection.inspectorOrgId ?? "",
    contractorOrgId: inspection.contractorOrgId ?? "",
    supervisorOrgId: inspection.supervisorOrgId ?? "",
    locationText: inspection.locationText ?? "",
    buildingId: inspection.buildingId ?? "",
    floorId: inspection.floorId ?? "",
    spaceId: inspection.spaceId ?? "",
    summary: inspection.summary ?? "",
    overallResult: inspection.overallResult ?? "",
    issueCount: String(inspection.issueCount ?? 0),
    criticalIssueCount: String(inspection.criticalIssueCount ?? 0),
    remark: inspection.remark ?? ""
  };
}

function validateForm(form: InspectionFormState): string {
  if (!form.projectId.trim()) return "请填写项目 ID";
  if (!form.inspectionDate) return "请选择巡检日期";
  return validateInspectionFormBase({ title: form.inspectionTitle, issueCount: form.issueCount, criticalIssueCount: form.criticalIssueCount });
}

function toCreateInput(form: InspectionFormState): CreateEngineeringInspectionInput {
  return {
    project_id: form.projectId.trim(),
    plan_id: emptyToUndefined(form.planId),
    daily_report_id: emptyToUndefined(form.dailyReportId),
    inspection_title: form.inspectionTitle.trim(),
    inspection_type: form.inspectionType,
    inspection_date: form.inspectionDate,
    inspector_user_id: emptyToUndefined(form.inspectorUserId),
    inspector_org_id: emptyToUndefined(form.inspectorOrgId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    location_text: emptyToUndefined(form.locationText),
    building_id: emptyToUndefined(form.buildingId),
    floor_id: emptyToUndefined(form.floorId),
    space_id: emptyToUndefined(form.spaceId),
    summary: emptyToUndefined(form.summary),
    overall_result: emptyToUndefined(form.overallResult),
    issue_count: optionalNumber(form.issueCount),
    critical_issue_count: optionalNumber(form.criticalIssueCount),
    remark: emptyToUndefined(form.remark)
  };
}

function toUpdateInput(form: InspectionFormState): UpdateEngineeringInspectionInput {
  return {
    plan_id: emptyToUndefined(form.planId),
    daily_report_id: emptyToUndefined(form.dailyReportId),
    inspection_title: form.inspectionTitle.trim(),
    inspection_type: form.inspectionType,
    inspection_date: form.inspectionDate,
    inspector_user_id: emptyToUndefined(form.inspectorUserId),
    inspector_org_id: emptyToUndefined(form.inspectorOrgId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    location_text: emptyToUndefined(form.locationText),
    building_id: emptyToUndefined(form.buildingId),
    floor_id: emptyToUndefined(form.floorId),
    space_id: emptyToUndefined(form.spaceId),
    summary: emptyToUndefined(form.summary),
    overall_result: emptyToUndefined(form.overallResult),
    issue_count: optionalNumber(form.issueCount),
    critical_issue_count: optionalNumber(form.criticalIssueCount),
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

function TextField({ label, value, onChange, required, readOnly, type = "text", min }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  type?: "text" | "date" | "number";
  min?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <input type={type} value={value} required={required} readOnly={readOnly} min={min} onChange={(event) => onChange(event.target.value)} />
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
