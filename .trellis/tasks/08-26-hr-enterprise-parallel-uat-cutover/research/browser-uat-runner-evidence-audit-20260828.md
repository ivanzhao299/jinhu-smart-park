# Browser UAT runner and evidence audit — 2026-08-28

## Decision

`NO-GO` for executing the current full-domain A/B orchestrator until its browser-runner call supplies the new immutable binding. The browser slice itself is `GO` after the focused gates below.

This audit is limited to the isolated Smart Park technical browser surface. It never promotes evidence to legacy Yuzhou runtime traversal, never signs human UAT, and keeps `productionImport=HOLD`.

## Confirmed bypasses in the reviewed baseline

1. A 56-cell result carried role, route, viewport and screenshot hash, but not rehearsal run id, C/S/M or the isolated actor subject hash. A screenshot hash could therefore be replayed across runs.
2. Combined evidence and recorder validation discarded route/rendered-path and immutable cell-binding facts.
3. Allow/deny proof was based on body text inclusion. The integration fixture passed by assigning a joined string to `body.innerText`, without a visible control or surface element.
4. Normal screenshots were taken before explicit DOM/input redaction and failures produced no registered screenshot.
5. `final-rehearsal-pair` required a technical summary to claim `humanUat=PASS`, although the authoritative technical runner correctly emits `HOLD`. Its fixture hid this unreachable contract by fabricating `PASS`.

## Hardened contract

- Execution requires `rehearsal`, `runId`, exact C/S/M and three unique hash-only actor subjects before Chrome launch.
- Every cell binds run, C/S/M, legacy item, role, actor subject, requested/rendered route, viewport, screenshot hash and DOM assertion hash into `cellEvidenceSha256`.
- DOM allow/deny checks require rendered, visible elements; a joined body string no longer satisfies the integration contract.
- Browser contexts remain one per actor and viewport and are disposed after storage/cookie cleanup.
- Screenshots clear input/textarea values and redact configured runtime needles before capture. The same private `0600` path is used for failure screenshots, which are registered through the evidence callback before the failure is rethrown.
- Recorder and pair evidence revalidate the cell binding instead of trusting the runner's PASS flag.
- Automated evidence and technical summary remain `humanUat=HOLD`. A technical artifact claiming human PASS now fails closed. Any future human promotion requires a separate detached, hash-addressed attestation over the exact 56-cell evidence; API P0 evidence cannot substitute for it.

## Focused evidence

- Browser matrix/runner/evidence/recorder/final-pair contracts: 17/17 pass.
- Real headless Chrome integration: 56/56 cells, including 28 desktop and 28 phone-390 cells, pass.
- Node syntax and `git diff --check`: pass.

## Required integration follow-up

The task explicitly prohibited editing `run-full-domain-technical-uat.mjs`. Its existing call does not yet pass the strict browser binding and therefore now fails before launch. The owning integration slice must pass `config.rehearsal`, `config.runId`, `config.triple`, and the already-created hash-only reviewer/manager/employee subjects. It must not weaken the new runner gate or write credentials into evidence.

No real signed-in human session was available or used. Human UAT correctly remains `HOLD`.
