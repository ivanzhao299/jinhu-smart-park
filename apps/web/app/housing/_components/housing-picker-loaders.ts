import {
  type HousingEnergyMeterCandidateListResponse,
  type HousingLeaseListResponse,
  type HousingTenantListResponse,
  type HousingUnitCandidateListResponse
} from "@jinhu/shared";
import type {
  RemoteEntityLoadInput,
  RemoteEntityPage
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

function pickerPage<T>(
  response: {
    items: T[];
    page: number;
    page_size: number;
    total: number;
  },
  map: (item: T) => RemoteEntityPage["items"][number]
): RemoteEntityPage {
  return {
    items: response.items.map(map),
    page: response.page,
    pageSize: response.page_size,
    total: response.total
  };
}

function pickerQuery(input: RemoteEntityLoadInput): string {
  return new URLSearchParams({
    keyword: input.query,
    page: String(input.page),
    page_size: String(input.pageSize)
  }).toString();
}

export async function loadHousingTenants(
  input: RemoteEntityLoadInput
): Promise<RemoteEntityPage> {
  const response = await apiRequest<HousingTenantListResponse>(
    `/housing/tenants?${pickerQuery(input)}`,
    { token: getAccessToken(), signal: input.signal }
  );
  return pickerPage(response.data, (item) => ({
    id: item.id,
    label: item.displayName,
    secondaryLabel: item.mobile ?? item.identityNumberMasked ?? undefined
  }));
}

export async function loadHousingUnits(
  input: RemoteEntityLoadInput
): Promise<RemoteEntityPage> {
  const response = await apiRequest<HousingUnitCandidateListResponse>(
    `/housing/unit-candidates?${pickerQuery(input)}`,
    { token: getAccessToken(), signal: input.signal }
  );
  return pickerPage(response.data, (unit) => ({
    id: unit.id,
    label: `${unit.unitCode} · ${unit.unitName}`
  }));
}

export async function loadHousingLeases(
  input: RemoteEntityLoadInput
): Promise<RemoteEntityPage> {
  const response = await apiRequest<HousingLeaseListResponse>(
    `/housing/leases?${pickerQuery(input)}`,
    { token: getAccessToken(), signal: input.signal }
  );
  return pickerPage(response.data, (lease) => ({
    id: lease.id,
    label: lease.leaseCode,
    secondaryLabel: `${lease.unitCode ?? lease.unitName ?? "未命名房源"} · ${lease.tenantDisplayName ?? "未命名租客"}`
  }));
}

export async function loadHousingMeters(
  leaseId: string,
  input: RemoteEntityLoadInput
): Promise<RemoteEntityPage> {
  const response = await apiRequest<HousingEnergyMeterCandidateListResponse>(
    `/housing/leases/${encodeURIComponent(leaseId)}/energy-meter-candidates?${pickerQuery(input)}`,
    { token: getAccessToken(), signal: input.signal }
  );
  return pickerPage(response.data, (meter) => ({
    id: meter.id,
    label: `${meter.meterCode} · ${meter.meterName}`,
    secondaryLabel: `${meter.meterType} · ${meter.unit} · 倍率 ${meter.multiplier}`
  }));
}
