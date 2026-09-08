import type { UserContext } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Edit3, Eye, FileImage, Trash2 } from "lucide-react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { dictLabel, formatArea, formatDateTime, formatMoney, maskUnitField, UNIT_FIELD_REF_PRICE } from "../lib/unit-page-utils";
import type { DictItemRow, UnitPage, UnitRow } from "../types";
import { DictBadge } from "./UnitPageFields";
import { UnitStatusActions } from "./UnitStatusActions";
import { PropertyResponsiveRecords, type PropertyFieldDescriptor } from "../../../../features/property-shared";

export function UnitsTable({
  pageData,
  dicts,
  authUser,
  canViewRefPrice,
  canEditPhotoUrls,
  onView,
  onEdit,
  onOpenAttachments,
  onOpenTransition,
  onOpenStatusLogs,
  onRemove
}: {
  pageData: UnitPage;
  dicts: Record<string, DictItemRow[]>;
  authUser: UserContext | null;
  canViewRefPrice: boolean;
  canEditPhotoUrls: boolean;
  onView: (row: UnitRow) => void;
  onEdit: (row: UnitRow) => void;
  onOpenAttachments: (row: UnitRow) => void;
  onOpenTransition: (row: UnitRow) => void;
  onOpenStatusLogs: (row: UnitRow) => void;
  onRemove: (row: UnitRow) => void;
}) {
  const fields: readonly PropertyFieldDescriptor<UnitRow>[] = [
    { key: "info", label: "房源信息", render: (row) => <span className="ds-cell-stack"><span className="ds-cell-title">{row.unitName}</span><span className="ds-cell-meta">{row.unitCode}</span></span> },
    { key: "location", label: "位置", render: (row) => <span className="ds-cell-stack"><span>{row.building ? `${row.building.buildingCode} ${row.building.buildingName}` : "-"}</span><span className="ds-cell-meta">{row.floor ? `${row.floor.floorCode} ${row.floor.floorName}` : "-"}</span></span> },
    { key: "purpose", label: "用途", render: (row) => dictLabel(dicts.unit_usage_type, row.usageType) },
    { key: "area", label: "面积", render: (row) => <span className="ds-cell-stack"><span>{formatArea(row.unitArea)}</span><span className="ds-cell-meta">使用 {formatArea(row.useArea)}</span></span> },
    { key: "status", label: "状态", render: (row) => <span className="ds-cell-stack"><DictBadge items={dicts.unit_rental_status} value={row.rentalStatus} /><DictBadge items={dicts.unit_fitting_status} value={row.fittingStatus} /></span> },
    { key: "lease", label: "租赁信息", render: (row) => <span className="ds-cell-stack"><span>{canViewRefPrice ? formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, row.refPrice)) : "-"}</span><span className="ds-cell-meta">{row.availableDate ? `可租 ${row.availableDate}` : `更新 ${formatDateTime(row.updateTime)}`}</span></span> }
  ];

  return (
    <PropertyResponsiveRecords
      items={pageData.items}
      fields={fields}
      getKey={(row) => row.id}
      getTitle={(row) => row.unitName}
      label="房源"
      renderActions={(row) => <>
                  <button aria-label="查看详情" className="ds-row-action ds-row-action-view" title="查看详情" type="button" onClick={() => onView(row)}>
                    <Eye size={20} />
                    <span className="ds-row-action-label">详情</span>
                  </button>
                  <PermissionButton aria-label="编辑房源" className="ds-row-action ds-row-action-edit" permission={SYSTEM_PERMISSIONS.UNIT_UPDATE} title="编辑房源" type="button" onClick={() => onEdit(row)}>
                    <Edit3 size={20} />
                    <span className="ds-row-action-label">编辑</span>
                  </PermissionButton>
                  {canEditPhotoUrls ? (
                    <PermissionButton aria-label="管理附件" className="ds-row-action ds-row-action-file" permission={SYSTEM_PERMISSIONS.UNIT_UPDATE} title="管理附件" type="button" onClick={() => onOpenAttachments(row)}>
                      <FileImage size={20} />
                      <span className="ds-row-action-label">附件</span>
                    </PermissionButton>
                  ) : null}
                  <UnitStatusActions
                    onOpenTransition={() => onOpenTransition(row)}
                    onOpenStatusLogs={() => onOpenStatusLogs(row)}
                  />
                  <PermissionButton aria-label="删除房源" className="ds-row-action ds-row-action-danger" permission={SYSTEM_PERMISSIONS.UNIT_DELETE} title="删除房源" type="button" onClick={() => onRemove(row)}>
                    <Trash2 size={20} />
                    <span className="ds-row-action-label">删除</span>
                  </PermissionButton>
      </>}
    />
  );
}
