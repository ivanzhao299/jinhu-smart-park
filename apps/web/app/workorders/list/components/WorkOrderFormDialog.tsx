import {
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader
} from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type { DictItemRow, ParkTenantRow, UnitRow, UserRow, WorkOrderFormState } from "../types";
import { displayUserName } from "../lib/workorder-page-utils";

interface WorkOrderFormDialogProps {
  isEditing: boolean;
  form: WorkOrderFormState;
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  urgencyItems: DictItemRow[];
  sourceItems: DictItemRow[];
  parkTenants: ParkTenantRow[];
  units: UnitRow[];
  users: UserRow[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (patch: Partial<WorkOrderFormState>) => void;
  onUnitChange: (unitId: string) => void;
  onAssigneeChange: (userId: string) => void;
}

export function WorkOrderFormDialog({
  isEditing,
  form,
  typeItems,
  priorityItems,
  urgencyItems,
  sourceItems,
  parkTenants,
  units,
  users,
  onClose,
  onSubmit,
  onFormChange,
  onUnitChange,
  onAssigneeChange
}: WorkOrderFormDialogProps) {
  return (
    <Drawer className="ds-compact-drawer" size="lg" onClose={onClose}>
      <DrawerHeader
        eyebrow={isEditing ? "编辑工单" : "新增工单"}
        title={isEditing ? "编辑工单信息" : "新增手工工单"}
        description="填写报修、投诉、申请或咨询事项，提交后状态为已提交。"
        onClose={onClose}
        closeIcon={<X size={16} />}
      />
      <DrawerForm onSubmit={onSubmit}>
        <DrawerFormGrid>
          <TextField label="工单编号" value={form.woCode} placeholder="留空自动生成" onChange={(value) => onFormChange({ woCode: value })} />
          <TextField label="标题" value={form.title} required onChange={(value) => onFormChange({ title: value })} />
          <SelectField label="工单类型" value={form.woType} required items={typeItems} onChange={(value) => onFormChange({ woType: value })} />
          <TextField label="子类型" value={form.woSubType} onChange={(value) => onFormChange({ woSubType: value })} />
          <SelectField label="优先级" value={form.priority} required items={priorityItems} onChange={(value) => onFormChange({ priority: value })} />
          <SelectField label="紧急程度" value={form.urgency} items={urgencyItems} onChange={(value) => onFormChange({ urgency: value })} />
          <SelectField label="来源" value={form.sourceType} items={sourceItems} onChange={(value) => onFormChange({ sourceType: value || "manual" })} />
          <Field label="租户企业">
            <select value={form.parkTenantId} onChange={(event) => onFormChange({ parkTenantId: event.target.value })}>
              <option value="">内部工单 / 不关联租户</option>
              {parkTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>)}
            </select>
          </Field>
          <Field label="房源">
            <select value={form.unitId} onChange={(event) => onUnitChange(event.target.value)}>
              <option value="">不关联房源</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitCode} {unit.unitName}</option>)}
            </select>
          </Field>
          <TextField label="位置" value={form.location} onChange={(value) => onFormChange({ location: value })} />
          <TextField label="报告人" value={form.reporterName} onChange={(value) => onFormChange({ reporterName: value })} />
          <TextField label="报告电话" value={form.reporterMobile} onChange={(value) => onFormChange({ reporterMobile: value })} />
          <Field label="处理人">
            <select value={form.assigneeId} onChange={(event) => onAssigneeChange(event.target.value)}>
              <option value="">暂不指定</option>
              {users.map((user) => <option key={user.id} value={user.id}>{displayUserName(user)}</option>)}
            </select>
          </Field>
          <TextField label="处理人名称" value={form.assigneeName} onChange={(value) => onFormChange({ assigneeName: value })} />
          <NumberField label="派单 SLA(分钟)" value={form.slaDispatchMin} onChange={(value) => onFormChange({ slaDispatchMin: value })} />
          <NumberField label="完成 SLA(分钟)" value={form.slaFinishMin} onChange={(value) => onFormChange({ slaFinishMin: value })} />
        </DrawerFormGrid>
        <DrawerFormGrid single>
          <TextAreaField label="问题描述" value={form.description} required onChange={(value) => onFormChange({ description: value })} />
          <TextAreaField label="备注" value={form.remark} onChange={(value) => onFormChange({ remark: value })} />
        </DrawerFormGrid>
        <DrawerFooter>
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">保存</button>
        </DrawerFooter>
      </DrawerForm>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  required,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input type="number" min={0} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function TextAreaField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <textarea value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SelectField({
  label,
  value,
  items,
  required,
  allLabel = "请选择",
  onChange
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  required?: boolean;
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}
