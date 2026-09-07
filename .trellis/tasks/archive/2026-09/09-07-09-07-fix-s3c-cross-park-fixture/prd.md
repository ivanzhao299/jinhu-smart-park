# Fix S3C cross-park fixture drift

## Goal

Issue #689: repair cross-park building/floor/unit fixture ownership, preserve bootstrap admin primary park and append access, audit related scripts, run S3C regression.

## Requirements

- Correct the S3C cross-park fixture so building, floor, and unit records belong to the target park.
- Preserve the R5 access invariant: do not replace the bootstrap administrator's primary park; append access to the target park.
- Audit `s3*` and `first-release*` E2E scripts for the same source-park hierarchy reuse and repair only confirmed matches.
- Keep the change fixture-only unless test evidence identifies a product defect.

## Acceptance Criteria

- [ ] The cross-park fixture uses a target-park building/floor/unit hierarchy.
- [ ] Bootstrap administrator primary-park ownership is unchanged and target-park access is appended.
- [ ] Full S3C regression passes.
- [ ] Related fixture audit is recorded with file-level evidence.
- [ ] Pull-request CI and post-merge main CI/deploy are green.

## Notes

- GitHub issue: #689.
- No migration, production operation, HR workflow intervention, or broad refactor is authorized.
