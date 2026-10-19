# Root review checkpoint

Prior goal turn: NO_PROGRESS for implementation; status evidence was refreshed for the user, no code or deployment changed. Current continuation revalidated authoritative branch/base and live implementer. Full HR objective remains active.

## Finding sent to sole source owner

`applySourcePreview` stores `Candidate.sourceValues` in the selected employee. `selectCompleteRoster` compares the entire candidate JSON to a metadata-only roster response; this now differs solely due to optional financial projection. Clicking the existing complete-roster entry after source apply can silently replace filled/manual input with blanks. Compare stable employee preparation metadata excluding optional sourceValues, or store metadata-only selections; add source apply -> manual edit -> pure roster refresh preservation regression. Worker notified; fix and root browser verification are recorded below.

## Current state

Branch `codex/hr-payroll-source-input-values-20261019`; HEAD and fetched origin/main `c2730db4a0a4018dafffc19f2c65bcb27a69d13b`, ahead/behind 0/0. One implementation writer `/root/payroll_source_values_implement`. No production financial writes. Required actual-PG max precision/ambiguity/missing/audit and actual parent-composition source-values test pending. Sequential independent full-scope check follows source freeze.

## Release preflight

GitHub confirms latest main deployment 39244713332 and independent runtime observation 39246001838 both completed success at base c2730db4a. No PR exists yet for current branch. Correct public API health `/api/v1/health`, readiness `/api/v1/ready`, and `/login` all returned 200 at 2026-10-19T12:09:43.839725Z; receipt in private artifact `public-health-current.json`. An initial probe used incorrect `/api/health/live` and `/api/health/ready` routes, so that raw reachability file is not health evidence.

Independent final check must review all API/shared/Web changes, required manifests/specs, existing default roster compatibility, opt-in read permissions before DB, exact numeric SQL, required audit rollback, full54 source preview through retry/exact saved batch read, and preservation of manual input when pure roster is refreshed after source apply. Existing root desktop/390 synthetic evidence is available; repeat only impacted assertions after new fixes. Full-stack release required.

## Finding fix browser verification

Worker added candidateMetadata exclusion of optional sourceValues. Root rebuilt actual synthetic composition and verified via CUA: source preview54 > explicit apply > edit employee0 income456.7800 > pure complete-roster button. Employee count54, raw income456.7800 and tax0.0000 preserved, source missing cells stayed blank. Screenshot and code hash saved in private browser evidence. Automated regression and independent review still required.
