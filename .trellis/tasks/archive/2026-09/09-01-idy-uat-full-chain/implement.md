# Implement: IDY Full-chain UAT

## Status

- Branch: `codex/fix-idy-uat-full-chain` from `origin/main@034b7317`.
- Issue: #521; parent queue: #509.
- UAT execution, evidence freeze, sensitive scan, and exact teardown complete; report review/CI closure in progress.

## Checklist

- [x] Complete Phase 0 audit table and freeze cases, tables, manifest, ports, resource names, and cleanup boundaries.
- [x] Run focused F01-F05 and G1-G7 static/unit/contract gates.
- [x] Provision one disposable PostgreSQL/API/Web/file-volume environment; migrate, production seed, bootstrap, baseline, fixtures.
- [x] Execute Homestay/Housing real API E2E and identity-governance API cases.
- [x] Capture isolated Chrome desktop/phone screenshots, viewport/runtime and sanitized Network manifest.
- [x] Capture DB/residual evidence, logout/about:blank, exact PID/resource/file/profile teardown, sensitive-data scan, checksums.
- [x] Write sanitized UAT report with PASS/FAIL/BLOCKED truthfully.
- [ ] Commit/push report, PR `Closes #521`, hosted review <=3, CI, squash merge, main CI/Deploy.
- [ ] Archive completed F02-F05/UAT and parent #509 only after every acceptance criterion passes.

## Retry rule

- Same issue is attempted at most twice. A third recurrence is recorded as FAIL/BLOCKED with evidence; the UAT turn does not patch product code.

## Safety

- No production writes, no shared database, no HR, no primary Chrome, no other-owner containers.
- No force push, broad delete, TRUNCATE, trigger bypass, or unverified recursive removal.
- Preserve the unrelated dirty F02/F03 `implement.md` outside all commits.

## Evidence summary

- Base: `034b7317`; RUN_ID/project: `20260831-175319` / `jinhu-identity-uat-20260831-175319`.
- Focused gates: F01-F05 59/59; G1/G4 12/12; G4/G5 routing 57/57; G5 session 50/50; G7 contract PASS.
- Real Property E2E: Homestay PASS, Housing PASS; governance live API and DB assertions PASS.
- Browser: Chrome 151, desktop 1424x865, phone 390x844, Network failures 0, console errors 0, logout and about:blank PASS.
- Teardown: project containers/volumes/networks 0/0/0, ports closed, dedicated profile/env removed, protected F02 container unchanged.
- Local-only evidence: `/tmp/jinhu-identity-uat-20260831-175319/`; 47 SHA-256 entries verified.
