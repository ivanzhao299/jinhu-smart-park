import { Card, DataTable, DataTableActions } from "@jinhu/ui";
import type { UserContext } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Edit3, Eye, FileImage, Trash2 } from "lucide-react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { dictLabel, formatArea, formatDateTime, formatMoney, maskUnitField, UNIT_FIELD_REF_PRICE } from "../lib/unit-page-utils";
import type { DictItemRow, UnitPage, UnitRow } from "../types";
import { DictBadge } from "./UnitPageFields";
import { UnitStatusActions } from "./UnitStatusActions";

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
  onRemove,
  onPageChange
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
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(pageData.total / pageData.page_size));

  return (
    <Card className="ds-table-card table-scroll">
      <DataTable className="units-fit-table">
        <thead>
          <tr>
            <th className="units-col-info">房源信息</th>
            <th className="units-col-location">位置</th>
            <th className="units-col-purpose">用途</th>
            <th className="units-col-area">面积</th>
            <th className="units-col-status">状态</th>
            <th className="units-col-lease">租赁信息</th>
            <th className="units-col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {pageData.items.map((row) => (
            <tr key={row.id}>
              <td className="units-col-info">
                <div className="ds-cell-stack">
                  <span className="ds-cell-title">{row.unitName}</span>
                  <span className="ds-cell-meta">{row.unitCode}</span>
                </div>
              </td>
              <td className="units-col-location">
                <div className="ds-cell-stack">
                  <span>{row.building ? `${row.building.buildingCode} ${row.building.buildingName}` : "-"}</span>
                  <span className="ds-cell-meta">{row.floor ? `${row.floor.floorCode} ${row.floor.floorName}` : "-"}</span>
                </div>
              </td>
              <td className="units-col-purpose">{dictLabel(dicts.unit_usage_type, row.usageType)}</td>
              <td className="units-col-area">
                <div className="ds-cell-stack">
                  <span>{formatArea(row.unitArea)}</span>
                  <span className="ds-cell-meta">使用 {formatArea(row.useArea)}</span>
                </div>
              </td>
              <td className="units-col-status">
                <div className="ds-cell-stack">
                  <DictBadge items={dicts.unit_rental_status} value={row.rentalStatus} />
                  <DictBadge items={dicts.unit_fitting_status} value={row.fittingStatus} />
                </div>
              </td>
              <td className="units-col-lease">
                <div className="ds-cell-stack">
                  <span>{canViewRefPrice ? formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, row.refPrice)) : "-"}</span>
                  <span className="ds-cell-meta">{row.availableDate ? `可租 ${row.availableDate}` : `更新 ${formatDateTime(row.updateTime)}`}</span>
                </div>
              </td>
              <td className="units-col-actions">
                <DataTableActions className="data-table-actions">
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
                </DataTableActions>
              </td>
            </tr>
          ))}
          {pageData.items.length === 0 ? (
            <tr>
              <td colSpan={7}>暂无房源数据</td>
            </tr>
          ) : null}
        </tbody>
      </DataTable>
      <div className="task-item ds-table-footer">
        <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
        <span>
          <button type="button" disabled={pageData.page <= 1} onClick={() => onPageChange(Math.max(1, pageData.page - 1))}>上一页</button>
          <button
            type="button"
            disabled={pageData.page >= totalPages}
            onClick={() => onPageChange(pageData.page + 1)}
          >
            下一页
          </button>
        </span>
      </div>
    </Card>
  );
}
