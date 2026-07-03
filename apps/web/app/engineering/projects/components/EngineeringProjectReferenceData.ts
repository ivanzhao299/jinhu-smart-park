"use client";

import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "../../../../lib/api-client";
import type { EngineeringProject } from "../../../../lib/engineering-projects-types";

export interface OrgRow {
  id: string;
  orgCode: string;
  orgName: string;
  status?: string;
}

export interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

export interface FloorRow {
  id: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
}

export interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
  buildingId?: string | null;
  floorId?: string | null;
}

export interface UserRow {
  id: string;
  username: string;
  displayName?: string | null;
  realName?: string | null;
  status?: string;
}

export interface ProjectRow {
  id: string;
  projectCode: string;
  projectName: string;
}

export interface EngineeringProjectReferenceData {
  projects: ProjectRow[];
  orgs: OrgRow[];
  buildings: BuildingRow[];
  floors: FloorRow[];
  units: UnitRow[];
  users: UserRow[];
}

export const emptyEngineeringProjectReferences: EngineeringProjectReferenceData = {
  projects: [],
  orgs: [],
  buildings: [],
  floors: [],
  units: [],
  users: []
};

export async function loadEngineeringProjectReferences(token?: string): Promise<EngineeringProjectReferenceData> {
  const [projectResponse, orgResponse, buildingResponse, floorResponse, unitResponse, userResponse] = await Promise.allSettled([
    apiRequest<PaginatedResult<EngineeringProject>>("/engineering/projects?page=1&page_size=200&sort=create_time_desc", { token }),
    apiRequest<PaginatedResult<OrgRow>>("/orgs?page=1&page_size=200&status=enabled", { token }),
    apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=200&sort=sortNo", { token }),
    apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=200&sort=floorNo", { token }),
    apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=200", { token }),
    apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=200&status=enabled", { token })
  ]);

  return {
    projects: projectResponse.status === "fulfilled"
      ? projectResponse.value.data.items.map((item) => ({
        id: item.id,
        projectCode: item.projectCode,
        projectName: item.projectName
      }))
      : [],
    orgs: orgResponse.status === "fulfilled" ? orgResponse.value.data.items : [],
    buildings: buildingResponse.status === "fulfilled" ? buildingResponse.value.data.items : [],
    floors: floorResponse.status === "fulfilled" ? floorResponse.value.data.items : [],
    units: unitResponse.status === "fulfilled" ? unitResponse.value.data.items : [],
    users: userResponse.status === "fulfilled"
      ? userResponse.value.data.items.filter((item) => item.status !== "disabled")
      : []
  };
}

export function displayUserName(user?: UserRow | null): string {
  if (!user) return "-";
  return user.displayName ?? user.realName ?? user.username;
}

export function formatProjectLabel(project?: ProjectRow | null): string {
  if (!project) return "-";
  return `${project.projectCode} ${project.projectName}`.trim();
}

export function formatOrgLabel(org?: OrgRow | null): string {
  if (!org) return "-";
  return `${org.orgCode} ${org.orgName}`.trim();
}

export function formatBuildingLabel(building?: BuildingRow | null): string {
  if (!building) return "-";
  return `${building.buildingCode} ${building.buildingName}`.trim();
}

export function formatFloorLabel(floor?: FloorRow | null): string {
  if (!floor) return "-";
  return `${floor.floorCode} ${floor.floorName}`.trim();
}

export function formatUnitLabel(unit?: UnitRow | null): string {
  if (!unit) return "-";
  return `${unit.unitCode} ${unit.unitName}`.trim();
}
