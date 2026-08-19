import { Card } from "@jinhu/ui";
import { Search } from "lucide-react";
import type { BuildingRow, DictItemRow, FloorRow, UnitFilters, UnitParkOption } from "../types";
import { DictSelect, NumberField, SelectField, TextField } from "./UnitPageFields";

export function UnitsToolbar({
  filters,
  listParkId,
  listParkOptions,
  listParkSwitching,
  buildings,
  visibleFloors,
  dicts,
  onListParkChange,
  onFilterChange,
  onSubmit
}: {
  filters: UnitFilters;
  listParkId: string;
  listParkOptions: UnitParkOption[];
  listParkSwitching: boolean;
  buildings: BuildingRow[];
  visibleFloors: FloorRow[];
  dicts: Record<string, DictItemRow[]>;
  onListParkChange: (parkId: string) => void;
  onFilterChange: (key: keyof UnitFilters, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card >
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="dashboard-grid">
          <SelectField label="查看园区" value={listParkId} disabled={listParkSwitching} onChange={onListParkChange}>
            {listParkOptions.map((park) => (
              <option key={park.park_id} value={park.park_id}>{park.park_code ? `${park.park_code} ` : ""}{park.park_name}</option>
            ))}
          </SelectField>
          <SelectField label="楼栋" value={filters.buildingId} onChange={(value) => onFilterChange("buildingId", value)}>
            <option value="">全部楼栋</option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
            ))}
          </SelectField>
          <SelectField label="楼层" value={filters.floorId} onChange={(value) => onFilterChange("floorId", value)}>
            <option value="">全部楼层</option>
            {visibleFloors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.floorCode} {floor.floorName}</option>
            ))}
          </SelectField>
          <DictSelect label="用途" value={filters.usageType} items={dicts.unit_usage_type} onChange={(value) => onFilterChange("usageType", value)} />
          <DictSelect label="出租状态" value={filters.rentalStatus} items={dicts.unit_rental_status} onChange={(value) => onFilterChange("rentalStatus", value)} />
          <DictSelect label="装修状态" value={filters.fittingStatus} items={dicts.unit_fitting_status} onChange={(value) => onFilterChange("fittingStatus", value)} />
          <TextField label="关键词" value={filters.keyword} placeholder="房源编码或名称" onChange={(value) => onFilterChange("keyword", value)} />
          <NumberField label="最小面积" value={filters.minArea} step="0.01" onChange={(value) => onFilterChange("minArea", value)} />
          <NumberField label="最大面积" value={filters.maxArea} step="0.01" onChange={(value) => onFilterChange("maxArea", value)} />
        </div>
        <button className="primary-button" type="submit">
          <Search size={16} />
          查询
        </button>
      </form>
    </Card>
  );
}
