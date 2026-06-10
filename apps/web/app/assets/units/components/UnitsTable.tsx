import { Card, DataTable } from "@jinhu/ui";
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
    <Card className=" table-scroll">
      <DataTable >
        <thead>
          <tr>
            <th>房源编码</th>
            <th>房源名称</th>
            <th>楼栋</th>
            <th>楼层</th>
            <th>用途</th>
            <th>建筑面积</th>
            <th>使用面积</th>
            <th>出租状态</th>
            <th>装修状态</th>
            <th>参考租金</th>
            <th>可租日期</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {pageData.items.map((row) => (
            <tr key={row.id}>
              <td>{row.unitCode}</td>
              <td>{row.unitName}</td>
              <td>{row.building ? `${row.building.buildingCode} ${row.building.buildingName}` : "-"}</td>
              <td>{row.floor ? `${row.floor.floorCode} ${row.floor.floorName}` : "-"}</td>
              <td>{dictLabel(dicts.unit_usage_type, row.usageType)}</td>
              <td>{formatArea(row.unitArea)}</td>
              <td>{formatArea(row.useArea)}</td>
              <td><DictBadge items={dicts.unit_rental_status} value={row.rentalStatus} /></td>
              <td><DictBadge items={dicts.unit_fitting_status} value={row.fittingStatus} /></td>
              <td>{canViewRefPrice ? formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, row.refPrice)) : "-"}</td>
              <td>{row.availableDate ?? "-"}</td>
              <td>{formatDateTime(row.updateTime)}</td>
              <td>
                <span className="data-table-actions">
                  <button title="详情" type="button" onClick={() => onView(row)}><Eye size={16} /></button>
                  <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_UPDATE} title="编辑" type="button" onClick={() => onEdit(row)}>
                    <Edit3 size={16} />
                  </PermissionButton>
                  {canEditPhotoUrls ? (
                    <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_UPDATE} title="附件" type="button" onClick={() => onOpenAttachments(row)}>
                      <FileImage size={16} />
                    </PermissionButton>
                  ) : null}
                  <UnitStatusActions
                    onOpenTransition={() => onOpenTransition(row)}
                    onOpenStatusLogs={() => onOpenStatusLogs(row)}
                  />
                  <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_DELETE} title="删除" type="button" onClick={() => onRemove(row)}>
                    <Trash2 size={16} />
                  </PermissionButton>
                </span>
              </td>
            </tr>
          ))}
          {pageData.items.length === 0 ? (
            <tr>
              <td colSpan={13}>暂无房源数据</td>
            </tr>
          ) : null}
        </tbody>
      </DataTable>
      <div className="task-item">
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
