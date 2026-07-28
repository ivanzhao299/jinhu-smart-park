# Codex Review 4794568902 Break-Loop Analysis

## Symptom

The homestay operations page passed its main happy-path API flow but still exposed
ten integration gaps: same-tick duplicate credential issuance, stale off-page
booking context, incomplete mobile labels, incorrect form bounds, non-authoritative
unit candidates, unrecoverable turnover evidence, hard-coded credential type,
unbounded turnover history, and read-permission mismatches.

## Root-Cause Classification

- Primary: change propagation. Pagination and upload support were added at the data
  boundary without tracing every downstream selection, label, action, and reload path.
- Secondary: test coverage. API E2E covered the happy-path lifecycle but not rapid
  duplicate interaction, granular permission roles, refresh recovery, or large-history
  list behavior.
- Contributing: implicit assumptions. React loading state was treated as an immediate
  lock, the generic park-unit list was treated as a valid business candidate list,
  and current-session upload callbacks were treated as durable evidence state.

## Why Earlier Fixes Did Not Prevent It

Earlier reviews were corrected one invariant at a time. The verification matrix
followed the reported endpoint or component but did not systematically enumerate:

1. every consumer of a newly paginated dataset;
2. every state transition that can race within one browser event loop;
3. reload/revisit behavior for uploaded evidence;
4. every granular read/write permission combination; and
5. browser constraints corresponding to backend DTO limits.

As a result, each local fix could pass its targeted test while a neighboring
cross-layer assumption remained untested.

## Corrective Actions Applied

- Added authoritative paginated short-stay unit candidates.
- Added bounded open-turnover queries and paginated history support.
- Made turnover evidence recoverable from persisted file associations.
- Added synchronous credential submission locking, stable retry keys, and credential
  type selection.
- Cleared off-page booking action context while retaining stable unit-ID fallbacks.
- Aligned date, hour, and percentage browser constraints with backend rules.
- Gated rate loading and rendering by the precise read permission.
- Added API, DTO, frontend contract, real E2E, desktop, and 390px checks.

## Prevention Gate

For future operational-page changes, the pre-commit review must include:

- a consumer map for every paginated or filtered dataset;
- a rapid-double-action and retry-key case for consequential writes;
- refresh/revisit recovery for attachment-backed workflows;
- a granular permission matrix separating reads from writes;
- an HTML-control versus DTO-bound comparison;
- an active-queue pagination test plus historical-data path; and
- real browser checks at desktop and 390px after meaningful frontend changes.
