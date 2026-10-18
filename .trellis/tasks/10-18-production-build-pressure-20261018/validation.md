# Independent review — 2026-10-18

Workspace: `/Users/mac/.codex/worktrees/hr-payroll-business-continuation-20261017/jinhu-smart-park`

Baseline: `685407b31718d988e217b3f78379072f58396542`; branch `codex/production-build-pressure-20261018`.

## Findings (fixed)

- File: `.trellis/spec/guides/project-operations.md`
- Issue: deployment cleanup specification still prohibited the now-required pre-build unused-image cleanup by describing every pressure check as cache-only.
- Fix: distinguish health-gated pre-transfer/pre-build cleanup from cache-only post-build cleanup; document mode, ordering, reserve, running-image/volume protection and bootstrap boundaries. No executable code changed by review.

## Findings (not fixed)

None in the changed executable paths. Review approval covers the bounded patch, not successful production deployment.

## Code-path findings

- The new pre-sync step follows deployment-path validation and verified deployment-scope enforcement. It runs only for resolved `web`, `api`, or `full`; diagnostic modes skip mode resolution, leaving this allowlist false. Database/fast-CSS/ops-only modes do not enter it.
- The remote shell is supplied through stdin before secret-helper upload, source snapshot or candidate transfer. It uses deployed helpers and performs no staging-file creation to reach its pressure gate.
- Both observed filesystems are checked for pre-sync pressure. `df` failures propagate even if stdout contains plausible numeric output. Cleanup and health failures stop the step before subsequent transfer.
- Before build, the actual deploy entry calls all three health probes and the existing cleanup helper, then rechecks space. The real helper removes stopped containers, unused images and cache; running containers protect their current images. It contains no volume prune.
- After build, only builder cache is pruned. New unattached candidate images remain available until service replacement. Required post-health cleanup remains wired.
- Existing migration, seed, source rollback, finance, and business-write paths are unchanged. Root remains sole production operator.

## Verification

- Reviewer: `sh -n scripts/prod-deploy.sh scripts/e2e/prod-deploy-build-pressure.sh scripts/e2e/prod-deploy-seed-precedence.sh` — PASS.
- Reviewer: `node --check scripts/e2e/production-pre-sync-cleanup.contract.mjs` — PASS.
- Reviewer: `git diff --check` — PASS.
- Reused unchanged implementer receipt: real deploy/health/cleanup scripts with command substitutes — 15 cases PASS; confirmed terminal result in `/Users/mac/.codex/artifacts/hr-production-build-pressure-20261018/final-build-pressure-regression.log`.
- Reused root receipts: extracted actual pre-sync shell — 10 cases PASS; workflow YAML parse and route/transfer/scope/verified-scope/migration-prerequisite/seed-precedence contracts — PASS.
- Application lint/type-check: not applicable locally to this shell/workflow/spec-only patch; no TypeScript or application package changes. Shell/module syntax checks above passed. CI remains required before release.
- No production operation or business-data access performed by reviewer.

## Remaining acceptance boundaries

- The 1 GiB reserve is a minimum fail-stop threshold, not a guarantee that a complete image build fits. Actual reclaimed bytes and build success must be observed during the governed production run.
- A healthy existing deployment does not establish candidate runtime identity. Successful deployment, post-health Docker cleanup, independent API/Web image revision observation and requested HR behavior remain root-owned release acceptance.
- Prior rollback behavior may still rebuild images; this patch does not redesign rollback. A later capacity failure must remain a failed release, with its preserved recovery evidence inspected before retry.
