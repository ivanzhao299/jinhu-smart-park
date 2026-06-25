# Leasing To Contract Lifecycle Production Gate-6B Report

Date: 2026-06-25

## Executive Summary

Gate-6B verified the production write lifecycle from controlled asset setup through leasing lead, tenant conversion, quote approval, contract draft, contract approval, contract PDF archive, effective contract, and unit occupancy update.

- Workflow: `Production Leasing Contract Lifecycle Gate`
- Workflow run: `28154457101`
- Run ID: `gate6b-leasing-contract-lifecycle-20260625T073509Z`
- Result: PASS
- API base on production host: `http://127.0.0.1:3010/api/v1`
- Tenant: `10000001`
- Park: `20000001`

## Controlled Production Records

- Building: `G6BB0625073509`
- Building ID: `7b170ddd-c4f1-4d28-9e40-57730f553cad`
- Floor: `G6BF0625073509`
- Floor ID: `8493e9e3-505d-4503-9669-eb9217d2b53a`
- Unit: `G6BU0625073509`
- Unit ID: `aafaede1-0046-4f85-a239-c60a7fa7a4af`
- Leasing lead: `G6BL0625073509`
- Lead ID: `582f165d-2d00-4c1c-af39-398aa50c4a56`
- Park tenant ID: `e217c324-c63f-47ba-9bd5-4ae0337e68b1`
- Quote ID: `a1c3bed9-a624-4f01-afba-362459c69c29`
- Contract code: `CT-20260625000001`
- Contract ID: `ad99c9e2-7dfe-41e3-b78e-d643666bdc52`
- Contract PDF file ID: `0a7f8afd-03b6-4ff7-ade5-8dbcecdf962f`
- Signed scan PDF file ID: `f4eaf9da-68b7-4d26-a40a-3156025b2b9b`

## API Evidence

- `POST /buildings`: PASS
- `POST /floors`: PASS
- `POST /park-units`: PASS
- `POST /leasing/leads`: PASS
- `POST /leasing/leads/:id/convert-to-park-tenant`: PASS
- `POST /leasing/leads/:id/quotes`: PASS
- `POST /leasing/quotes/:quoteId/submit`: PASS
- `POST /leasing/quotes/:quoteId/approve`: PASS
- `POST /leasing/quotes/:quoteId/create-contract-draft`: PASS
- `GET /leasing/contracts/:id/units`: PASS
- `POST /leasing/contracts/:id/submit`: PASS
- `POST /leasing/contracts/:id/approve`: PASS
- `POST /files` for contract PDF: PASS
- `POST /files` for signed scan PDF: PASS
- `POST /leasing/contracts/:id/archive`: PASS
- `POST /leasing/contracts/:id/effective`: PASS
- `GET /leasing/contracts/:id`: PASS
- `GET /leasing/contracts/:id/status-logs`: PASS
- `GET /leasing/contracts/:id/action-logs`: PASS
- `GET /leasing/contracts/:id/files`: PASS
- `GET /park-units/:id`: PASS

## Database Evidence

- Lead moved-in and linked to tenant: 1
- Converted park tenant: 1
- Approved quote: 1
- Effective contract: 1
- Contract unit relations: 1
- Contract files: 2
- Contract status logs: 5
- Contract action logs: 5
- Controlled unit rental status: 30
- Unit status logs: 1
- Operation audit logs: 9

## Readiness Impact

This gate proves that production can support:

- Controlled lead creation and tenant conversion.
- Quote creation, submission, and approval.
- Quote-to-contract draft generation.
- Contract submission, approval, archive, and effective state transition.
- Contract attachment upload with PDF policy.
- Effective contract unit occupancy and unit status logging.
- Contract status logs, action logs, and operation audit logs.

## Production Safety

- All writes used `G6B*` controlled identifiers.
- The gate created an isolated unit before binding the contract.
- No existing business contract or occupied unit was modified.
- No destructive operation was executed.
- No credentials were printed.

## Final Verdict

PASS: lead, tenant conversion, quote approval, contract draft, approval, PDF archive, effective contract, unit occupancy, status logs, action logs, and audit logs are production reachable.
