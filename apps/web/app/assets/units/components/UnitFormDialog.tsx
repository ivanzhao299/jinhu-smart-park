import { Drawer } from "@jinhu/ui";
import type { UserContext } from "@jinhu/shared";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import { fieldText, formatMoney, maskUnitField, UNIT_FIELD_REF_PRICE, UNIT_FIELD_REMARK } from "../lib/unit-page-utils";
import type { BuildingRow, DictItemRow, EnabledStatus, FloorRow, UnitFormState } from "../types";
import { DetailItem, DictBadge, DictSelect, NumberField, SelectField, TextField } from "./UnitPageFields";

export function UnitFormDialog({
  editingId,
  form,
  buildings,
  formFloors,
  dicts,
  authUser,
  canEditRefPrice,
  canViewRefPrice,
  canEditRemark,
  canViewRemark,
  onClose,
  onSubmit,
  onBuildingChange,
  onFormChange
}: {
  editingId: string | null;
  form: UnitFormState;
  buildings: BuildingRow[];
  formFloors: FloorRow[];
  dicts: Record<string, DictItemRow[]>;
  authUser: UserContext | null;
  canEditRefPrice: boolean;
  canViewRefPrice: boolean;
  canEditRemark: boolean;
  canViewRemark: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBuildingChange: (buildingId: string) => void;
  onFormChange: <K extends keyof UnitFormState>(key: K, value: UnitFormState[K]) => void;
}) {
  return (
    <Drawer size="lg" onClose={onClose}>
      <div className="task-item">
        <h2 className="panel-title">{editingId ? "编辑房源" : "新增房源"}</h2>
        <button type="button" title="关闭" onClick={onClose}><X size={16} /></button>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <SelectField label="所属楼栋" value={form.buildingId} required onChange={onBuildingChange}>
          <option value="">请选择楼栋</option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
          ))}
        </SelectField>
        <SelectField label="所属楼层" value={form.floorId} required onChange={(value) => onFormChange("floorId", value)}>
          <option value="">请选择楼层</option>
          {formFloors.map((floor) => (
            <option key={floor.id} value={floor.id}>{floor.floorCode} {floor.floorName}</option>
          ))}
        </SelectField>
        <TextField label="房源编码" value={form.unitCode} required placeholder="请输入或生成房源编码" onChange={(value) => onFormChange("unitCode", value)} />
        <TextField label="房源名称" value={form.unitName} required onChange={(value) => onFormChange("unitName", value)} />
        <DictSelect label="用途" value={form.usageType} required items={dicts.unit_usage_type} onChange={(value) => onFormChange("usageType", value)} />
        <NumberField label="建筑面积" value={form.unitArea} required step="0.01" onChange={(value) => onFormChange("unitArea", value)} />
        <NumberField label="使用面积" value={form.useArea} required step="0.01" onChange={(value) => onFormChange("useArea", value)} />
        {editingId ? (
          <DetailItem label="出租状态" value={<DictBadge items={dicts.unit_rental_status} value={Number(form.rentalStatus)} />} />
        ) : (
          <DictSelect label="出租状态" value={form.rentalStatus} required items={dicts.unit_rental_status} onChange={(value) => onFormChange("rentalStatus", value)} />
        )}
        <DictSelect label="装修状态" value={form.fittingStatus} required items={dicts.unit_fitting_status} onChange={(value) => onFormChange("fittingStatus", value)} />
        {canEditRefPrice ? (
          <NumberField label="参考租金" value={form.refPrice} required step="0.01" onChange={(value) => onFormChange("refPrice", value)} />
        ) : canViewRefPrice ? (
          <DetailItem label="参考租金" value={formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, form.refPrice))} />
        ) : null}
        <div className="field">
          <label>可租日期</label>
          <input type="date" value={form.availableDate} onChange={(event) => onFormChange("availableDate", event.target.value)} />
        </div>
        <SelectField label="状态" value={String(form.status)} onChange={(value) => onFormChange("status", Number(value) as EnabledStatus)}>
          <option value="1">启用</option>
          <option value="0">停用</option>
        </SelectField>
        {canEditRemark ? (
          <TextField label="备注" value={form.remark} onChange={(value) => onFormChange("remark", value)} />
        ) : canViewRemark ? (
          <DetailItem label="备注" value={fieldText(maskUnitField(authUser, UNIT_FIELD_REMARK, form.remark))} />
        ) : null}
        <button className="primary-button" type="submit">保存</button>
        <button type="button" onClick={onClose}>取消</button>
      </form>
    </Drawer>
  );
}
