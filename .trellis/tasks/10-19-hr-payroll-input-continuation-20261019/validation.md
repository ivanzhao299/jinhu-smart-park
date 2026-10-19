# Validation before release

Baseline:07a4227bafe83cb2c03d8f8f78eb59aa407fb3b2; fresh origin/main unchanged at commit gate. Scope Web only, no API/shared/schema/auth/release changes.

Independent trellis-check passed focused payroll interaction suite8files/79tests (input-preparation, input-operations, input-continuation, trial, input-readiness, input-csv, input-bulk-csv, modern-context); `pnpm --filter @jinhu/web lint`; `pnpm --filter @jinhu/web exec tsc --noEmit`; `git diff --check`.

Actual composed desktop1275 and390px phone-frame browser passed after fixing list effect clearing saved selection. See browser-acceptance.md for failed first pass, corrected complete sequence and synthetic-only boundaries. Review found/fixed list/detail race and missing composed regression; no remaining reported source findings.

Real HR role and payroll monetary acceptance pending. No production calculation, confirmation, import replay or payment performed. CI, merge, deployment and runtime proof are subsequent gates, not claimed by local checks.

First CI39241577139:170interactionfiles/1548tests passed; one older route source-contract assertion still required pre-handoff JSX. Independent reviewer updated only that contract to assert source-reset, explicit validated receipt, navigation lock and guarded return, retaining original run/correction checks. `pnpm --filter @jinhu/web test:unit:hr`:261passed; actual composed continuation test passed again; diffcheck passed. Business implementation unchanged from browser-accepted candidate. Fresh CI required for updated candidate.
