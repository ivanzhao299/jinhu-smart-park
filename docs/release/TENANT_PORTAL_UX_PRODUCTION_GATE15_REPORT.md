# Tenant Portal UX Production Gate-15 Report

Date: 2026-06-25

## Executive Summary

Gate-15 passed in production.

The gate verified the new tenant-facing service desk UX:

1. Production web and API are reachable.
2. `/tenant/service` is deployed as the authenticated tenant service entry.
3. `/preview/tenant-service` renders a tenant-service preview for smoke verification.
4. The service desk exposes quick entries for repair, cleaning, security, access coordination, and service consultation.
5. New tenant requests are mapped to the existing `tenant_request` work order source type.
6. The route is registered in the first-release menu under work order management.
7. Production work order, statistics, park tenant, and unit read surfaces are reachable.
8. The gate did not create, update, or delete production work orders.

## Workflow Evidence

- GitHub Actions run: `28159562802`
- Workflow: `production-tenant-portal-ux-gate.yml`
- Script: `scripts/production-tenant-portal-ux-gate15.sh`
- Run ID: `gate15-tenant-portal-ux-20260625T091106Z`
- Production API base: `http://127.0.0.1:3010/api/v1`
- Production Web base: `http://127.0.0.1:3011`
- Tenant: `10000001`
- Park: `20000001`
- Selected admin: `admin`

## Production Runtime Evidence

- Preview tenant service route: HTTP `200`
- Preview rendered response size: `23460` bytes
- Authenticated tenant service shell route: HTTP `200`
- Tenant request work order read surface: HTTP `200`, observed items `1`
- Work order statistics read surface: HTTP `200`
- Park tenant read surface: HTTP `200`, observed items `2`
- Park unit read surface: HTTP `200`, observed items `5`

## Tenant UX Evidence

- Deployed `TenantServiceEntryClient` contains `租户服务台`.
- Deployed service quick actions are present.
- Deployed create flow enforces `tenant_request`.
- Deployed menu contains `/tenant/service`.
- Deployed preview route uses `TenantServiceEntryClient`.

## Governance Notes

- Gate-15 did not write production database rows.
- Gate-15 did not create, update, or delete work orders.
- New tenant requests continue to use the existing work order create API and permission gate.
- This gate focused on route availability, tenant-service UX, menu registration, and read-surface availability.

## Final Verdict

PASS.

Tenant service now has a production-deployed service-desk entry that can guide tenant-facing repair, cleaning, security, access, and consultation requests into the governed work order lifecycle.
