# Issue740 merge-SHA deploy diagnosis (2026-09-17)

## Facts

- PR #741 squash-merged at `bc9d7bbca1dc05e586ca06b3231d75f00107cbad` (2026-09-17T03:54:21Z); main **CI passed** (run 35179924716).
- **Deploy Production failed** (run 35179924670, same SHA): production seed `000033_wu_enguo_hr_manager.sql` raised
  `ERROR: Wu Enguo HR role requires one exact scoped identity` (PL/pgSQL inline_code_block RAISE), pnpm `ELIFECYCLE … exit code 3` at 04:12:43Z.
- Workflow rollback fired: "Deployment failed; restoring the previous application source snapshot." — previous source re-deployed; containers rebuilt, healthcheck OK (API liveness/readiness, WEB login), docker cleanup finished. Production is **stable on the previous release**; it contains neither PR #744 (HR) nor PR #741 (this task) changes.
- The same deploy job already failed on `cbc8443e` (run 35060631058, 2026-09-16 05:43) — the merge of HR PR #744 that introduced seeds `000032`/`000033` (`8c632cb3`, `ca412fe9`). PR #741 touched no seeds, no HR, no API files in the deploy-critical path (web dialog CSS/component + evidence docs only).

## Conclusion

Deploy failure is a **pre-existing cross-domain HR seed defect** introduced by PR #744 and failing since 2026-09-16; it is not caused by this task's changes. Per this task's production rules (HR cross-domain failures: stop, report, no fix attempts from this task, no gate exemptions, no retry of the old failure), the deploy is reported as blocked-by-external-defect.

## Status boundaries

- PR #741 merge + main CI: **complete**.
- Automatic deploy of merge SHA: **failed (external HR seed)**; production rolled back and healthy.
- Issue #740 closure/archive: **kept OPEN by user decision** — waiting for #746 (HR seed fix) and a subsequent successful deploy carrying this fix to production.
- HR seed defect tracked in Issue #746 (created 2026-09-17).
