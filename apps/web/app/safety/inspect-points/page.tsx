"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  StatusPill
} from "@jinhu/ui";
import { Edit3, Eye, Plus, QrCode, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";

const SAFETY_MODULE = "safety";
const INSPECT_POINT_ENTITY = "inspect_point";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

interface FloorRow {
  id: string;
  floorCode: string;
  floorName: string;
  buildingId: string;
}

interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
  buildingId?: string | null;
  floorId?: string | null;
}

interface ParkTenantRow {
  id: string;
  companyName: string;
  parkTenantCode?: string | null;
}

interface InspectPointRow {
  id: string;
  pointCode: string;
  pointName: string;
  pointType: string;
  riskLevel: string;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  location: string | null;
  gpsLng: string | null;
  gpsLat: string | null;
  qrCode: string | null;
  checkMethod: string | null;
  requiredPhotoCount: number;
  requiredScan: boolean;
  requiredGps: boolean;
  status: string;
  sortNo: number;
  remark: string | null;
  updateTime: string;
  building?: BuildingRow | null;
  floor?: FloorRow | null;
  unit?: UnitRow | null;
  parkTenant?: ParkTenantRow | null;
}

interface InspectPointForm {
  pointCode: string;
  pointName: string;
  pointType: string;
  riskLevel: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  parkTenantId: string;
  location: string;
  gpsLng: string;
  gpsLat: string;
  qrCode: string;
  checkMethod: string;
  requiredPhotoCount: string;
  requiredScan: boolean;
  requiredGps: boolean;
  status: string;
  sortNo: string;
  remark: string;
}

interface Filters {
  keyword: string;
  pointType: string;
  riskLevel: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  parkTenantId: string;
  status: string;
}

interface QrCodePayload {
  id: string;
  point_code: string;
  qr_code: string;
  content: string;
  data_url: string | null;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<InspectPointRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  pointType: "",
  riskLevel: "",
  buildingId: "",
  floorId: "",
  unitId: "",
  parkTenantId: "",
  status: ""
};

const emptyForm: InspectPointForm = {
  pointCode: "",
  pointName: "",
  pointType: "",
  riskLevel: "",
  buildingId: "",
  floorId: "",
  unitId: "",
  parkTenantId: "",
  location: "",
  gpsLng: "",
  gpsLat: "",
  qrCode: "",
  checkMethod: "",
  requiredPhotoCount: "0",
  requiredScan: false,
  requiredGps: false,
  status: "enabled",
  sortNo: "0",
  remark: ""
};

export default function SafetyInspectPointsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<InspectPointRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [form, setForm] = useState<InspectPointForm>(emptyForm);
  const [editing, setEditing] = useState<InspectPointRow | null>(null);
  const [viewing, setViewing] = useState<InspectPointRow | null>(null);
  const [qrPayload, setQrPayload] = useState<QrCodePayload | null>(null);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const pointTypeItems = dicts.safety_inspect_point_type ?? [];
  const riskItems = dicts.safety_risk_level ?? [];
  const checkMethodItems = dicts.safety_check_method ?? [];
  const statusItems = dicts.safety_inspect_point_status ?? [];
  const canViewLocation = canViewField(authUser, SAFETY_MODULE, INSPECT_POINT_ENTITY, "location");
  const canViewQrCode = canViewField(authUser, SAFETY_MODULE, INSPECT_POINT_ENTITY, "qrCode");

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "sort_no" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.pointType) params.set("point_type", filters.pointType);
    if (filters.riskLevel) params.set("risk_level", filters.riskLevel);
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.floorId) params.set("floor_id", filters.floorId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<InspectPointRow>>(`/safety/inspect-points?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["safety_inspect_point_type", "safety_risk_level", "safety_check_method", "safety_inspect_point_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadReferenceData = useCallback(async () => {
    const [buildingResponse, floorResponse, unitResponse, tenantResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() })
    ]);
    if (buildingResponse.status === "fulfilled") setBuildings(buildingResponse.value.data.items);
    if (floorResponse.status === "fulfilled") setFloors(floorResponse.value.data.items);
    if (unitResponse.status === "fulfilled") setUnits(unitResponse.value.data.items);
    if (tenantResponse.status === "fulfilled") setParkTenants(tenantResponse.value.data.items);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferenceData().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferenceData]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, pointType: pointTypeItems[0]?.itemValue ?? "", riskLevel: riskItems[0]?.itemValue ?? "", status: "enabled" });
  }

  function openEdit(row: InspectPointRow) {
    setEditing(row);
    setForm({
      pointCode: row.pointCode,
      pointName: row.pointName,
      pointType: row.pointType,
      riskLevel: row.riskLevel,
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      unitId: row.unitId ?? "",
      parkTenantId: row.parkTenantId ?? "",
      location: row.location ?? "",
      gpsLng: row.gpsLng ?? "",
      gpsLat: row.gpsLat ?? "",
      qrCode: row.qrCode ?? "",
      checkMethod: row.checkMethod ?? "",
      requiredPhotoCount: String(row.requiredPhotoCount ?? 0),
      requiredScan: row.requiredScan,
      requiredGps: row.requiredGps,
      status: row.status,
      sortNo: String(row.sortNo ?? 0),
      remark: row.remark ?? ""
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = buildPayload(form);
    const path = editing ? `/safety/inspect-points/${editing.id}` : "/safety/inspect-points";
    await apiRequest<InspectPointRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-inspect-point-update" : "safety-inspect-point-create"),
      body
    });
    setMessage(editing ? "巡检点位已更新" : "巡检点位已新增");
    setEditing(null);
    setForm(emptyForm);
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: InspectPointRow) {
    if (!window.confirm(`确认删除巡检点位 ${row.pointName}？`)) return;
    await apiRequest<{ id: string }>(`/safety/inspect-points/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-point-delete")
    });
    setMessage("巡检点位已删除");
    await load(pageData.page);
  }

  async function openQrCode(row: InspectPointRow) {
    const response = await apiRequest<QrCodePayload>(`/safety/inspect-points/${row.id}/qrcode`, {
      token: getAccessToken()
    });
    setQrPayload(response.data);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_READ} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>巡检点位</strong>
            <span>维护安全巡检点位、二维码、定位、拍照要求和风险等级</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增点位
            </PermissionButton>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <Field label="关键词">
                <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="点位编码 / 名称 / 位置" />
              </Field>
              <SelectField label="点位类型" value={filters.pointType} items={pointTypeItems} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, pointType: value }))} />
              <SelectField label="风险等级" value={filters.riskLevel} items={riskItems} allLabel="全部风险" onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} />
              <SelectRefField label="楼栋" value={filters.buildingId} allLabel="全部楼栋" items={buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` }))} onChange={(value) => setFilters((current) => ({ ...current, buildingId: value }))} />
              <SelectRefField label="楼层" value={filters.floorId} allLabel="全部楼层" items={floors.map((item) => ({ id: item.id, label: `${item.floorCode} ${item.floorName}` }))} onChange={(value) => setFilters((current) => ({ ...current, floorId: value }))} />
              <SelectRefField label="房源" value={filters.unitId} allLabel="全部房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFilters((current) => ({ ...current, unitId: value }))} />
              <SelectRefField label="租户企业" value={filters.parkTenantId} allLabel="全部企业" items={parkTenants.map((item) => ({ id: item.id, label: item.companyName }))} onChange={(value) => setFilters((current) => ({ ...current, parkTenantId: value }))} />
              <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
            </div>
            <div className="filter-actions">
              <button className="primary-button" type="submit">
                <Search size={16} />
                查询
              </button>
            </div>
          </form>
        </Card>

        <Card className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>点位编码</th>
                <th>点位名称</th>
                <th>类型</th>
                <th>风险</th>
                <th>位置</th>
                <th>关联房源</th>
                <th>租户企业</th>
                <th>扫码</th>
                <th>定位</th>
                <th>照片</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.pointCode}</td>
                  <td>{row.pointName}</td>
                  <td><StatusPill dictCode="safety_inspect_point_type" value={row.pointType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_risk_level" value={row.riskLevel} dicts={dicts} /></td>
                  <td>{displaySecuredField(authUser, SAFETY_MODULE, INSPECT_POINT_ENTITY, "location", row.location)}</td>
                  <td>{row.unit ? `${row.unit.unitCode} ${row.unit.unitName}` : "-"}</td>
                  <td>{row.parkTenant?.companyName ?? "-"}</td>
                  <td>{row.requiredScan ? "是" : "否"}</td>
                  <td>{row.requiredGps ? "是" : "否"}</td>
                  <td>{row.requiredPhotoCount}</td>
                  <td><StatusPill dictCode="safety_inspect_point_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="row-action-button" type="button" onClick={() => setViewing(row)} title="查看">
                        <Eye size={16} />
                        查看
                      </button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_UPDATE} type="button" onClick={() => openEdit(row)} title="编辑">
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_QRCODE} type="button" onClick={() => void openQrCode(row).catch((error: Error) => setMessage(error.message))} title="二维码">
                        <QrCode size={16} />
                        二维码
                      </PermissionButton>
                      <PermissionButton className="row-action-button row-action-button-danger" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))} title="删除">
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={12}><EmptyState /></td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="pagination">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <button className="pagination-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1).catch((error: Error) => setMessage(error.message))}>上一页</button>
            <button className="pagination-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {(form !== emptyForm || editing) ? (
          <Drawer size="lg" onClose={() => { setEditing(null); setForm(emptyForm); }}>
            <DrawerHeader eyebrow="现场安全" title={editing ? "编辑巡检点位" : "新增巡检点位"} description="点位可关联资产、租户企业和公共区域，二维码内容可自动使用点位编码。" onClose={() => { setEditing(null); setForm(emptyForm); }} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="点位编码">
                  <input value={form.pointCode} onChange={(event) => setFormValue("pointCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="点位名称">
                  <input required value={form.pointName} onChange={(event) => setFormValue("pointName", event.target.value)} />
                </Field>
                <SelectField label="点位类型" value={form.pointType} items={pointTypeItems} allLabel="请选择类型" required onChange={(value) => setFormValue("pointType", value)} />
                <SelectField label="风险等级" value={form.riskLevel} items={riskItems} allLabel="请选择风险" required onChange={(value) => setFormValue("riskLevel", value)} />
                <SelectRefField label="楼栋" value={form.buildingId} allLabel="不关联楼栋" items={buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` }))} onChange={(value) => setFormValue("buildingId", value)} />
                <SelectRefField label="楼层" value={form.floorId} allLabel="不关联楼层" items={floors.map((item) => ({ id: item.id, label: `${item.floorCode} ${item.floorName}` }))} onChange={(value) => setFormValue("floorId", value)} />
                <SelectRefField label="房源" value={form.unitId} allLabel="不关联房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFormValue("unitId", value)} />
                <SelectRefField label="租户企业" value={form.parkTenantId} allLabel="不关联企业" items={parkTenants.map((item) => ({ id: item.id, label: item.companyName }))} onChange={(value) => setFormValue("parkTenantId", value)} />
                <Field label="位置描述">
                  <input value={form.location} onChange={(event) => setFormValue("location", event.target.value)} />
                </Field>
                <Field label="巡检方式">
                  <select value={form.checkMethod} onChange={(event) => setFormValue("checkMethod", event.target.value)}>
                    <option value="">不指定</option>
                    {checkMethodItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                  </select>
                </Field>
                <Field label="GPS 经度">
                  <input type="number" step="0.000001" value={form.gpsLng} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("gpsLng", event.target.value)} />
                </Field>
                <Field label="GPS 纬度">
                  <input type="number" step="0.000001" value={form.gpsLat} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("gpsLat", event.target.value)} />
                </Field>
                <Field label="最少照片数">
                  <input type="number" min={0} max={50} value={form.requiredPhotoCount} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("requiredPhotoCount", event.target.value)} />
                </Field>
                <Field label="排序">
                  <input type="number" min={0} value={form.sortNo} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("sortNo", event.target.value)} />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setFormValue("status", value)} />
                <Field label="二维码内容">
                  <input value={form.qrCode} onChange={(event) => setFormValue("qrCode", event.target.value)} placeholder="留空使用点位编码" />
                </Field>
                <Field label="执行要求">
                  <div className="checkbox-list">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={form.requiredScan} onChange={(event) => setFormValue("requiredScan", event.target.checked)} />
                      <span>强制扫码</span>
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={form.requiredGps} onChange={(event) => setFormValue("requiredGps", event.target.checked)} />
                      <span>强制定位</span>
                    </label>
                  </div>
                </Field>
                <Field label="备注">
                  <textarea value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {viewing ? (
          <Drawer size="md" onClose={() => setViewing(null)}>
            <DrawerHeader eyebrow="巡检点位详情" title={viewing.pointName} description={`${viewing.pointCode} · ${viewing.location ?? "未填写位置"}`} onClose={() => setViewing(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="点位编码" value={viewing.pointCode} />
              <DrawerDetailItem label="点位类型" value={<StatusPill dictCode="safety_inspect_point_type" value={viewing.pointType} dicts={dicts} />} />
              <DrawerDetailItem label="风险等级" value={<StatusPill dictCode="safety_risk_level" value={viewing.riskLevel} dicts={dicts} />} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_inspect_point_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="位置" value={canViewLocation ? viewing.location ?? "-" : "-"} />
              <DrawerDetailItem label="楼栋" value={viewing.building ? `${viewing.building.buildingCode} ${viewing.building.buildingName}` : "-"} />
              <DrawerDetailItem label="楼层" value={viewing.floor ? `${viewing.floor.floorCode} ${viewing.floor.floorName}` : "-"} />
              <DrawerDetailItem label="房源" value={viewing.unit ? `${viewing.unit.unitCode} ${viewing.unit.unitName}` : "-"} />
              <DrawerDetailItem label="租户企业" value={viewing.parkTenant?.companyName ?? "-"} />
              <DrawerDetailItem label="强制扫码" value={viewing.requiredScan ? "是" : "否"} />
              <DrawerDetailItem label="强制定位" value={viewing.requiredGps ? "是" : "否"} />
              <DrawerDetailItem label="最少照片数" value={viewing.requiredPhotoCount} />
              <DrawerDetailItem label="二维码内容" value={canViewQrCode ? viewing.qrCode ?? viewing.pointCode : "-"} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}

        {qrPayload ? (
          <Drawer size="md" onClose={() => setQrPayload(null)}>
            <DrawerHeader eyebrow="点位二维码" title={qrPayload.point_code} description="用于巡检扫码定位到当前点位。" onClose={() => setQrPayload(null)} />
            <div className="qr-code-card">
              {qrPayload.data_url ? <img className="qr-code-image" alt="巡检点位二维码" src={qrPayload.data_url} /> : null}
              <code className="qr-code-value">{qrPayload.content}</code>
            </div>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function setFormValue<K extends keyof InspectPointForm>(key: K, value: InspectPointForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function buildPayload(form: InspectPointForm) {
  return {
    point_code: form.pointCode.trim() || undefined,
    point_name: form.pointName.trim(),
    point_type: form.pointType,
    risk_level: form.riskLevel,
    building_id: form.buildingId || undefined,
    floor_id: form.floorId || undefined,
    unit_id: form.unitId || undefined,
    park_tenant_id: form.parkTenantId || undefined,
    location: form.location.trim() || undefined,
    gps_lng: form.gpsLng === "" ? undefined : Number(form.gpsLng),
    gps_lat: form.gpsLat === "" ? undefined : Number(form.gpsLat),
    qr_code: form.qrCode.trim() || undefined,
    check_method: form.checkMethod || undefined,
    required_photo_count: Number(form.requiredPhotoCount || 0),
    required_scan: form.requiredScan,
    required_gps: form.requiredGps,
    status: form.status || "enabled",
    sort_no: Number(form.sortNo || 0),
    remark: form.remark.trim() || undefined
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  items,
  allLabel,
  required,
  onChange
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  allLabel: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function SelectRefField({
  label,
  value,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </Field>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无巡检点位</div>;
}

function ForbiddenInline() {
  return <main className="content"><Card><div className="empty-state">403，无巡检点位访问权限或 safety 模块未授权</div></Card></main>;
}

function displaySecuredField(user: ReturnType<typeof useAuthUser>, moduleName: string, entityName: string, fieldKey: string, value: unknown): ReactNode {
  if (!canViewField(user, moduleName, entityName, fieldKey)) {
    return "-";
  }
  return maskField(user, moduleName, entityName, fieldKey, value) as ReactNode ?? "-";
}
