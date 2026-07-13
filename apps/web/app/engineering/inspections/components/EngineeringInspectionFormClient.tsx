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
import {
  displayUserName,
  emptyEngineeringProjectReferences,
  formatBuildingLabel,
  formatDailyReportLabel,
  formatFloorLabel,
  formatOrgLabel,
  formatProjectLabel,
  formatUnitLabel,
  loadEngineeringProjectReferences,
  type EngineeringProjectReferenceData
} from "../../projects/components/EngineeringProjectReferenceData";
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
  const [references, setReferences] = useState<EngineeringProjectReferenceData>(emptyEngineeringProjectReferences);
  const [loading, setLoading] = useState(Boolean(inspectionId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const validationMessage = useMemo(() => validateForm(form), [form]);
  const statusBlocksEdit = editing && inspection && !isInspectionEditable(inspection.inspectionStatus);
  const availableFloors = useMemo(
    () => references.floors.filter((item) => !form.buildingId || item.buildingId === form.buildingId),
    [references.floors, form.buildingId]
  );
  const availableUnits = useMemo(
    () => references.units.filter((item) => {
      if (form.floorId) return item.floorId === form.floorId;
      if (form.buildingId) return item.buildingId === form.buildingId;
      return true;
    }),
    [references.units, form.buildingId, form.floorId]
  );
  const availableDailyReports = useMemo(
    () => references.dailyReports.filter((item) => {
      if (!form.projectId) return false;
      if (item.projectId !== form.projectId) return false;
      if (form.planId) return item.planId === form.planId;
      return true;
    }),
    [references.dailyReports, form.planId, form.projectId]
  );

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
    void loadEngineeringProjectReferences(getAccessToken())
      .then((data) => setReferences(data))
      .catch((error: Error) => setMessage(error.message));
  }, []);

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
        <form className={styles.projectForm} data-testid="engineering-inspection-form" onSubmit={(event) => void submit(event)}>
          <section className={styles.formSection}>
            <h2>基础信息</h2>
            <div className={styles.formGrid}>
              <SelectRefField
                label="所属项目"
                testId="inspection-project"
                value={form.projectId}
                allLabel="请选择项目"
                items={references.projects.map((item) => ({ id: item.id, label: formatProjectLabel(item) }))}
                onChange={(value) => setForm((current) => ({
                  ...current,
                  projectId: value,
                  planId: current.planId && projectPlans.some((item) => item.id === current.planId && item.projectId === value) ? current.planId : "",
                  dailyReportId: current.dailyReportId && references.dailyReports.some((item) => item.id === current.dailyReportId && item.projectId === value) ? current.dailyReportId : ""
                }))}
                required
                disabled={editing || Boolean(lockedProjectId)}
              />
              <PlanSelect
                testId="inspection-plan"
                value={form.planId}
                plans={projectPlans}
                onChange={(value) => setForm((current) => ({
                  ...current,
                  planId: value,
                  dailyReportId: current.dailyReportId && references.dailyReports.some((item) => item.id === current.dailyReportId && item.planId === value) ? current.dailyReportId : ""
                }))}
              />
              <DailyReportSelect testId="inspection-daily-report" value={form.dailyReportId} reports={availableDailyReports} onChange={(value) => setFormValue("dailyReportId", value)} />
              <TextField label="巡检标题" testId="inspection-title" value={form.inspectionTitle} required onChange={(value) => setFormValue("inspectionTitle", value)} />
              <SelectField label="巡检类型" testId="inspection-type" value={form.inspectionType} options={engineeringInspectionTypeOptions} onChange={(value) => setFormValue("inspectionType", value as EngineeringInspectionType)} />
              <TextField label="巡检日期" testId="inspection-date" type="date" value={form.inspectionDate} required onChange={(value) => setFormValue("inspectionDate", value)} />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>人员与位置</h2>
            <div className={styles.formGrid}>
              <SelectRefField
                label="巡检人"
                testId="inspection-inspector-user"
                value={form.inspectorUserId}
                allLabel="暂不指定"
                items={references.users.map((item) => ({ id: item.id, label: displayUserName(item) }))}
                onChange={(value) => setFormValue("inspectorUserId", value)}
              />
              <SelectRefField
                label="巡检组织"
                testId="inspection-inspector-org"
                value={form.inspectorOrgId}
                allLabel="暂不指定"
                items={references.orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                onChange={(value) => setFormValue("inspectorOrgId", value)}
              />
              <SelectRefField
                label="施工单位"
                testId="inspection-contractor-org"
                value={form.contractorOrgId}
                allLabel="暂不指定"
                items={references.orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                onChange={(value) => setFormValue("contractorOrgId", value)}
              />
              <SelectRefField
                label="监理单位"
                testId="inspection-supervisor-org"
                value={form.supervisorOrgId}
                allLabel="暂不指定"
                items={references.orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                onChange={(value) => setFormValue("supervisorOrgId", value)}
              />
              <TextField label="位置描述" testId="inspection-location-text" value={form.locationText} onChange={(value) => setFormValue("locationText", value)} />
              <SelectRefField
                label="楼栋"
                testId="inspection-building"
                value={form.buildingId}
                allLabel="不关联楼栋"
                items={references.buildings.map((item) => ({ id: item.id, label: formatBuildingLabel(item) }))}
                onChange={(value) => setForm((current) => ({
                  ...current,
                  buildingId: value,
                  floorId: current.floorId && references.floors.some((item) => item.id === current.floorId && item.buildingId === value) ? current.floorId : "",
                  spaceId: current.spaceId && references.units.some((item) => item.id === current.spaceId && item.buildingId === value) ? current.spaceId : ""
                }))}
              />
              <SelectRefField
                label="楼层"
                testId="inspection-floor"
                value={form.floorId}
                allLabel="不关联楼层"
                items={availableFloors.map((item) => ({ id: item.id, label: formatFloorLabel(item) }))}
                onChange={(value) => setForm((current) => ({
                  ...current,
                  floorId: value,
                  spaceId: current.spaceId && references.units.some((item) => item.id === current.spaceId && item.floorId === value) ? current.spaceId : ""
                }))}
              />
              <SelectRefField
                label="空间 / 房源"
                testId="inspection-space"
                value={form.spaceId}
                allLabel="不关联空间"
                items={availableUnits.map((item) => ({ id: item.id, label: formatUnitLabel(item) }))}
                onChange={(value) => setFormValue("spaceId", value)}
              />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>巡检结论</h2>
            <div className={styles.formGrid}>
              <TextField label="问题数量" testId="inspection-issue-count" type="number" value={form.issueCount} min="0" onChange={(value) => setFormValue("issueCount", value)} />
              <TextField label="重大问题数量" testId="inspection-critical-issue-count" type="number" value={form.criticalIssueCount} min="0" onChange={(value) => setFormValue("criticalIssueCount", value)} />
            </div>
            <TextAreaField label="巡检摘要" testId="inspection-summary" value={form.summary} onChange={(value) => setFormValue("summary", value)} />
            <TextAreaField label="综合结论" testId="inspection-overall-result" value={form.overallResult} onChange={(value) => setFormValue("overallResult", value)} />
            <TextAreaField label="备注" testId="inspection-remark" value={form.remark} onChange={(value) => setFormValue("remark", value)} />
            <div className={styles.scopeHint}>附件资料统一在附件中心维护，这里先记录巡检结论、问题数量和综合判断。</div>
          </section>

          <div className={styles.formFooter}>
            <Link className="secondary-button" href={inspectionId ? `/engineering/inspections/${inspectionId}` : "/engineering/inspections"}>取消</Link>
            <button className="primary-button" data-testid="inspection-save" type="submit" disabled={saving || loading || Boolean(statusBlocksEdit)}>
              <Save size={16} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
          <MessageLine message={message} testId="engineering-inspection-message" />
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
  if (!form.projectId.trim()) return "请选择所属项目";
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

function TextField({ label, value, onChange, required, readOnly, placeholder, type = "text", min, testId }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  type?: "text" | "date" | "number";
  min?: string;
  testId?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <input data-testid={testId} type={type} value={value} required={required} readOnly={readOnly} placeholder={placeholder} min={min} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId?: string }) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <textarea data-testid={testId} rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField<T extends string>({ label, value, options, onChange, testId }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function SelectRefField({
  label,
  value,
  items,
  allLabel,
  onChange,
  required,
  disabled,
  testId
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <select data-testid={testId} value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
    </label>
  );
}

function PlanSelect({ value, plans, onChange, testId }: { value: string; plans: EngineeringPlan[]; onChange: (value: string) => void; testId?: string }) {
  return (
    <label className={styles.formField}>
      <span>关联计划</span>
      <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">不关联计划</option>
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>{plan.planCode} · {plan.planName}</option>
        ))}
      </select>
    </label>
  );
}

function DailyReportSelect({
  value,
  reports,
  onChange,
  testId
}: {
  value: string;
  reports: EngineeringProjectReferenceData["dailyReports"];
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>关联日报</span>
      <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">不关联日报</option>
        {reports.map((report) => (
          <option key={report.id} value={report.id}>{formatDailyReportLabel(report)}</option>
        ))}
      </select>
    </label>
  );
}
