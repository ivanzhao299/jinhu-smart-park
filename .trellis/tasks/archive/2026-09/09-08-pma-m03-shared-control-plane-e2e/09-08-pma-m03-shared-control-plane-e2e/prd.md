# PMA M-03 共享控制面独立 E2E

## Goal

Issue #698: property operations/identity/approval 独立真实 API E2E，纳入 property-api-e2e-gate 与契约

## Requirements

- Add a standalone real-HTTP suite under `scripts/e2e` for shared property control-plane behavior.
- Cover positive and negative paths for property-operation mode/occupancy, Party identity review, and approval runtime enforcement.
- Do not treat housing or homestay suites as evidence for these shared-control-plane paths.
- Inherit the gate's disposable topology, per-suite `TEST_RUN_ID`, bounded request timeouts, separate maker/checker identities, and workflow-owned volume teardown.
- Register the suite in the aggregate property API gate, suite selector, JSON report, contract test, package commands, CI scope detection, and release documentation.
- Preserve audit trails and maker-checker separation; do not delete immutable audit/effect records or weaken production controls.

## Acceptance Criteria

- [ ] A dedicated suite exercises direct property operations, identity, and approval endpoints through real HTTP.
- [ ] Both allowed transitions and representative rejected transitions are asserted with stable status/error contracts.
- [ ] The suite receives a unique run id and creates only run-scoped fixtures; cleanup is performed by disposable Compose/volume teardown and documented as such.
- [ ] `property-api-e2e-gate` runs and reports the new suite, including focused `--suite control-plane` selection.
- [ ] Gate contracts prevent removal of isolation, direct shared endpoint coverage, maker-checker separation, and suite aggregation.
- [ ] Focused checks, full property gate in disposable CI, review (maximum three rounds), PR CI, squash merge, and exact-SHA main CI plus Deploy all pass.

## Notes

- GitHub Issue: #698.
- No production operations, HR changes, force pushes, or edits to successful migrations.
