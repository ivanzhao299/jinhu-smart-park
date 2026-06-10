import { DrawerDetailGrid, DrawerDetailItem } from "@jinhu/ui";
import type { UserContext } from "@jinhu/shared";
import {
  dictLabel,
  fieldText,
  formatArea,
  formatDateTime,
  formatMoney,
  maskUnitField,
  UNIT_FIELD_REF_PRICE,
  UNIT_FIELD_REMARK
} from "../lib/unit-page-utils";
import type { DictItemRow, UnitRow } from "../types";
import { DictBadge, StatusBadge } from "./UnitPageFields";

export function UnitDetailSummary({
  unit,
  dicts,
  authUser,
  canViewRefPrice,
  canViewRemark
}: {
  unit: UnitRow;
  dicts: Record<string, DictItemRow[]>;
  authUser: UserContext | null;
  canViewRefPrice: boolean;
  canViewRemark: boolean;
}) {
  return (
    <DrawerDetailGrid>
      <DrawerDetailItem label="房源编码" value={unit.unitCode} />
      <DrawerDetailItem label="房源名称" value={unit.unitName} />
      <DrawerDetailItem label="楼栋" value={unit.building ? `${unit.building.buildingCode} ${unit.building.buildingName}` : "-"} />
      <DrawerDetailItem label="楼层" value={unit.floor ? `${unit.floor.floorCode} ${unit.floor.floorName}` : "-"} />
      <DrawerDetailItem label="用途" value={dictLabel(dicts.unit_usage_type, unit.usageType)} />
      <DrawerDetailItem label="建筑面积" value={formatArea(unit.unitArea)} />
      <DrawerDetailItem label="使用面积" value={formatArea(unit.useArea)} />
      <DrawerDetailItem label="出租状态" value={<DictBadge items={dicts.unit_rental_status} value={unit.rentalStatus} />} />
      <DrawerDetailItem label="状态更新时间" value={unit.statusUpdateTime ? formatDateTime(unit.statusUpdateTime) : "-"} />
      <DrawerDetailItem label="锁定原因" value={unit.lockReason ?? "-"} />
      <DrawerDetailItem label="锁定到期" value={unit.lockExpireTime ? formatDateTime(unit.lockExpireTime) : "-"} />
      <DrawerDetailItem label="装修状态" value={<DictBadge items={dicts.unit_fitting_status} value={unit.fittingStatus} />} />
      {canViewRefPrice ? <DrawerDetailItem label="参考租金" value={formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, unit.refPrice))} /> : null}
      <DrawerDetailItem label="可租日期" value={unit.availableDate ?? "-"} />
      <DrawerDetailItem label="状态" value={<StatusBadge status={unit.status} />} />
      {canViewRemark ? <DrawerDetailItem label="备注" value={fieldText(maskUnitField(authUser, UNIT_FIELD_REMARK, unit.remark))} /> : null}
    </DrawerDetailGrid>
  );
}
