import { Card } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Plus, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import type { DictItemRow, FilterState, ParkTenantRow, UnitRow, UserRow } from "../types";
import { displayUserName } from "../lib/workorder-page-utils";

interface WorkOrdersPageActionsProps {
  onRefresh: () => void;
  onCreate: () => void;
}

interface WorkOrdersToolbarProps {
  filters: FilterState;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  urgencyItems: DictItemRow[];
  users: UserRow[];
  parkTenants: ParkTenantRow[];
  units: UnitRow[];
  onFilterChange: (patch: Partial<FilterState>) => void;
  onSubmit: () => void;
}

export function WorkOrdersPageActions({ onRefresh, onCreate }: WorkOrdersPageActionsProps) {
  return (
    <div className="page-actions">
      <button className="primary-button secondary-button" type="button" onClick={onRefresh}>
        <RefreshCw size={16} />
        刷新
      </button>
      <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.WORKORDER_CREATE} type="button" onClick={onCreate}>
        <Plus size={16} />
        新增工单
      </PermissionButton>
    </div>
  );
}

export function WorkOrdersToolbar({
  filters,
  statusItems,
  typeItems,
  priorityItems,
  urgencyItems,
  users,
  parkTenants,
  units,
  onFilterChange,
  onSubmit
}: WorkOrdersToolbarProps) {
  return (
    <Card>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="dashboard-grid">
          <ToolbarField label="关键词">
            <input value={filters.keyword} onChange={(event) => onFilterChange({ keyword: event.target.value })} placeholder="编号 / 标题 / 位置 / 人员" />
          </ToolbarField>
          <ToolbarField label="状态">
            <ToolbarSelect value={filters.status} onChange={(value) => onFilterChange({ status: value })} items={statusItems} allLabel="全部状态" />
          </ToolbarField>
          <ToolbarField label="工单类型">
            <ToolbarSelect value={filters.woType} onChange={(value) => onFilterChange({ woType: value })} items={typeItems} allLabel="全部类型" />
          </ToolbarField>
          <ToolbarField label="优先级">
            <ToolbarSelect value={filters.priority} onChange={(value) => onFilterChange({ priority: value })} items={priorityItems} allLabel="全部优先级" />
          </ToolbarField>
          <ToolbarField label="紧急程度">
            <ToolbarSelect value={filters.urgency} onChange={(value) => onFilterChange({ urgency: value })} items={urgencyItems} allLabel="全部紧急程度" />
          </ToolbarField>
          <ToolbarField label="处理人">
            <select value={filters.assigneeId} onChange={(event) => onFilterChange({ assigneeId: event.target.value })}>
              <option value="">全部处理人</option>
              {users.map((user) => <option key={user.id} value={user.id}>{displayUserName(user)}</option>)}
            </select>
          </ToolbarField>
          <ToolbarField label="租户企业">
            <select value={filters.parkTenantId} onChange={(event) => onFilterChange({ parkTenantId: event.target.value })}>
              <option value="">全部企业</option>
              {parkTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>)}
            </select>
          </ToolbarField>
          <ToolbarField label="房源">
            <select value={filters.unitId} onChange={(event) => onFilterChange({ unitId: event.target.value })}>
              <option value="">全部房源</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitCode} {unit.unitName}</option>)}
            </select>
          </ToolbarField>
          <ToolbarField label="是否超时">
            <select value={filters.overdueOnly} onChange={(event) => onFilterChange({ overdueOnly: event.target.value })}>
              <option value="">全部</option>
              <option value="true">仅超时</option>
            </select>
          </ToolbarField>
          <ToolbarField label="开始日期">
            <input type="date" value={filters.startDate} onChange={(event) => onFilterChange({ startDate: event.target.value })} />
          </ToolbarField>
          <ToolbarField label="结束日期">
            <input type="date" value={filters.endDate} onChange={(event) => onFilterChange({ endDate: event.target.value })} />
          </ToolbarField>
        </div>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            <Search size={16} />
            查询
          </button>
        </div>
      </form>
    </Card>
  );
}

function ToolbarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ToolbarSelect({
  value,
  items,
  allLabel,
  onChange
}: {
  value: string;
  items: DictItemRow[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{allLabel}</option>
      {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
    </select>
  );
}
