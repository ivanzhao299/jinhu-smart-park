import { Card, Drawer, DrawerFooter, DrawerHeader } from "@jinhu/ui";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiRequest, createIdempotencyKey } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionButton } from "../../../../components/auth/PermissionButton";

interface Candidate {
  assetUnitId: string; unitCode: string; unitName: string; unitNo: string;
  buildingArea: string; rentableArea: string; assetBuildingId: string; buildingName: string;
  assetFloorId: string; floorName: string; operatingBuildingId: string | null;
  operatingFloorId: string | null; operatingUnitId: string | null;
}

export function AssetSpaceConversionDrawer({ onClose, onCreated }: {
  onClose: () => void; onCreated: () => void;
}) {
  const [items, setItems] = useState<Candidate[]>([]);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "100" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    const response = await apiRequest<PaginatedResult<Candidate>>(`/assets/operating-space-candidates?${params}`, { token: getAccessToken() });
    setItems(response.data.items);
  }, [keyword]);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  async function run(item: Candidate, level: "building" | "floor" | "unit") {
    setBusy(true); setMessage("");
    try {
      const common = { token: getAccessToken(), method: "POST" as const, idempotencyKey: createIdempotencyKey(`asset-${level}-operating`) };
      if (level === "building") await apiRequest(`/assets/buildings/${item.assetBuildingId}/operating-building`, { ...common, body: { mode: "create", reason: "从物理资产启用运营楼栋" } });
      if (level === "floor") await apiRequest(`/assets/floors/${item.assetFloorId}/operating-floor`, { ...common, body: { mode: "create", reason: "从物理资产启用运营楼层" } });
      if (level === "unit") {
        await apiRequest(`/assets/units/${item.assetUnitId}/operating-unit`, { ...common, body: { usageType: 10, rentalStatus: 10, fittingStatus: 10, useArea: Number(item.rentableArea), reason: "从物理资产创建运营房号" } });
        onCreated();
      }
      setMessage("操作成功，空间映射已记录"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "空间启用失败"); }
    finally { setBusy(false); }
  }

  return <Drawer size="lg" onClose={onClose}>
    <DrawerHeader eyebrow="统一空间底座" title="从物理资产启用运营房源" description="按楼栋 → 楼层 → 房号逐级确认，系统不会自动猜测父级关系" onClose={onClose} closeIcon={<X size={18} />} />
    <div className="drawer-body form-stack">
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <div className="field"><label htmlFor="asset-space-keyword">搜索物理房源</label><input id="asset-space-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="房号、楼栋或楼层" /></div>
        <button className="secondary-button" type="submit">查询</button>
      </form>
      {message ? <p className="form-message" role="alert">{message}</p> : null}
      <div className="ds-mobile-record-list">
        {items.map((item) => <Card className="ds-mobile-record" key={item.assetUnitId}>
          <strong>{item.unitCode} · {item.unitName}</strong><span>{item.buildingName} / {item.floorName} / {item.unitNo}</span>
          <span>建筑面积 {item.buildingArea}㎡ · 可用面积 {item.rentableArea}㎡</span>
          <div className="data-table-actions">
            <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ASSET_BUILDING_CREATE} type="button" disabled={Boolean(item.operatingBuildingId) || busy} onClick={() => void run(item, "building")}>{item.operatingBuildingId ? "楼栋已关联" : "1. 启用楼栋"}</PermissionButton>
            <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ASSET_FLOOR_CREATE} type="button" disabled={!item.operatingBuildingId || Boolean(item.operatingFloorId) || busy} onClick={() => void run(item, "floor")}>{item.operatingFloorId ? "楼层已关联" : "2. 启用楼层"}</PermissionButton>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ASSET_UNIT_CREATE} type="button" disabled={!item.operatingFloorId || Boolean(item.operatingUnitId) || busy} onClick={() => void run(item, "unit")}>{item.operatingUnitId ? "房号已创建" : "3. 创建运营房号"}</PermissionButton>
          </div>
        </Card>)}
        {items.length === 0 ? <p>暂无可用物理房源。</p> : null}
      </div>
    </div>
    <DrawerFooter><button className="secondary-button" type="button" onClick={onClose}>关闭</button></DrawerFooter>
  </Drawer>;
}
