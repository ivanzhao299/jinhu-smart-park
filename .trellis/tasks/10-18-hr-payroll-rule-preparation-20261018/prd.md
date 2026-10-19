# 全账套试算到工资规则准备的业务连续性

## Goal
让 HR 从整月有数据的账套直接进入该账套的现有工资规则维护，并可返回同一实际来源月份；不再靠记账套编号、翻候选页和重选月份衔接工资准备。业务按用户已确认的全部导入记录、吴恩国负责、只算不发推进。

## Verified evidence
Baseline main/runtime ec6a004acbe395f06de63ac6a38ab28669391f24. Production39100660725: July2026 catalog35, populated34/35=54+39 records,64people,2295items; no linked/effective rules/confirmed inputs/formal runs. Existing TrialBook only tells operator to link/approve rules; no rule-area action, rule maintenance starts unrelated paged candidates, leaving online area destroys selected source/month. Existing complete source roster, rule source decision CSV, draft/review/input/trial services already exist; reuse them. No historical reanalysis needed.

## Requirements / acceptance
1. Each actual trial book exposes an explicit rule-preparation action to actors with existing RULE_READ+MANAGE. Handoff carries exact book identity/scheme and explicit selected source/month, not an inferred current month. No new permission grants.
2. Resolve actual current scoped rule metadata across complete bounded pages. Open only the exact linked rule when present, including beyond the first20. Otherwise resolve the exact unlinked book by fresh book-options candidates and prefill only that explicit association. Never fallback to an independent/other-book rule because a page is empty, a read failed or catalog changed. Do not guess accounting roles/formulas or auto-create/submit/approve.
3. Contextual creation remains explicit name/code and existing idempotent save. Target association cannot silently change while context banner says another book. Failure/retry preserves intended target; no duplicate write. Existing normal rule workflow unchanged outside handoff.
4. Explicit return restores the user-selected source/month only after current options still contain it; refetch books and their readiness. Per-book input/source/mapping choices are revalidated through normal selection. Do not carry stale financial drafts across rule revisions. 
5. Token/actor/park/permissions/context switches invalidate pending work and old handoff. No probes without required authority. No action/navigation through new controls while relevant write is active.
6. Reuse DS and existing components. Inspect actual composed UI desktop1275 and phone390 with clearly synthetic APIs, and verify no overflow.
7. Focused real-component tests prove book34/35 target correctness, existing linked rule beyond first page, empty/error/drift/revocation, explicit no-write navigation, actual create payload and return-to-same-month with fresh options. Existing payroll regression plus lint/typecheck. Real July semantics, calculation and Wu business signoff remain separate.

## Scope boundaries
Web only; no API/DDL/seeds, no production business data writes, no login infrastructure changes, no payment, no guessed payroll amounts or approvals. Production backend guards remain authoritative. Existing user authorization covers implementation, PR merge and deployment without another process approval.
