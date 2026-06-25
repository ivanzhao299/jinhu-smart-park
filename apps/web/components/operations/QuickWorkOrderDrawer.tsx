"use client";

import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, DrawerSection } from "@jinhu/ui";
import { UploadCloud } from "lucide-react";
import type { FormEvent } from "react";
import type { DictMap, ParkTenantRow, UnitRow, UserRow, WorkOrderForm } from "./terminal-types";
import { OperationPhotoUploader } from "./OperationPhotoUploader";
import { AttachmentCounter, TerminalDictSelect, TerminalField, TerminalSelectField } from "./TerminalFields";

export function QuickWorkOrderDrawer({
  form,
  dicts,
  units,
  parkTenants,
  users,
  onClose,
  onSubmit,
  onChange
}: {
  form: WorkOrderForm;
  dicts: DictMap;
  units: UnitRow[];
  parkTenants: ParkTenantRow[];
  users: UserRow[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (patch: Partial<WorkOrderForm>) => void;
}) {
  return (
    <Drawer className="ds-compact-drawer" size="lg" onClose={onClose}>
      <DrawerHeader
        eyebrow="业主 / 租户需求"
        title="快速新建工单"
        description="用于现场报修、保洁、安防、设备和其他运营诉求。"
        onClose={onClose}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerSection title="基本信息">
          <DrawerFormGrid>
            <TerminalDictSelect label="需求类型" required value={form.woType} dictCode="workorder_type" dicts={dicts} onChange={(value) => onChange({ woType: value })} />
            <TerminalDictSelect label="优先级" required value={form.priority} dictCode="workorder_priority" dicts={dicts} onChange={(value) => onChange({ priority: value })} />
            <TerminalDictSelect label="紧急程度" value={form.urgency} dictCode="workorder_urgency" dicts={dicts} onChange={(value) => onChange({ urgency: value })} />
            <TerminalField label="需求标题">
              <input required value={form.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="例如：门口照明不亮" />
            </TerminalField>
            <TerminalField label="问题描述">
              <textarea required value={form.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="请说明现场问题、诉求或处理建议" />
            </TerminalField>
          </DrawerFormGrid>
        </DrawerSection>

        <DrawerSection title="关联对象">
          <DrawerFormGrid>
            <TerminalSelectField label="租户企业" value={form.parkTenantId} options={parkTenants.map((item) => ({ value: item.id, label: item.companyName }))} onChange={(value) => onChange({ parkTenantId: value })} />
            <TerminalSelectField label="房源 / 位置" value={form.unitId} options={units.map((item) => ({ value: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => {
              const unit = units.find((item) => item.id === value);
              onChange({ unitId: value, location: unitLocation(unit) || form.location });
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
            <TerminalSelectField label="处理人" value={form.assigneeId} options={users.map((item) => ({ value: item.id, label: displayUser(item) }))} onChange={(value) => onChange({ assigneeId: value })} />
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
            提交工单
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

function unitLocation(unit?: UnitRow): string | undefined {
  if (!unit) return undefined;
  return [unit.building?.buildingName, unit.floor?.floorName, unit.unitName].filter(Boolean).join(" / ");
}
