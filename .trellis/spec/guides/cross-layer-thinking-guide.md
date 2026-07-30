# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across layers before implementing.

---

## The Problem

**Most bugs happen at layer boundaries**, not within layers.

Common cross-layer bugs:

- API returns format A, frontend expects format B
- Database stores X, service transforms to Y, but loses data
- Multiple layers implement the same logic differently

---

## Before Implementing Cross-Layer Features

### Step 1: Map the Data Flow

Draw out how data moves:

```
Source → Transform → Store → Retrieve → Transform → Display
```

For each arrow, ask:

- What format is the data in?
- What could go wrong?
- Who is responsible for validation?

### Step 2: Identify Boundaries

| Boundary              | Common Issues                     |
| --------------------- | --------------------------------- |
| API ↔ Service         | Type mismatches, missing fields   |
| Service ↔ Database    | Format conversions, null handling |
| Backend ↔ Frontend    | Serialization, date formats       |
| Component ↔ Component | Props shape changes               |

### Step 3: Define Contracts

For each boundary:

- What is the exact input format?
- What is the exact output format?
- What errors can occur?

---

## Common Cross-Layer Mistakes

### Mistake 1: Implicit Format Assumptions

**Bad**: Assuming date format without checking

**Good**: Explicit format conversion at boundaries

### Mistake 2: Scattered Validation

**Bad**: Validating the same thing in multiple layers

**Good**: Validate once at the entry point

### Mistake 3: Leaky Abstractions

**Bad**: Component knows about database schema

**Good**: Each layer only knows its neighbors

### Mistake 4: Every Consumer Parses The Same Payload

**Bad**: A command reads JSONL events and casts fields inline:

```typescript
const thread = (ev as { thread?: string }).thread;
const labels = (ev as { labels?: string[] }).labels;
```

This looks local, but it means every consumer owns a private version of the
event contract. The next field change will update one command and miss another.

**Good**: Decode once at the event boundary, then export typed projections:

```typescript
if (!isThreadEvent(ev)) return false;
return ev.thread === filter.thread;
```

**Rule**: For append-only logs, JSON streams, RPC payloads, or config files,
create one owner for:

- event / payload type definitions
- type guards and normalization from `unknown`
- metadata projections used by UI commands
- reducers that replay state from the source of truth

Rendering code may format fields, but it must not redefine the payload contract.

---

## Checklist for Cross-Layer Features

Before implementation:

- [ ] Mapped the complete data flow
- [ ] Identified all layer boundaries
- [ ] Defined format at each boundary
- [ ] Decided where validation happens
- [ ] For partial updates with cross-field rules, DTO validation accepts omitted
      persisted siblings and service validation checks the effective merged record
- [ ] Canonicalization happens before every encrypted, hashed, masked, compared, or
      uniqueness-key representation of the same logical value

After implementation:

- [ ] Tested with edge cases (null, empty, invalid)
- [ ] Verified error handling at each boundary
- [ ] Checked data survives round-trip
- [ ] Checked that consumers import shared decoders / projections instead of
      casting payload fields locally
- [ ] Checked that derived state points back to the source event identifier
      (`seq`, `id`, `version`) instead of inventing a second cursor

### Stateful Business Action Matrix

For lifecycle, finance, occupancy, or attachment-backed actions, enumerate each
action against every state and sibling entry point before implementation:

- [ ] Terminal states are immutable across generic and domain-specific write paths
- [ ] Period replacement preserves lifecycle state and verifies the exact source,
      current period, and expected status; editing dates is not a state transition
- [ ] Referenced records are revalidated inside the action transaction, not only
      when an earlier step stored their IDs
- [ ] Forward transitions and reverse/void transitions preserve dependent records
      or reject the operation
- [ ] Same-key replay is separated from a new request that happens to carry the
      same business payload
- [ ] Permission-aware responses project only fields authorized by each granular
      read permission
- [ ] Every projected attachment is exercised through metadata list, file detail,
      and blob download policy for each allowed granular business role
- [ ] Write-only roles receive the minimum read context required to reach their
      authorized action, or the permission contract explicitly requires the missing
      selector/context permission at both controller and UI boundaries
- [ ] Action-specific candidate endpoints are authorized by the action permission,
      apply the same data scope as the mutation, and return the labels needed by the
      selector in one projection; the browser must not join several unrelated
      read-permission endpoints to make an authorized action reachable
- [ ] Decimal values survive HTTP, DTO, service, database, and frontend round trips
      without passing through JavaScript `number`
- [ ] Decimal calculations also remain scaled integers or exact rational arithmetic;
      preserving the stored string is insufficient if a later calculation converts it
- [ ] Display or persistence rounding is not reused as an intermediate monetary input;
      each rounding boundary is named and the final charge uses full precision
- [ ] Nullable columns inside a business unique key are normalized, made non-null, or
      covered by an expression index, with the null case included in migration tests
- [ ] Every reverse action (refund, void, cancellation) updates or excludes the record
      from all derived totals, KPIs, availability views, and projections
- [ ] A dependent operational record remains an active constraint after its original
      parent or occupancy is later cancelled, released, or otherwise disappears
- [ ] Mode and availability transitions validate live source aggregates independently
      of denormalized/shared occupancy projections, including force-release drift
- [ ] When one aggregate is persisted before creating its matching shared projection,
      the projection write excludes only that exact source from its own blocker query
- [ ] Every backend recovery/list capability has a production UI consumer that restores
      state after refresh, revisit, or interrupted submission
- [ ] Edit forms load the complete persisted record when their selected entity changes;
      a hard-coded default is used only after an authoritative not-found response
- [ ] Candidate selectors preserve server pagination or search and synchronize stale
      selections when the visible candidate page changes
- [ ] Paginated candidate and record lists preserve action context deliberately:
      when a selected record leaves the current page, clear the detail/action target;
      when only its display label leaves the page, retain a stable ID fallback
- [ ] Detail context and mutation context are modeled separately: a terminal transition
      may hide lifecycle actions while retaining authorized audit and finance detail
- [ ] Browser constraints mirror backend bounds, including relational date rules
      (for example departure strictly after arrival) and conditional bounds such as
      percentage values capped at 100
- [ ] Rapid user actions use a synchronous in-flight guard plus one stable retry key;
      React/render state alone is not a lock against two events in the same tick
- [ ] Same-target refresh failures preserve the last successful projection; clearing
      data is reserved for a real target change or a successful empty response
- [ ] Server-owned uniqueness or singleton roles are derived under a shared aggregate
      lock (and backed by a database constraint where practical), never trusted from
      concurrent client flags alone
- [ ] A pre-read uniqueness check is followed by database-conflict recovery: translate
      or reload the committed winner on the known constraint, and rethrow unrelated
      persistence failures
- [ ] Attachment-backed actions define the consumption boundary: after submission,
      referenced evidence is excluded from the next draft while remaining visible in
      the completed record
- [ ] A draft derived from multiple tables is returned by one server-side snapshot;
      the browser does not join independently timed API responses and call the result
      authoritative
- [ ] Submission locks cover every mutable contributor to the payload, including
      upload, pending removal, and persisted attachment deletion
- [ ] A child uploader reports active work to its owning form; form submission waits
      for all upload promises, including uploads started before the submit lock
- [ ] Destructive lifecycle actions collect a required operator reason and show an
      explicit consequence confirmation before sending; generic hard-coded reasons
      are not an auditable substitute
- [ ] Long-lived operational queues use a bounded server-side active subset and
      paginate history instead of loading all historical records into the main surface
- [ ] Permission-aware effects are gated by the exact read permission of their
      endpoint, independently from write controls and unrelated page visibility
- [ ] Action-only candidate effects run only after the authorized action is entered
      (for example, opening its permission-gated drawer); a page-level read guard does
      not authorize eager calls to an endpoint protected by create/execute permission
- [ ] Permission capability graphs include the dataset needed to discover and select
      the target. If an action requires list/detail context, enforce that read
      permission as an API composite prerequisite; button checks alone are not access
- [ ] A domain file policy is intersected with the generic file endpoint permission:
      domain read + `file:read` for lists, domain write + `file:upload` for uploaders
- [ ] Operational list rows carry their own stable human-readable identity; labels do
      not depend on a separate candidate selector's current page or enabled subset
- [ ] A paginated dataset shared by multiple forms exposes paging beside every
      authorized consumer; navigation must not live only inside a sibling
      permission branch
- [ ] Mutations that remove records from a filtered queue test the last-item-on-last-page
      case and clamp/reload when the total shrinks
- [ ] Time-gated lifecycle buttons have the same authoritative service guard using
      the domain business timezone; hiding a button is never the only enforcement
- [ ] Read and execute permissions are projected at sub-control level: read-only
      users keep evidence and exception context but do not see upload/edit controls
- [ ] Every backend-supported operational payload field needed in the MVP (such as
      exception description, consumables, evidence, and linked work order) has a
      reachable production input and a round-trip test
- [ ] Permission fixtures exercise the lattice, not only broad roles: base read,
      granular read, granular write, and lifecycle-execute combinations each retain
      only their authorized detail blocks and controls
- [ ] Replay-safe terminal sub-actions preserve their first terminal timestamp even
      when a caller retries with a different request key
- [ ] Read-then-insert "upserts" are replaced by locking or one database atomic upsert
      whenever a unique key owns concurrent creation
- [ ] Generic infrastructure records use a domain-specific protected type whenever
      their authorization is narrower than the generic workflow
- [ ] Both sides of a cross-aggregate reference invariant use the same row-lock order
      and keep validation plus reference mutation in one transaction
- [ ] Every sibling terminal transition applies the same dependent-resource cleanup
      before releasing or closing the parent resource
- [ ] A successful mutation reloads every selected projection it can invalidate,
      including ledger summaries, credentials, action history, and status-derived UI
- [ ] Mutation success and projection refresh are separate events: commit owner-state
      cleanup immediately after the successful response, then refresh secondary lists;
      a refresh error must not roll back client state to a server-invalid reference
- [ ] Successful list deletion removes the row and decrements the visible total before
      the follow-up GET. If that GET fails, report “mutation succeeded, refresh failed”
      instead of restoring the deleted row or showing a generic deletion failure
- [ ] Refresh-error state is separate from action feedback and is cleared on the next
      fully successful refresh
- [ ] Selected detail has an identity independent from current list-page membership;
      automatic reordering preserves it while explicit pagination clears it
- [ ] Editable server-backed drafts track field/task dirty ownership so refresh replaces
      clean values without overwriting active local edits
- [ ] Form readiness is bound to the exact entity/version whose data was loaded, not a
      generic boolean that survives a selector change
- [ ] Destructive confirmations repeat the immutable target identity (code, unit, dates)
      instead of relying on the operator to remember which list-row button was clicked
- [ ] Load-error state is scoped to its dataset and cleared by the next successful load
      of that dataset
- [ ] SQL optional-exclusion predicates have explicit null cases and are tested both
      with and without exclusions

Add behavioral tests for both the allowed transition and its nearest forbidden
neighbor. Source-pattern assertions may supplement, but not replace, these tests.

---

## Cross-Platform Template Consistency

In Trellis, command templates (e.g., `record-session.md`) exist in **multiple platforms** with identical or near-identical content. This is a cross-layer boundary.

### Checklist: After Modifying Any Command Template

- [ ] Find all platforms with the same command: `find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] Update all platform copies (Markdown `.md` and TOML `.toml`)
- [ ] For Gemini TOML: adapt line continuations (`\\` vs `\`) and triple-quoted strings
- [ ] Run `/trellis:check-cross-layer` to verify nothing was missed

**Real-world example**: Updated `record-session.md` in Claude to use `--mode record`, but forgot iFlow, Kilo, OpenCode, and Gemini — caught by cross-layer check.

---

## Generated Runtime Template Upgrade Consistency

Some generated files are both documentation and runtime input. In Trellis,
`.trellis/workflow.md` is parsed by `get_context.py`, `workflow_phase.py`,
SessionStart filters, and per-turn hooks. Template changes must be validated
against both fresh init and upgrade paths.

### Checklist: After Modifying A Runtime-Parsed Template

- [ ] Identify every runtime parser that reads the template, not just the file
      writer that installs it
- [ ] Check whether relevant syntax lives outside obvious managed regions
      such as tag blocks
- [ ] Verify fresh `init` output and a versioned `update` scenario that writes
      the older `.trellis/.version`
- [ ] Add an upgrade regression using an older pristine template fixture, then
      assert the installed file reaches the current packaged shape
- [ ] Update the backend spec that owns the runtime contract

---

## Versioned Documentation Boundary

Versioned documentation is a cross-layer boundary: source paths, `docs.json`
version routing, and the rendered version selector must all describe the same
release line.

### Checklist: Before Editing Versioned Docs

- [ ] Identify the target release line: stable, beta, or RC
- [ ] Verify the edited MDX path matches that line:
  - stable: `docs-site/{start,advanced,...}` and `docs-site/zh/{start,advanced,...}`
  - beta: `docs-site/beta/**` and `docs-site/zh/beta/**`
  - RC: `docs-site/rc/**` and `docs-site/zh/rc/**`
- [ ] Verify `docs.json` navigation points the version label to the same paths
- [ ] Grep the opposite tree for release-line-specific terms before committing
- [ ] Treat beta content appearing under root release paths as a source-path bug,
      not a rendering bug

**Real-world example**: A beta-only task workflow change documented
`prd.md` + `design.md` + `implement.md`, task-creation consent, and Codex
mode banners under root `start/` and `advanced/` paths. The docs site then
served 0.6 beta behavior under the Release selector. The fix was to restore root
release docs, move the 0.6 content to `beta/` and `zh/beta/`, and add a grep
audit for beta markers against the root release tree.

**Real-world example**: Codex inline mode changed workflow platform markers from
`[Codex]` / `[Kilo, Antigravity, Windsurf]` to `[codex-sub-agent]` /
`[codex-inline, Kilo, Antigravity, Windsurf]`. Fresh init was correct, but
`trellis update` only merged `[workflow-state:*]` blocks and preserved stale
markers outside those blocks. Result: upgraded projects got new hook scripts
but old workflow routing, so `get_context.py --mode phase --platform codex`
could return empty Phase 2.1 detail.

---

## Mode-Detection Probe Checklist

When a CLI auto-detects a mode by probing a remote resource (e.g., checking if `index.json` exists to decide marketplace vs direct download):

### Before implementing:

- [ ] Probe runs in **ALL** code paths that use the result (interactive, `-y`, `--flag` combos)
- [ ] 404 vs transient error are distinguished — don't treat both as "not found"
- [ ] Transient errors **abort or retry**, never silently switch modes
- [ ] Shared state (caches, prefetched data) is **reset** when context changes (e.g., user switches source)
- [ ] **Shortcut paths** (e.g., `--template` skipping picker) must have the same error-handling quality as the probed path — check that downstream functions don't call catch-all wrappers

### After implementing:

- [ ] Trace every path from probe result to the mode-decision branch — no fallthrough
- [ ] External format contracts (giget URI, raw URLs) are tested or at least documented as comments
- [ ] Metadata reads consume a complete response or use a streaming parser — never parse a fixed-size prefix as full JSON
- [ ] When reconstructing a composite identifier from parsed parts, verify **all** fields are included and in the **correct position** (e.g., `provider:repo/path#ref` not `provider:repo#ref/path`)
- [ ] Verify that **action functions** called after a shortcut don't internally use the old catch-all fetch — they must use the probe-quality variant when error distinction matters

**Real-world example**: Custom registry flow had 8 bugs across 3 review rounds: (1) probe only ran in interactive mode, (2) transient errors fell through to wrong mode, (3) giget URI had `#ref` in wrong position, (4) prefetched templates leaked across source switches, (5) `--template` shortcut bypassed probe but `downloadTemplateById` internally used catch-all `fetchTemplateIndex`, turning timeouts into "Template not found".

## Product Module Availability Checklist

Before changing module-gated menus, pages, APIs, login destinations, or migrations:

- [ ] Identify the runtime authority by tracing storage → service → `/users/me` → UI; do not
  substitute a similarly named registry table.
- [ ] Separate permission elevation from product availability; verify superuser + disabled
  module as an explicit negative case.
- [ ] Exercise the standard write path's exact data shape, including a tenant-module assignment
  with no legacy registry record.
- [ ] Test disabled, deleted, expired, assignment-only, registry-only, normal-role, and
  superuser combinations.
- [ ] Read the executable contract in
  `api/backend/module-access-control.md` before implementation.

**Real-world example**: Agent-session update hints fetched npm `latest` metadata with `response.read(4096)` and then parsed it as complete JSON. The `@mindfoldhq/trellis` package metadata exceeded 4 KB, so the JSON was truncated, parse failed silently, and the first session injection showed no update hint. Fix: read the complete response before parsing, and add a regression where `version` is followed by an 8 KB metadata tail.

---

## Cross-Platform Template Consistency

In Trellis, command templates (e.g., `record-session.md`) exist in **multiple platforms** with identical or near-identical content. This is a cross-layer boundary.

### Checklist: After Modifying Any Command Template

- [ ] Find all platforms with the same command: `find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] Update all platform copies (Markdown `.md` and TOML `.toml`)
- [ ] For Gemini TOML: adapt line continuations (`\\` vs `\`) and triple-quoted strings
- [ ] Run `/trellis:check-cross-layer` to verify nothing was missed

**Real-world example**: Updated `record-session.md` in Claude to use `--mode record`, but forgot iFlow, Kilo, OpenCode, and Gemini — caught by cross-layer check.

---

## Generated Runtime Template Upgrade Consistency

Some generated files are both documentation and runtime input. In Trellis,
`.trellis/workflow.md` is parsed by `get_context.py`, `workflow_phase.py`,
SessionStart filters, and per-turn hooks. Template changes must be validated
against both fresh init and upgrade paths.

### Checklist: After Modifying A Runtime-Parsed Template

- [ ] Identify every runtime parser that reads the template, not just the file
  writer that installs it
- [ ] Check whether relevant syntax lives outside obvious managed regions
  such as tag blocks
- [ ] Verify fresh `init` output and a versioned `update` scenario that writes
  the older `.trellis/.version`
- [ ] Add an upgrade regression using an older pristine template fixture, then
  assert the installed file reaches the current packaged shape
- [ ] Update the backend spec that owns the runtime contract

**Real-world example**: Codex inline mode changed workflow platform markers from
`[Codex]` / `[Kilo, Antigravity, Windsurf]` to `[codex-sub-agent]` /
`[codex-inline, Kilo, Antigravity, Windsurf]`. Fresh init was correct, but
`trellis update` only merged `[workflow-state:*]` blocks and preserved stale
markers outside those blocks. Result: upgraded projects got new hook scripts
but old workflow routing, so `get_context.py --mode phase --platform codex`
could return empty Phase 2.1 detail.

---

## Mode-Detection Probe Checklist

When a CLI auto-detects a mode by probing a remote resource (e.g., checking if `index.json` exists to decide marketplace vs direct download):

### Before implementing:
- [ ] Probe runs in **ALL** code paths that use the result (interactive, `-y`, `--flag` combos)
- [ ] 404 vs transient error are distinguished — don't treat both as "not found"
- [ ] Transient errors **abort or retry**, never silently switch modes
- [ ] Shared state (caches, prefetched data) is **reset** when context changes (e.g., user switches source)
- [ ] **Shortcut paths** (e.g., `--template` skipping picker) must have the same error-handling quality as the probed path — check that downstream functions don't call catch-all wrappers

### After implementing:
- [ ] Trace every path from probe result to the mode-decision branch — no fallthrough
- [ ] External format contracts (giget URI, raw URLs) are tested or at least documented as comments
- [ ] Metadata reads consume a complete response or use a streaming parser — never parse a fixed-size prefix as full JSON
- [ ] When reconstructing a composite identifier from parsed parts, verify **all** fields are included and in the **correct position** (e.g., `provider:repo/path#ref` not `provider:repo#ref/path`)
- [ ] Verify that **action functions** called after a shortcut don't internally use the old catch-all fetch — they must use the probe-quality variant when error distinction matters

**Real-world example**: Custom registry flow had 8 bugs across 3 review rounds: (1) probe only ran in interactive mode, (2) transient errors fell through to wrong mode, (3) giget URI had `#ref` in wrong position, (4) prefetched templates leaked across source switches, (5) `--template` shortcut bypassed probe but `downloadTemplateById` internally used catch-all `fetchTemplateIndex`, turning timeouts into "Template not found".

**Real-world example**: Agent-session update hints fetched npm `latest` metadata with `response.read(4096)` and then parsed it as complete JSON. The `@mindfoldhq/trellis` package metadata exceeded 4 KB, so the JSON was truncated, parse failed silently, and the first session injection showed no update hint. Fix: read the complete response before parsing, and add a regression where `version` is followed by an 8 KB metadata tail.

---

## When to Create Flow Documentation

Create detailed flow docs when:

- Feature spans 3+ layers
- Multiple teams are involved
- Data format is complex
- Feature has caused bugs before

---

## Sibling-Parity Release Gate

When one review finding exposes a missing contract in a repeated workflow, audit every
sibling before the next commit. Do not stop at the named line.

- [ ] Enumerate all forms/endpoints on the same operational surface and map read,
      create, transition, finance, file-read, and file-upload permissions.
- [ ] Compare list, detail, refresh, pagination, revisit, and terminal-state behavior.
- [ ] Compare every create/upsert path for synchronous submission locks, stable retry
      keys, transaction locks, and database-owned uniqueness.
- [ ] Build lifecycle matrices for KPIs and availability, including terminal,
      deleted, inactive, and historical records.
- [ ] Record which unit, integration, real API E2E, and desktop/390px checks cover
      each row. A passing happy-path suite is not proof of sibling parity.
- [ ] Apply a newly learned sibling contract retroactively to the entire current diff
      before requesting another review; documenting the gate without executing its
      matrix is not release completion.
- [ ] When a lifecycle decision consumes mutable state from another aggregate,
      identify every writer and reader, then use compatible row locks throughout the
      decision transaction; testing only the named writer race is insufficient.
- [ ] When canonicalization changes a persisted hash or unique key, test both new
      writes and compatibility with legacy representations already stored in UAT.
- [ ] Compare browser `required` / `min` / `max` / `step` constraints with the exact
      DTO and service inequalities, including equality and the nearest valid neighbor.
- [ ] When one child uploader needs an in-flight submission lock, enumerate every
      uploader-backed sibling form on that page and prove each payload waits for its
      own upload promises.
- [ ] When two forms call the same paginated candidate endpoint, verify they still own
      separate arrays, page state, selection reconciliation, and reachable controls.
- [ ] Compare every backend MVP endpoint with actual Web callers. A tested API without
      an authorized desktop/mobile workflow is not a delivered product capability.
- [ ] Inventory target-bound drafts for each selected aggregate. When the target ID
      changes, reset or key all mutation drafts—not only response projections.
- [ ] Do not share pagination state between independent mutation forms merely because
      they call the same candidate endpoint.
- [ ] For attachment-backed actions, decide whether the payload is a client-owned
      replacement or a backend-derived association. Never replay stale aggregate IDs
      after an attachment list can mutate independently.
- [ ] Separate metadata-read permission from blob-download permission; thumbnail
      effects and preview buttons must follow the download capability.
- [ ] For every action permission, prove list and detail reachability without granting
      unrelated broad read access; keep each detail projection independently gated.
- [ ] Open every new selector under the narrowest supported action-role fixture and
      assert its network calls require no sibling module read permissions.
- [ ] Also open the containing page with read-only permission and assert action-only
      candidate requests are absent until the permission-gated action is entered.
- [ ] Persisted relationship rows carry response-owned display labels; never resolve
      historical names from a separately paginated candidate list.
- [ ] Terminal attachment references define authoritative ownership: after registration,
      replace upload/remove controls with read-only evidence unless an explicit audited
      replacement workflow exists.
- [ ] Every successful target-bound mutation resets its completed draft, and every
      dataset-specific error is cleared by that dataset's next successful load.
- [ ] If one retryable action needs a stable idempotency key, scan every transition on
      the surface—including pay/refund and secondary actions—not only create forms.

---

## Event Log / Projection Boundary

Append-only logs are cross-layer contracts. A single event travels through:

```
CLI input → event writer → events.jsonl → reader → filter → reducer → display
```

### Checklist: After Adding A New Event Kind Or Field

- [ ] Add the event kind to the central event taxonomy
- [ ] Add a typed event variant or type guard at the event layer
- [ ] Add normalization helpers for array/object fields that come from
      user input or JSON
- [ ] Keep `seq` / `id` assignment in the event writer only
- [ ] Make filters and reducers consume the typed event guard, not local casts
- [ ] Make display code consume reducer output or typed events, not raw JSON
- [ ] Add at least one regression that proves history replay and live filtering
      use the same filter model

**Real-world example**: Thread channels added `kind: "thread"`, `description`,
`context`, labels, and `lastSeq`. The first implementation replayed thread
state correctly, but several commands still re-parsed event payload fields with
local casts. The fix was to make the core event layer own `ThreadChannelEvent`
and `isThreadEvent`, make `reduceChannelMetadata` the only channel metadata
projection, and make `reduceThreads` the only thread replay reducer.
