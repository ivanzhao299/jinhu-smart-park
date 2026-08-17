"use client";

import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";
import { getAccessToken } from "./authz";

export interface ReferenceOrgOption {
  id: string;
  orgCode: string;
  orgName: string;
  status: string;
}

export interface ReferenceBuildingOption {
  id: string;
  buildingCode: string;
  buildingName: string;
}

export interface ReferenceFloorOption {
  id: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
}

export interface ReferenceUnitOption {
  id: string;
  code: string | null;
  buildingId: string;
  floorId: string;
  unitCode: string;
  unitName: string;
  currentTenantId?: string | null;
  currentTenantName?: string | null;
  current_tenant_id?: string | null;
  current_tenant_name?: string | null;
  building?: { buildingCode: string; buildingName: string } | null;
  floor?: { floorCode: string; floorName: string } | null;
}

export interface ReferenceParkTenantOption {
  id: string;
  companyName: string;
  parkTenantCode: string;
  contactName?: string | null;
  contactMobile?: string | null;
}

export interface ReferenceUserOption {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  mobile?: string;
  status: string;
}

interface RawReferenceFormOptionsResponse {
  orgs: ReferenceOrgOption[];
  buildings: ReferenceBuildingOption[];
  floors: ReferenceFloorOption[];
  units: Array<ReferenceUnitOption & { currentTenantId?: string | null; currentTenantName?: string | null; current_tenant_id?: string | null; current_tenant_name?: string | null }>;
  parkTenants: Array<ReferenceParkTenantOption & { contactName?: string | null; contactMobile?: string | null }>;
  users: Array<{ id: string; username: string; displayName: string | null; realName: string | null; mobile: string | null; status: string }>;
}

export interface ReferenceFormOptionsResponse {
  orgs: ReferenceOrgOption[];
  buildings: ReferenceBuildingOption[];
  floors: ReferenceFloorOption[];
  units: ReferenceUnitOption[];
  parkTenants: ReferenceParkTenantOption[];
  users: ReferenceUserOption[];
}

interface RawReferenceUsersResponse {
  items: Array<{ id: string; username: string; displayName: string | null; realName: string | null; mobile: string | null; status: string }>;
  page: number;
  page_size: number;
  total: number;
}

export async function fetchReferenceFormOptions(): Promise<ReferenceFormOptionsResponse> {
  const response = await apiRequest<RawReferenceFormOptionsResponse>("/reference-data/form-options", {
    token: getAccessToken()
  });
  return {
    orgs: response.data.orgs,
    buildings: response.data.buildings,
    floors: response.data.floors,
    units: response.data.units.map((item) => ({
      ...item,
      code: item.code ?? null,
      currentTenantId: item.currentTenantId ?? item.current_tenant_id ?? undefined,
      currentTenantName: item.currentTenantName ?? item.current_tenant_name ?? undefined
    })),
    parkTenants: response.data.parkTenants.map((item) => ({
      ...item,
      contactName: item.contactName ?? undefined,
      contactMobile: item.contactMobile ?? undefined
    })),
    users: response.data.users.map((item) => ({
      id: item.id,
      username: item.username,
      displayName: item.displayName ?? item.username,
      realName: item.realName ?? item.displayName ?? item.username,
      mobile: item.mobile ?? undefined,
      status: item.status
    }))
  };
}

export async function fetchReferenceUsers(keyword = ""): Promise<ReferenceUserOption[]> {
  const token = getAccessToken();
  const pageSize = 100;
  const users: ReferenceUserOption[] = [];
  let page = 1;
  let total = 0;
  do {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), status: "enabled" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    const response = await apiRequest<PaginatedResult<ReferenceUserOption> | RawReferenceUsersResponse>(`/reference-data/users?${params.toString()}`, { token });
    const normalized = response.data.items.map((item) => ({
      id: item.id,
      username: item.username,
      displayName: item.displayName ?? item.username,
      realName: item.realName ?? item.displayName ?? item.username,
      mobile: item.mobile ?? undefined,
      status: item.status
    }));
    users.push(...normalized);
    total = response.data.total;
    if (response.data.items.length === 0) break;
    page += 1;
  } while (users.length < total);
  return users;
}
