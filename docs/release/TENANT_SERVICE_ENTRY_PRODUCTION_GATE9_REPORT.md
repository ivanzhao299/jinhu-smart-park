# Tenant Service Entry Production Gate-9 Report

- Date: 2026-06-25
- Workflow: `production-tenant-service-entry-gate.yml`
- GitHub Actions run: `28155752385`
- Run ID: `gate9-tenant-service-entry-20260625T080110Z`
- Result: PASS

## Scope

Gate-9 validates that a tenant-facing service request can become a production work order and complete a service lifecycle:

- Select a real effective contract tenant and active contract unit.
- Create work order with `source_type=tenant_request`.
- Bind work order to `park_tenant_id` and `unit_id`.
- Assign, accept, start, finish with evidence, confirm, evaluate, and close.
- Verify read models, lifecycle logs, file linkage, and operation audit logs.

## Production Run

- API Base: `http://127.0.0.1:3010/api/v1`
- Tenant: `10000001`
- Park: `20000001`
- Production admin candidate: `admin`
- Effective contract: `CT-20260625000001`
- Park tenant: `Gate-6B 生产验证租户 0625073509`
- Park tenant ID: `e217c324-c63f-47ba-9bd5-4ae0337e68b1`
- Unit: `G6BU0625073509` / `Gate-6B 租赁闭环验证房源`
- Unit ID: `aafaede1-0046-4f85-a239-c60a7fa7a4af`
- Work order dictionaries:
  - type: `repair`
  - priority: `medium`
  - urgency: `normal`
  - source: `tenant_request`
- Controlled finish file ID: `ae221809-89ae-495d-aa4c-b1c6ed972e6c`

## Lifecycle Evidence

- Create tenant request work order: PASS HTTP 201
- Assign tenant request work order: PASS HTTP 201
- Accept tenant request work order: PASS HTTP 201
- Start tenant request work order: PASS HTTP 201
- Finish tenant request work order: PASS HTTP 201
- Confirm tenant request work order: PASS HTTP 201
- Evaluate tenant request work order: PASS HTTP 201
- Close tenant request work order: PASS HTTP 201
- Read tenant request work order detail: PASS HTTP 200
- Read tenant request work order logs: PASS HTTP 200
- List tenant request work orders: PASS HTTP 200
- Read work order stats: PASS HTTP 200

## Database Evidence

- Work order ID: `1ca2e3a7-2fb5-4130-8b2e-8cdd6df8c793`
- Work order code: `WO-20260625000003`
- Work order status: `100`
- Source type: `tenant_request`
- Park tenant ID: `e217c324-c63f-47ba-9bd5-4ae0337e68b1`
- Unit ID: `aafaede1-0046-4f85-a239-c60a7fa7a4af`
- Satisfaction: `5`
- Image file count: `1`
- Lifecycle logs: `8`
- Finish file links: `1`
- Operation audit logs: `8`

## Final Verdict

PASS: tenant service entry, tenant/unit linkage, assignment, handling, finish evidence, tenant confirmation, evaluation, closure, read models, lifecycle logs, and audit logs are production reachable.
