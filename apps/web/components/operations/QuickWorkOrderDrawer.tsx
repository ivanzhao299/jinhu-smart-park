"use client";

import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, DrawerSection } from "@jinhu/ui";
import { UploadCloud, X } from "lucide-react";
import type { FormEvent } from "react";
import type { WorkOrderAudienceProfile } from "../../lib/workorder-prefill";
import { formatUnitLocation, patchContactFromTenant, tenantForUnit } from "../../lib/workorder-prefill";
import type { DictMap, ParkTenantRow, UnitRow, UserRow, WorkOrderForm } from "./terminal-types";
import { OperationPhotoUploader } from "./OperationPhotoUploader";
import { AttachmentCounter, TerminalDictSelect, TerminalField, TerminalSelectField } from "./TerminalFields";

export function QuickWorkOrderDrawer({
  form,
  dicts,
  units,
  parkTenants,
  users,
  audienceProfile,
  onClose,
  onSubmit,
  onChange
}: {
  form: WorkOrderForm;
  dicts: DictMap;
  units: UnitRow[];
  parkTenants: ParkTenantRow[];
  users: UserRow[];
  audienceProfile: WorkOrderAudienceProfile;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (patch: Partial<WorkOrderForm>) => void;
}) {
  const intentOptions = workOrderIntentsForAudience(audienceProfile);

  function applyIntent(intent: WorkOrderIntent) {
    onChange({
      woType: preferredDictValue(dicts.workorder_type, [intent.woType, audienceProfile.defaultType]),
      priority: preferredDictValue(dicts.workorder_priority, [intent.priority, "medium"]),
      urgency: preferredDictValue(dicts.workorder_urgency, [intent.urgency, "normal"]),
      sourceType: preferredDictValue(dicts.workorder_source_type, [intent.sourceType, audienceProfile.sourceType]),
      title: !form.title || form.title === audienceProfile.defaultTitle ? intent.title : form.title,
      description: !form.description || form.description === audienceProfile.defaultDescription ? intent.description : form.description
    });
  }

  return (
    <Drawer size="lg" onClose={onClose}>
      <DrawerHeader
        eyebrow={audienceProfile.eyebrow}
        title={audienceProfile.title}
        description={audienceProfile.description}
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerSection title="选择业务场景">
          <div className="workorder-flow-note">
            <strong>{audienceProfile.audience === "tenant" ? "服务请求流转" : "内部任务流转"}</strong>
            <span>
              {audienceProfile.audience === "tenant"
                ? "提交后进入服务台受理队列，由调度岗分派给物业、工程、安防或信息化处理，完成后由提交人确认或评价。"
                : "提交后进入流程收件箱和部门待办，由责任人接单处理，主管可跟踪复核和闭环。"}
            </span>
          </div>
          <div className="workorder-intent-grid">
            {intentOptions.map((intent) => {
              const active = form.woType === preferredDictValue(dicts.workorder_type, [intent.woType]);
              return (
                <button className={active ? "workorder-intent-card workorder-intent-card-active" : "workorder-intent-card"} key={intent.key} type="button" onClick={() => applyIntent(intent)}>
                  <strong>{intent.label}</strong>
                  <small>{intent.helper}</small>
                </button>
              );
            })}
          </div>
        </DrawerSection>

        <DrawerSection title="基本信息">
          <DrawerFormGrid>
            <TerminalDictSelect label={audienceProfile.audience === "tenant" ? "服务类型" : "任务类型"} required value={form.woType} dictCode="workorder_type" dicts={dicts} onChange={(value) => onChange({ woType: value })} />
            <TerminalDictSelect label="优先级" required value={form.priority} dictCode="workorder_priority" dicts={dicts} onChange={(value) => onChange({ priority: value })} />
            <TerminalDictSelect label="紧急程度" value={form.urgency} dictCode="workorder_urgency" dicts={dicts} onChange={(value) => onChange({ urgency: value })} />
            {audienceProfile.audience === "tenant" ? null : (
              <TerminalDictSelect label="来源" value={form.sourceType} dictCode="workorder_source_type" dicts={dicts} onChange={(value) => onChange({ sourceType: value || audienceProfile.sourceType })} />
            )}
            <TerminalField label={audienceProfile.audience === "tenant" ? "诉求标题" : "任务标题"}>
              <input required value={form.title} onChange={(event) => onChange({ title: event.target.value })} placeholder={audienceProfile.audience === "tenant" ? "例如：办公室空调不制冷" : "例如：A5 楼照明维修"} />
            </TerminalField>
            <TerminalField label={audienceProfile.audience === "tenant" ? "诉求说明" : "处置说明"}>
              <textarea required value={form.description} onChange={(event) => onChange({ description: event.target.value })} placeholder={audienceProfile.defaultDescription} />
            </TerminalField>
          </DrawerFormGrid>
        </DrawerSection>

        <DrawerSection title="关联对象">
          <DrawerFormGrid>
            <TerminalSelectField label="租户企业" value={form.parkTenantId} options={parkTenants.map((item) => ({ value: item.id, label: item.companyName }))} onChange={(value) => {
              const tenant = parkTenants.find((item) => item.id === value);
              const tenantUnit = tenant ? units.filter((item) => tenantForUnit(item, parkTenants)?.id === tenant.id) : [];
              const singleUnit = tenantUnit.length === 1 ? tenantUnit[0] : undefined;
              const patch = patchContactFromTenant<Partial<WorkOrderForm>>({ parkTenantId: value }, tenant);
              if (!form.unitId && singleUnit) {
                patch.unitId = singleUnit.id;
                patch.location = formatUnitLocation(singleUnit) || form.location;
              }
              onChange(patch);
            }} />
            <TerminalSelectField label="房源 / 位置" value={form.unitId} options={units.map((item) => ({ value: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => {
              const unit = units.find((item) => item.id === value);
              const tenant = tenantForUnit(unit, parkTenants);
              const patch = patchContactFromTenant<Partial<WorkOrderForm>>({
                unitId: value,
                location: formatUnitLocation(unit) || form.location,
                parkTenantId: tenant?.id ?? form.parkTenantId
              }, tenant);
              onChange(patch);
            }} />
            <TerminalField label="详细位置">
              <input value={form.location} onChange={(event) => onChange({ location: event.target.value })} placeholder="可填写楼栋、楼层、房间或现场描述" />
            </TerminalField>
          </DrawerFormGrid>
        </DrawerSection>

        <DrawerSection title="联系人与附件">
          <DrawerFormGrid>
            <TerminalField label="联系人">
              <input value={form.reporterName} onChange={(event) => onChange({ reporterName: event.target.value })} />
            </TerminalField>
            <TerminalField label="联系电话">
              <input value={form.reporterMobile} onChange={(event) => onChange({ reporterMobile: event.target.value })} />
            </TerminalField>
            {audienceProfile.audience === "tenant" ? null : (
              <TerminalSelectField label="处理人" value={form.assigneeId} options={users.map((item) => ({ value: item.id, label: displayUser(item) }))} onChange={(value) => onChange({ assigneeId: value })} />
            )}
            <TerminalField label="照片附件">
              <OperationPhotoUploader bizType="workorder_create" onUploaded={(file) => onChange({ imageFileIds: appendUnique(form.imageFileIds, file.id) })} />
              <AttachmentCounter count={form.imageFileIds.length} />
            </TerminalField>
          </DrawerFormGrid>
        </DrawerSection>

        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">
            <UploadCloud size={16} />
            {audienceProfile.primaryActionLabel}
          </button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function appendUnique(values: string[], next: string): string[] {
  return Array.from(new Set([...values, next].filter(Boolean)));
}

function displayUser(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

interface WorkOrderIntent {
  key: string;
  label: string;
  helper: string;
  woType: string;
  priority: string;
  urgency: string;
  sourceType: string;
  title: string;
  description: string;
}

function workOrderIntentsForAudience(profile: WorkOrderAudienceProfile): WorkOrderIntent[] {
  if (profile.audience === "tenant") {
    return [
      { key: "repair", label: "维修报修", helper: "水电、空调、门禁、照明、公共设施故障", woType: "repair", priority: "high", urgency: "urgent", sourceType: "tenant_request", title: "现场维修报修", description: "请说明故障位置、现象、影响范围和方便上门时间。" },
      { key: "cleaning", label: "保洁服务", helper: "公共区域、卫生间、走廊、垃圾清运", woType: "cleaning", priority: "medium", urgency: "normal", sourceType: "tenant_request", title: "保洁服务请求", description: "请说明需要处理的区域、现场情况和期望完成时间。" },
      { key: "security", label: "安防协助", helper: "门禁、通行、巡逻、可疑情况协助", woType: "security", priority: "high", urgency: "urgent", sourceType: "tenant_request", title: "安防协助请求", description: "请说明事件位置、人员/车辆信息、紧急程度和联系方式。" },
      { key: "consult", label: "咨询 / 申请", helper: "合同、账单、物业服务或其他咨询", woType: "consultation", priority: "medium", urgency: "normal", sourceType: "tenant_request", title: "园区服务咨询", description: "请说明咨询事项、关联合同/账单或需要协助的问题。" }
    ];
  }
  if (profile.audience === "engineering") {
    return [
      { key: "maintenance", label: "设备维修", helper: "公共设备、水电、空调、门禁、照明", woType: "maintenance", priority: "medium", urgency: "normal", sourceType: "manual", title: "工程维修处理", description: "请说明设备/设施名称、故障现象、位置和处理要求。" },
      { key: "energy", label: "水电能源", helper: "配电箱、电表、水泵、临时用电", woType: "energy", priority: "high", urgency: "urgent", sourceType: "manual", title: "水电能源现场处理", description: "请说明风险点位、影响范围、是否需要停电/停水和处置建议。" },
      { key: "inspection", label: "巡检异常", helper: "巡检发现问题转维修处置", woType: "maintenance", priority: "high", urgency: "urgent", sourceType: "inspection", title: "巡检异常工程处置", description: "请说明巡检点位、异常现象、整改标准和完成要求。" }
    ];
  }
  if (profile.audience === "security") {
    return [
      { key: "security", label: "安防事件", helper: "巡逻、门禁、人员车辆、秩序维护", woType: "security", priority: "high", urgency: "urgent", sourceType: "manual", title: "安防现场处理", description: "请说明事件位置、涉及人员/车辆、风险情况和处置建议。" },
      { key: "access", label: "通行协同", helper: "访客、车辆、货物进出园区", woType: "access", priority: "medium", urgency: "normal", sourceType: "manual", title: "通行协同处理", description: "请说明通行对象、时间、车辆/人员信息和审批联系人。" },
      { key: "fire", label: "消防安全", helper: "消防通道、器材、应急照明", woType: "fire_safety", priority: "high", urgency: "urgent", sourceType: "inspection", title: "消防安全问题处理", description: "请说明消防安全问题、现场风险和整改要求。" }
    ];
  }
  if (profile.audience === "it") {
    return [
      { key: "system", label: "系统支持", helper: "平台账号、权限、业务系统使用问题", woType: "request", priority: "medium", urgency: "normal", sourceType: "manual", title: "信息化系统支持", description: "请说明系统名称、账号、问题截图和影响范围。" },
      { key: "network", label: "网络 / 弱电", helper: "网络、监控、门禁、数字化设备", woType: "maintenance", priority: "high", urgency: "urgent", sourceType: "manual", title: "网络弱电现场支持", description: "请说明点位、设备编号、故障现象和需要协同的部门。" }
    ];
  }
  return [
    { key: "tenant-follow", label: "客户工单跟进", helper: "客户诉求受理、分派、上门服务和消案", woType: "request", priority: "medium", urgency: "normal", sourceType: "tenant_request", title: "客户诉求跟进", description: "请说明客户诉求、关联企业/房源、责任部门和闭环要求。" },
    { key: "inspection", label: "巡检发现处置", helper: "巡检异常、隐患、现场问题转任务", woType: "maintenance", priority: "high", urgency: "urgent", sourceType: "inspection", title: "巡检发现问题处置", description: "请说明巡检点位、异常情况、整改标准和完成时限。" },
    { key: "property", label: "物业服务任务", helper: "保洁、维修、绿化、停车、日常运营", woType: profile.defaultType, priority: "medium", urgency: "normal", sourceType: "manual", title: profile.defaultTitle, description: profile.defaultDescription }
  ];
}

function preferredDictValue(items: DictMap[string] | undefined, preferredValues: string[]): string {
  const enabled = items?.filter((item) => item.status === "enabled") ?? [];
  for (const value of preferredValues) {
    if (enabled.some((item) => item.itemValue === value)) return value;
  }
  return enabled[0]?.itemValue ?? preferredValues[0] ?? "";
}
