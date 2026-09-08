import { HttpException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { HrService } from "./hr.service";

export type HrRealImportReadService = Pick<HrService,
  "listEmployees" | "listContracts" | "listAttendanceCalendars" | "listInsurancePeriods" | "contractDetail" | "insurancePeriodDetail">;
export interface HrRealImportExpectedCounts {
  employees: number;
  contracts: number;
  attendanceCalendars: number;
  insurancePeriods: number;
}
type Domain = keyof HrRealImportExpectedCounts;
type Page = { items: Array<{ id: string }>; total: number; page: number; page_size: number };

export class HrRealImportReadProbeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HrRealImportReadProbeError";
  }
}
function fail(code: string): never { throw new HrRealImportReadProbeError(code); }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function verifyPage(value: unknown, total: number, page: number, size: number): Page {
  if (!object(value) || !Array.isArray(value.items) || value.total !== total || value.page !== page || value.page_size !== size ||
      value.items.length !== Math.min(size, Math.max(0, total - (page - 1) * size))) fail("HR_READ_PROBE_PAGINATION_INVALID");
  const result = value as Page;
  if (result.items.some(row => !object(row) || typeof row.id !== "string" || row.id.trim() === "") ||
      new Set(result.items.map(row => row.id)).size !== result.items.length) fail("HR_READ_PROBE_IDENTITIES_INVALID");
  return result;
}

/** Invokes real service reads; the owner supplies repositories and required audit.
 * No database setup, business writes, audit substitutes, HTTP or UI claims.
 */
export async function verifyHrRealImportReads(input: {
  service: HrRealImportReadService;
  scope: TenantParkScope;
  actor: JwtPrincipal;
  expectedCounts: HrRealImportExpectedCounts;
}) {
  try {
    const { service, scope, actor, expectedCounts } = input;
    if (!scope || !actor || !expectedCounts || [scope.tenantId, scope.parkId, actor.sub].some(value => typeof value !== "string" || !value.trim()) ||
        actor.tenantId !== scope.tenantId || actor.parkId !== scope.parkId || !Array.isArray(actor.permissions)) fail("HR_READ_PROBE_INPUT_INVALID");
    const domains: Domain[] = ["employees", "contracts", "attendanceCalendars", "insurancePeriods"];
    if (Object.keys(expectedCounts).length !== domains.length || domains.some(domain => !Number.isSafeInteger(expectedCounts[domain]) || expectedCounts[domain] <= 0)) fail("HR_READ_PROBE_EXPECTED_COUNTS_INVALID");
    const denied: JwtPrincipal = { ...actor, permissions: [], roles: [], isSuper: false, isTenantSuper: false, dataScope: "none" };
    const readers: Record<Domain, (principal: JwtPrincipal, page: number, pageSize: number) => Promise<unknown>> = {
      employees: (principal, page, page_size) => service.listEmployees(scope, principal, { page, page_size }),
      contracts: (principal, page, page_size) => service.listContracts(scope, principal, { page, page_size }),
      attendanceCalendars: (principal, page, page_size) => service.listAttendanceCalendars(scope, principal, { page, page_size }),
      insurancePeriods: (principal, page, page_size) => service.listInsurancePeriods(scope, principal, { page, page_size }),
    };
    const firstIds = {} as Record<Domain, string>;
    const observedCounts = {} as HrRealImportExpectedCounts;
    const checks: string[] = [];
    for (const domain of domains) {
      const total = expectedCounts[domain], size = Math.min(20, Math.ceil(total / 2));
      const first = verifyPage(await readers[domain](actor, 1, size), total, 1, size);
      const second = verifyPage(await readers[domain](actor, 2, size), total, 2, size);
      const firstSet = new Set(first.items.map(row => row.id));
      if (second.items.some(row => firstSet.has(row.id))) fail("HR_READ_PROBE_PAGE_OVERLAP");
      firstIds[domain] = first.items[0]!.id;
      observedCounts[domain] = first.total;
      for (const page of [1, 2]) verifyPage(await readers[domain](denied, page, size), 0, page, size);
      checks.push(`${domain}:positive_count`, `${domain}:pagination`, `${domain}:disjoint_pages`, `${domain}:denied_empty`);
    }
    const details = [
      { read: (principal: JwtPrincipal) => service.contractDetail(scope, principal, firstIds.contracts), id: firstIds.contracts, message: "Contract not found", domain: "contracts" },
      { read: (principal: JwtPrincipal) => service.insurancePeriodDetail(scope, principal, firstIds.insurancePeriods), id: firstIds.insurancePeriods, message: "Insurance period not found", domain: "insurancePeriods" },
    ];
    for (const detail of details) {
      const value: unknown = await detail.read(actor);
      if (!object(value) || value.id !== detail.id) fail("HR_READ_PROBE_DETAIL_MISMATCH");
      let rejected = false;
      try { await detail.read(denied); }
      catch (error) {
        if (!(error instanceof HttpException) || error.getStatus() !== 404 || error.message !== detail.message) fail("HR_READ_PROBE_DENIAL_INVALID");
        const response = error.getResponse();
        if (typeof response !== "string" && (!object(response) || Object.keys(response).some(key => !["message", "error", "statusCode"].includes(key)) ||
            response.message !== detail.message || response.statusCode !== 404 || (response.error !== undefined && response.error !== "Not Found"))) fail("HR_READ_PROBE_DENIAL_INVALID");
        if (typeof response === "string" && response !== detail.message) fail("HR_READ_PROBE_DENIAL_INVALID");
        rejected = true;
      }
      if (!rejected) fail("HR_READ_PROBE_DENIED_DETAIL_EXPOSED");
      checks.push(`${detail.domain}:detail`, `${detail.domain}:denied_404`);
    }
    return { status: "PASS" as const, verificationLayer: "service_only" as const, observedCounts, checks,
      httpVerified: false, authenticationVerified: false, uiVerified: false, auditPersistenceVerified: false,
      productionImport: "HOLD" as const };
  } catch (error) {
    // Never propagate driver, service, audit or assertion details containing rows.
    if (error instanceof HrRealImportReadProbeError) throw error;
    throw new HrRealImportReadProbeError("HR_READ_PROBE_SERVICE_FAILED");
  }
}
