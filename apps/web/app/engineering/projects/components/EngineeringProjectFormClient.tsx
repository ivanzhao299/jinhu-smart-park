"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import {
  engineeringProjectLevelOptions,
  engineeringProjectTypeOptions,
  engineeringRiskLevelOptions
} from "../../../../lib/engineering-projects-display";
import { engineeringProjectsApi } from "../../../../lib/engineering-projects-api";
import { ENGINEERING_PROJECT_PERMISSIONS, hasEngineeringProjectPermission } from "../../../../lib/engineering-projects-permissions";
import type { CreateEngineeringProjectInput, EngineeringProject, EngineeringProjectLevel, EngineeringProjectType, EngineeringRiskLevel, UpdateEngineeringProjectInput } from "../../../../lib/engineering-projects-types";
import { ForbiddenEngineeringProject, MessageLine, ProjectStatusPill, formatDate, projectTitle } from "./EngineeringProjectShared";
import {
  displayUserName,
  emptyEngineeringProjectReferences,
  formatBuildingLabel,
  formatFloorLabel,
  formatOrgLabel,
  formatUnitLabel,
  loadEngineeringProjectReferences,
  type EngineeringProjectReferenceData
} from "./EngineeringProjectReferenceData";
import styles from "../engineering-projects.module.css";

interface ProjectFormState {
  projectName: string;
  projectType: EngineeringProjectType;
  projectLevel: EngineeringProjectLevel;
  projectSource: string;
  description: string;
  orgId: string;
  locationText: string;
  buildingId: string;
  floorId: string;
  spaceId: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  budgetAmount: string;
  contractAmount: string;
  progressPercent: string;
  riskLevel: EngineeringRiskLevel;
  projectManagerId: string;
  engineeringDirectorId: string;
  contractorOrgId: string;
  supervisorOrgId: string;
  remark: string;
}

const defaultForm: ProjectFormState = {
  projectName: "",
  projectType: "REPAIR",
  projectLevel: "NORMAL",
  projectSource: "",
  description: "",
  orgId: "",
  locationText: "",
  buildingId: "",
  floorId: "",
  spaceId: "",
  plannedStartDate: "",
  plannedEndDate: "",
  actualStartDate: "",
  actualEndDate: "",
  budgetAmount: "",
  contractAmount: "",
  progressPercent: "0",
  riskLevel: "MEDIUM",
  projectManagerId: "",
  engineeringDirectorId: "",
  contractorOrgId: "",
  supervisorOrgId: "",
  remark: ""
};

export function EngineeringProjectFormClient({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const authUser = useAuthUser();
  const editing = Boolean(projectId);
  const canSubmit = hasEngineeringProjectPermission(authUser, editing ? ENGINEERING_PROJECT_PERMISSIONS.UPDATE : ENGINEERING_PROJECT_PERMISSIONS.CREATE);
  const [form, setForm] = useState<ProjectFormState>(defaultForm);
  const [project, setProject] = useState<EngineeringProject | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [references, setReferences] = useState<EngineeringProjectReferenceData>(emptyEngineeringProjectReferences);

  const title = editing ? "编辑工程项目" : "新建工程项目";
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

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringProjectsApi.getProject(projectId, getAccessToken());
      setProject(detail);
      setForm(fromProject(detail));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程项目失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    void loadEngineeringProjectReferences(getAccessToken())
      .then((data) => setReferences(data))
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!editing && !form.orgId && authUser?.org_id) {
      setForm((current) => ({ ...current, orgId: authUser.org_id ?? "" }));
    }
  }, [authUser?.org_id, editing, form.orgId]);

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
      const saved = editing && projectId
        ? await engineeringProjectsApi.updateProject(projectId, toUpdateInput(form), getAccessToken())
        : await engineeringProjectsApi.createProject(toCreateInput(form), getAccessToken());
      router.push(`/engineering/projects/${saved.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存工程项目失败");
    } finally {
      setSaving(false);
    }
  }

  if (!canSubmit) {
    return <ForbiddenEngineeringProject />;
  }

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{title}</strong>
          <span>{editing ? projectTitle(project) : "创建工程立项草稿，保存后进入项目详情执行状态动作"}</span>
        </div>
        <Link className="secondary-button" href={projectId ? `/engineering/projects/${projectId}` : "/engineering/projects"}>
          <ArrowLeft size={16} />
          返回
        </Link>
      </header>

      {project ? (
        <Card>
          <div className={styles.projectSummaryStrip}>
            <span>{project.projectCode}</span>
            <strong>{project.projectName}</strong>
            <ProjectStatusPill status={project.status} />
            <span>计划：{formatDate(project.plannedStartDate)} - {formatDate(project.plannedEndDate)}</span>
          </div>
        </Card>
      ) : null}

      <Card>
        <form className={styles.projectForm} onSubmit={(event) => void submit(event)}>
          <section className={styles.formSection}>
            <h2>基础信息</h2>
            <div className={styles.formGrid}>
              <TextField label="项目名称" value={form.projectName} required onChange={(value) => setFormValue("projectName", value)} />
              <SelectField label="工程类型" value={form.projectType} options={engineeringProjectTypeOptions} onChange={(value) => setFormValue("projectType", value as EngineeringProjectType)} />
              <SelectField label="项目级别" value={form.projectLevel} options={engineeringProjectLevelOptions} onChange={(value) => setFormValue("projectLevel", value as EngineeringProjectLevel)} />
              <TextField label="项目来源" value={form.projectSource} placeholder="内部立项 / 租户需求 / 安全整改" onChange={(value) => setFormValue("projectSource", value)} />
            </div>
            <TextAreaField label="项目描述" value={form.description} onChange={(value) => setFormValue("description", value)} />
          </section>

          <section className={styles.formSection}>
            <h2>位置与范围</h2>
            <div className={styles.scopeHint}>园区由当前登录上下文确定。工程人员不手填数据库 ID，只选择组织、楼栋、楼层和空间，系统自动落盘 orgId / buildingId / floorId / spaceId。</div>
            <div className={styles.formGrid}>
              <SelectRefField
                label="归属组织"
                value={form.orgId}
                allLabel="请选择组织"
                items={references.orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                onChange={(value) => setFormValue("orgId", value)}
              />
              <TextField label="位置描述" value={form.locationText} placeholder="例如：A5 楼 3F 消防通道" onChange={(value) => setFormValue("locationText", value)} />
              <SelectRefField
                label="楼栋"
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
                value={form.spaceId}
                allLabel="不关联空间"
                items={availableUnits.map((item) => ({ id: item.id, label: formatUnitLabel(item) }))}
                onChange={(value) => setFormValue("spaceId", value)}
              />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>计划信息</h2>
            <div className={styles.formGrid}>
              <TextField label="计划开始日期" type="date" value={form.plannedStartDate} required onChange={(value) => setFormValue("plannedStartDate", value)} />
              <TextField label="计划结束日期" type="date" value={form.plannedEndDate} required onChange={(value) => setFormValue("plannedEndDate", value)} />
              {editing ? <TextField label="实际开始日期" type="date" value={form.actualStartDate} onChange={(value) => setFormValue("actualStartDate", value)} /> : null}
              {editing ? <TextField label="实际结束日期" type="date" value={form.actualEndDate} onChange={(value) => setFormValue("actualEndDate", value)} /> : null}
              <TextField label="预算金额" type="number" value={form.budgetAmount} min="0" onChange={(value) => setFormValue("budgetAmount", value)} />
              <TextField label="合同金额" type="number" value={form.contractAmount} min="0" onChange={(value) => setFormValue("contractAmount", value)} />
              {editing ? <TextField label="项目进度" type="number" value={form.progressPercent} min="0" max="100" onChange={(value) => setFormValue("progressPercent", value)} /> : null}
              <SelectField label="风险等级" value={form.riskLevel} options={engineeringRiskLevelOptions} onChange={(value) => setFormValue("riskLevel", value as EngineeringRiskLevel)} />
            </div>
          </section>

          <section className={styles.formSection}>
            <h2>责任信息</h2>
            <div className={styles.formGrid}>
              <SelectRefField
                label="项目负责人"
                value={form.projectManagerId}
                allLabel="请选择负责人"
                items={references.users.map((item) => ({ id: item.id, label: displayUserName(item) }))}
                onChange={(value) => setFormValue("projectManagerId", value)}
                required
              />
              <SelectRefField
                label="工程负责人"
                value={form.engineeringDirectorId}
                allLabel="暂不指定"
                items={references.users.map((item) => ({ id: item.id, label: displayUserName(item) }))}
                onChange={(value) => setFormValue("engineeringDirectorId", value)}
              />
              <SelectRefField
                label="施工单位"
                value={form.contractorOrgId}
                allLabel="暂不指定"
                items={references.orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                onChange={(value) => setFormValue("contractorOrgId", value)}
              />
              <SelectRefField
                label="监理单位"
                value={form.supervisorOrgId}
                allLabel="暂不指定"
                items={references.orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                onChange={(value) => setFormValue("supervisorOrgId", value)}
              />
            </div>
            <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value)} />
          </section>

          <div className={styles.formFooter}>
            <Link className="secondary-button" href={projectId ? `/engineering/projects/${projectId}` : "/engineering/projects"}>取消</Link>
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

  function setFormValue<K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function fromProject(project: EngineeringProject): ProjectFormState {
  return {
    projectName: project.projectName,
    projectType: project.projectType,
    projectLevel: project.projectLevel,
    projectSource: project.projectSource ?? "",
    description: project.description ?? "",
    orgId: project.orgId ?? "",
    locationText: project.locationText ?? "",
    buildingId: project.buildingId ?? "",
    floorId: project.floorId ?? "",
    spaceId: project.spaceId ?? "",
    plannedStartDate: formatDate(project.plannedStartDate) === "-" ? "" : formatDate(project.plannedStartDate),
    plannedEndDate: formatDate(project.plannedEndDate) === "-" ? "" : formatDate(project.plannedEndDate),
    actualStartDate: formatDate(project.actualStartDate) === "-" ? "" : formatDate(project.actualStartDate),
    actualEndDate: formatDate(project.actualEndDate) === "-" ? "" : formatDate(project.actualEndDate),
    budgetAmount: project.budgetAmount ?? "",
    contractAmount: project.contractAmount ?? "",
    progressPercent: String(project.progressPercent ?? 0),
    riskLevel: project.riskLevel,
    projectManagerId: project.projectManagerId ?? "",
    engineeringDirectorId: project.engineeringDirectorId ?? "",
    contractorOrgId: project.contractorOrgId ?? "",
    supervisorOrgId: project.supervisorOrgId ?? "",
    remark: project.remark ?? ""
  };
}

function validateForm(form: ProjectFormState, editing: boolean): string {
  if (!form.projectName.trim()) return "请填写项目名称";
  if (!form.projectManagerId.trim()) return "请填写项目负责人 ID";
  if (!form.plannedStartDate) return "请选择计划开始日期";
  if (!form.plannedEndDate) return "请选择计划结束日期";
  if (form.plannedEndDate < form.plannedStartDate) return "计划结束日期不能早于计划开始日期";
  if (Number(form.budgetAmount || 0) < 0) return "预算金额不能为负数";
  if (Number(form.contractAmount || 0) < 0) return "合同金额不能为负数";
  if (editing && (Number(form.progressPercent || 0) < 0 || Number(form.progressPercent || 0) > 100)) return "项目进度必须在 0 到 100 之间";
  return "";
}

function toCreateInput(form: ProjectFormState): CreateEngineeringProjectInput {
  return {
    org_id: emptyToUndefined(form.orgId),
    project_name: form.projectName.trim(),
    project_type: form.projectType,
    planned_start_date: form.plannedStartDate,
    planned_end_date: form.plannedEndDate,
    project_manager_id: form.projectManagerId.trim(),
    project_level: form.projectLevel,
    project_source: emptyToUndefined(form.projectSource),
    description: emptyToUndefined(form.description),
    location_text: emptyToUndefined(form.locationText),
    building_id: emptyToUndefined(form.buildingId),
    floor_id: emptyToUndefined(form.floorId),
    space_id: emptyToUndefined(form.spaceId),
    budget_amount: optionalNumber(form.budgetAmount),
    contract_amount: optionalNumber(form.contractAmount),
    engineering_director_id: emptyToUndefined(form.engineeringDirectorId),
    contractor_org_id: emptyToUndefined(form.contractorOrgId),
    supervisor_org_id: emptyToUndefined(form.supervisorOrgId),
    risk_level: form.riskLevel,
    remark: emptyToUndefined(form.remark)
  };
}

function toUpdateInput(form: ProjectFormState): UpdateEngineeringProjectInput {
  return {
    ...toCreateInput(form),
    actual_start_date: emptyToUndefined(form.actualStartDate),
    actual_end_date: emptyToUndefined(form.actualEndDate),
    progress_percent: Number(form.progressPercent || 0)
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
  type = "text",
  placeholder,
  min,
  max
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "date" | "number";
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <input type={type} value={value} required={required} placeholder={placeholder} min={min} max={max} onChange={(event) => onChange(event.target.value)} />
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

function SelectRefField({
  label,
  value,
  items,
  allLabel,
  onChange,
  required
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}{required ? <em>*</em> : null}</span>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
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
