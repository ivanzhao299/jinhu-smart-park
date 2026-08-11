# Codex Review 4795980060 Break-Loop Analysis

## 1. Root-cause categories

- Cross-layer contract gap: list display data, file recovery, permissions, and KPI
  lifecycle rules were not traced from persistence through API response to UI state.
- Change propagation gap: protections added to one sibling path were not copied to
  lease creation, dated overrides, housing selection, and terminal booking refresh.
- Test coverage gap: happy-path and source-pattern tests existed, but role matrices,
  revisit/page-switch behavior, terminal states, and concurrent writes were incomplete.
- Implicit-assumption gap: the UI assumed candidate pages could name historical rows,
  a button guard could protect a whole form, and the current client state survived refresh.

## 2. Why earlier fixes did not close the class

Earlier rounds fixed the exact reported endpoint or action. They did not perform a
same-page and same-aggregate sibling audit. Stable retry keys existed for finance,
purchase, and credentials but not lease creation. Atomic upsert existed for base rates
but not dated overrides. Stale-context protection existed in selected flows but did not
cover housing pagination or homestay terminal transitions. Tests therefore confirmed
the patched examples while adjacent variants remained outside the matrix.

## 3. Prevention mechanisms

- Require a sibling-parity matrix before requesting another review on a large PR.
- Make list APIs own stable row labels; never join them in the browser from another page.
- Test every mutation surface against exact permission combinations.
- Test refresh, browser revisit, pagination, out-of-order completion, and terminal state.
- Test every logical write for double-click, ambiguous retry, concurrent insert/upsert,
  and database uniqueness.
- Define KPI lifecycle matrices before implementing SQL.

## 4. Executable regression coverage

- Unit/schema tests cover stable lease labels, generic-domain rejection, atomic dated
  override upsert, arrival/capacity SQL, permission form mounting, evidence recovery,
  stale selection clearing, stable lease submission keys, and terminal booking context.
- Real API E2E covers business-domain forgery rejection, response-owned lease labels,
  and arrival retention after checkout.
- Typecheck, lint, API tests/build, web build, and desktop/390px browser inspection are
  required before the change is pushed.

## 5. Exit criteria

Do not request a new Codex review until the full sibling-parity matrix passes, all
changed operational surfaces have real API coverage where practical, and any skipped
role/browser/concurrency dimension is stated as a remaining risk rather than implied
to be covered.
