# Browser UAT evidence independent check — 2026-08-28

## Decision

- Browser runner/evidence slice after this review: `GO` for isolated technical-fixture validation.
- Final Rehearsal A/B execution from this baseline: `NO-GO`. `run-full-domain-technical-uat.mjs` still calls the strict browser runner without the required immutable binding. That integration file was outside this review's allowed scope.
- Human UAT and production import remain `HOLD`. The headless fixture is execution-harness evidence only and is not a signed-in A/B browser observation or detached human attestation.

## Independent findings and repairs

1. The canonical browser matrix contains 28 checks: HR reviewer 9, department manager 10, employee 9. Two canonical viewports produce exactly 56 cells. The runner creates and disposes a separate BrowserContext for every actor and viewport.
2. A syntactically valid `runId` ending in `rB` could previously be paired with rehearsal `A`. Runner, combined evidence, and recorder now require the suffix to match the rehearsal.
3. Visible DOM matching checked only the candidate node's computed style. A text node below an opaque-looking child of an `opacity:0`, `aria-hidden`, `hidden`, or `inert` ancestor could be counted. Visibility now walks every ancestor; an adversarial hidden-forbidden fixture is included in the real-headless test.
4. Screenshot sanitization already used the same exclusive `0600` writer for success and failure capture, but omitted contenteditable, URL-like attributes, data attributes, media, and CSS background images. These surfaces are now cleared, redacted, or hidden before capture. Evidence cells retain screenshot hashes, not pixel bytes or credentials.
5. The combined pair validator recalculated each cell hash, but `YuzhouLiveRoleUatRecorder.finalize()` could first emit a nominal PASS after accepting an arbitrary 64-hex cell hash. `passBrowser` now binds legacy id and viewport and recalculates the complete cell hash before accepting it.
6. `final-rehearsal-pair` accepts only technical P0 evidence with `humanUat=HOLD`; a technical artifact claiming human PASS fails closed. No API P0 evidence can produce a human attestation in this slice.

## Validation

- Browser runner, evidence, recorder and final-pair contracts: 16/16 pass.
- Real headless Chrome fixture: 56/56 cells pass, 28 desktop and 28 phone cells; hidden forbidden DOM does not satisfy or poison visible assertions.
- Combined focused result: 17/17 pass.
- Node syntax and `git diff --check`: pass.

## Remaining boundary

The fixture server is deliberately synthetic and proves only runner behavior. Real A/B browser UAT still requires both isolated loopback Web/API runtimes, three isolated credential artifacts, immutable run/C-S-M/subject binding supplied by the full-domain runner, and later detached human evidence. None of those gates may be inferred from this fixture result.
