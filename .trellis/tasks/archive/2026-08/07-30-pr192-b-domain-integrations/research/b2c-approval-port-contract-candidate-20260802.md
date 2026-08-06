# B-2c Approval Port Contract Candidate v2

Date: 2026-08-02

Status: **REVISED CANDIDATE / READY FOR INDEPENDENT CONTRACT RE-REVIEW**

Owner lane: B-contract/shared-contract owner

Scope: shared approval command/projection ABI and approval-runtime compatibility only

## 1. Verdict and authority

This v2 candidate closes the design questions raised by
`b2c-approval-port-contract-change-request-20260802.md`. It is executable as a
shared TypeScript contract, but it is not a release handoff and does not authorize
production implementation until the independent contract Gate passes.

It supersedes the byte grammar and validation text in v1 of this same file. The first
independent QA review returned five P1 and three P2 findings. Sections 2 through 10 now
freeze actor identity, legacy receipt bytes and dual replay proof, non-aborting unique
conflict handling, closed JSON/canonical UTF-8, fixed-scale money, bounded versions and
the missing conflict/terminal/boundary goldens.

The second independent review returned one remaining P1: whole-object
`JSON.stringify` could re-enumerate integer-index keys. Section 5.2 now supersedes that
algorithm with a recursive manual serializer and a mixed-key byte/SHA golden.

The candidate consumes only the current authorities recorded by
`b2c-current-authority-locator-v1.md`, in particular:

- B-contract-v2:
  `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944`;
- approval runtime effect authority:
  `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf`;
- approval runtime v2 sidecar:
  `30168511b4ea2028afebf45300a399dcb3f0d15b6ed279368611447a61f1f589`.

Previously rejected authority SHAs remain rejected. This document does not replace
the current-authority locator or change any schema/effect authority.

## 2. Normative shared ABI candidate

The following declarations are the exact candidate to be added to the shared Track B
contract surface after independent approval. Names, literals, field spelling,
nullability and method cardinality are normative.

```ts
export const PROPERTY_APPROVAL_PORT_CONTRACT_VERSION =
  "property-approval-port-v2" as const;

export const PROPERTY_APPROVAL_COMMAND_PORT =
  Symbol("PROPERTY_APPROVAL_COMMAND_PORT");

export const PROPERTY_APPROVAL_PROJECTION_PORT =
  Symbol("PROPERTY_APPROVAL_PROJECTION_PORT");

export type PropertyApprovalJsonValue =
  | null
  | boolean
  | string
  | number
  | readonly PropertyApprovalJsonValue[]
  | { readonly [key: string]: PropertyApprovalJsonValue };

export interface CreatePendingPropertyApprovalCommand {
  contractVersion: typeof PROPERTY_APPROVAL_PORT_CONTRACT_VERSION;
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
  requesterId: string;
  submitterId: string;
  actorId: string;
  clientKey: string;
  businessIntentKey: string;
  canonicalPayload: Readonly<Record<string, PropertyApprovalJsonValue>>;
  payloadSchemaVersion: number;
  amount: string | null;
  currency: string | null;
}

export interface PropertyApprovalRequestProjection {
  requestId: string;
  tenantId: string;
  parkId: string;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
  requesterId: string;
  submitterId: string;
  businessIntentKey: string;
  payloadSchemaVersion: number;
  payloadHash: string;
  amount: string | null;
  currency: string | null;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  decisionStatus: ApprovalDecisionStatus;
  executionStatus: ApprovalExecutionStatus;
  decisionVersion: number;
  executionVersion: number;
  submittedAt: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PropertyApprovalCreateDisposition =
  | "created"
  | "replayed-client-key"
  | "replayed-business-intent";

export interface CreatePendingPropertyApprovalResult {
  disposition: PropertyApprovalCreateDisposition;
  request: PropertyApprovalRequestProjection;
}

export interface PropertyApprovalCommandPort {
  createPendingRequest(
    manager: EntityManagerPort,
    command: CreatePendingPropertyApprovalCommand
  ): Promise<CreatePendingPropertyApprovalResult>;
}

export interface PropertyApprovalRequestByIdQuery {
  scope: TenantParkScope;
  requestId: string;
}

export interface PropertyApprovalActiveBySourceQuery {
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
}

export interface PropertyApprovalRequestsBySourceQuery {
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
}

export interface PropertyApprovalProjectionPort {
  findById(
    manager: EntityManagerPort,
    query: PropertyApprovalRequestByIdQuery
  ): Promise<PropertyApprovalRequestProjection | null>;

  findActiveBySource(
    manager: EntityManagerPort,
    query: PropertyApprovalActiveBySourceQuery
  ): Promise<PropertyApprovalRequestProjection | null>;

  listBySource(
    manager: EntityManagerPort,
    query: PropertyApprovalRequestsBySourceQuery
  ): Promise<readonly PropertyApprovalRequestProjection[]>;
}
```

The token value is the exported `symbol` instance created by the exact `Symbol(...)`
expression above. Consumers must import the token from `@jinhu/shared`; they must not
recreate a symbol with the same description. `canonicalPayload`, the client key,
execution idempotency key, claim/failure fields, stages, decisions and actor exclusions
are intentionally not exposed by the projection. They remain runtime internals or have
separate authorized detail surfaces.

## 3. Caller-owned transaction contract

`EntityManagerPort` remains the shared package boundary:

```ts
export interface EntityManagerPort {
  readonly transactionContext: unknown;
}
```

The API implementation must unwrap `transactionContext` as a TypeORM `EntityManager`
and prove that `manager.queryRunner?.isTransactionActive === true` before reading or
writing. A missing wrapper, a missing context, a non-TypeORM context or an inactive
transaction fails closed as `property-runtime-unavailable` with
`recoveryAction=retry-with-same-client-key`.

The supplied manager is used as-is for every request, policy, stage, exclusion,
manifest, audit and mutation-receipt operation. The implementation must not call
`DataSource.transaction(...)`, `manager.transaction(...)`, create a query runner, commit,
roll back, or release the caller's manager. The caller owns isolation, commit and
rollback. Every projection method also uses that manager, so a caller can observe the
just-created request before commit.

The owning domain must acquire its source/aggregate lock first, then call this port.
The port may take approval-table locks in the frozen global order but must not acquire
the source lock in reverse order.

### 3.1 Non-aborting conflict protocol

PostgreSQL marks a transaction aborted after an uncaught unique violation, so the port
must not catch `23505` and then query with the already-aborted manager. The exact v2
protocol is:

1. calls on one manager are sequential and non-reentrant;
2. issue `SAVEPOINT jinhu_approval_port_v2` through the supplied manager;
3. insert the request with unqualified `ON CONFLICT DO NOTHING RETURNING id` so client,
   business-intent, active-source and any future unique conflicts do not abort the
   transaction;
4. when no request ID is returned, query the frozen identities in section 6 priority
   order while the transaction remains usable;
5. insert the submit receipt with `ON CONFLICT DO NOTHING RETURNING id`; on no row,
   re-read and dual-validate the existing receipt;
6. if any other statement raises, immediately issue
   `ROLLBACK TO SAVEPOINT jinhu_approval_port_v2`, then
   `RELEASE SAVEPOINT jinhu_approval_port_v2`; only after that may the port classify
   known SQLSTATE/constraint evidence and throw a stable error;
7. on success issue `RELEASE SAVEPOINT jinhu_approval_port_v2` before returning.

The savepoint is an error-recovery boundary inside the caller's existing transaction;
it is not permission to call a TypeORM transaction callback or to commit/roll back the
outer transaction. The port must preserve the caller transaction as usable after every
returned replay and every thrown conflict. An unclassifiable failure becomes
`property-runtime-unavailable` only after rollback-to-savepoint has succeeded. Failure
to establish, roll back to, or release the savepoint is also
`property-runtime-unavailable`, and the caller must roll back the outer transaction.

## 4. Atomic create-and-submit semantics

`createPendingRequest` is one atomic operation. On a new request it must, in order:

1. validate and canonicalize the complete command without converting decimal strings
   to JavaScript numbers;
2. resolve the frozen policy using the supplied manager and validate every stage,
   exclusion and effect-manifest line against the frozen action manifest;
3. prove that every stage has at least one currently eligible checker after all frozen
   actor exclusions are applied;
4. insert the request in `draft` with decision version `1` and execution version `1`;
5. insert stages, requester/submitter/historical-actor exclusions and effect manifests;
6. write audit `property.approval.draft`, `null -> draft`, version `1`;
7. acquire the legacy-compatible `property.approval.submit` mutation receipt with the
   authoritative request's persisted `clientIdempotencyKey` (equal to the caller key for
   a newly inserted request), `receiptContractVersion="legacy-v1"`,
   `actorId=command.actorId=command.submitterId`, target equal to the new request ID,
   and the exact request hash from section 5.2;
8. CAS the request from `draft@1` directly to `pending_approval@2`, set database-time
   `submittedAt`, and keep execution `not_started@1`;
9. write both audits `property.approval.submit`, `draft -> submitted`, and
   `property.approval.activate`, `submitted -> pending_approval`, at decision version `2`;
10. complete the submit receipt with result ref
    `property-approval:<requestId>:submitted`, the exact result hash from section 5.2,
    `resultVersion=null` as required by the existing legacy-v1 row grammar, then return
    the explicit projection.

The request row never needs to persist `submitted` as its final transaction-visible
state, but the two state edges and the draft edge must all be durably represented by
three audit rows. Any failure rolls back the request, stages, exclusions, manifests,
audits and submit receipt together. Initial success always returns
`decisionStatus="pending_approval"`, `executionStatus="not_started"`, and
`disposition="created"`.

There is no second externally supplied mutation key. A newly created request persists
the command `clientKey`, and that persisted request key is the authority for the
namespaced `property.approval.submit` receipt. For an existing legacy draft found through
business intent, an alternate incoming key is lookup/conflict evidence only: it neither
rewrites the request key nor becomes the receipt key. Request uniqueness and receipt
uniqueness remain distinct frozen constraints.

`actorId` is the authenticated mutation actor. It must equal `submitterId` byte-for-byte
after UUID lowercase normalization; mismatch is `property-action-forbidden` before any
write. `requesterId` may differ, but requester, submitter and all policy-required
historical actors remain frozen exclusions.

## 5. Canonical validation and equality


### 5.1 Closed input grammar

- IDs are RFC 4122 UUID strings. Validation is case-insensitive; the canonical/hash form
  is lowercase hyphenated text.
- Every version carried by this port, including source, payload schema, policy, stage,
  decision, execution and result versions, is a JavaScript safe integer in
  `1..2147483647`. Zero, negative, fractional, unsafe or larger values are rejected.
  Effect ordinal is the sole zero-based integer and is bounded `0..2147483646`.
- `sourceType` and `businessIntentKey` are nonblank Unicode-scalar strings of 1..64 and
  1..128 UTF-8 bytes respectively. No Unicode normalization is performed; byte-distinct
  NFC/NFD strings are different identities. Leading/trailing whitespace is rejected.
- `clientKey` is 1..128 printable ASCII bytes (`0x20..0x7e`) and not whitespace-only.
- `actorId` must equal `submitterId` after UUID canonicalization.
- `amount` and `currency` are either both null or both non-null. The only non-null amount
  grammar is `^(0|[1-9][0-9]{0,15})\.[0-9]{2}$`; therefore `1`, `1.0`, `01.00`, `+1.00`
  and exponent forms are rejected rather than normalized. Equality and summation use
  exact integer cents. Currency is exactly three uppercase ISO-4217 letters. Financial
  policy rules may additionally require cents `> 0`; non-financial actions require both
  fields null.

`canonicalPayload` has a plain object root and only `PropertyApprovalJsonValue` nodes.
A plain object has prototype exactly `Object.prototype` or `null`, only enumerable own
string-keyed data properties, and no symbol keys or accessors. Arrays must be dense.
Every string/key must contain valid Unicode scalar values (no unpaired surrogate).
Numbers must be finite safe integers and must not be negative zero. The following are
rejected recursively: `undefined`, functions, symbols, bigint, `NaN`, infinities,
fractional/unsafe numbers, `-0`, sparse array holes, cycles, `Date`, `Buffer`, typed
arrays, `Map`, `Set`, regex, class instances, accessors and non-enumerable properties.
Decimal business values must be strings governed by their domain schema.

### 5.2 Canonical UTF-8 and hash byte grammar

Canonicalization uses a recursive manual serializer. It must not construct a normalized
JavaScript object and must never call `JSON.stringify` on an object or array, because
ECMAScript property enumeration would move integer-index keys ahead of the frozen UTF-8
order. The exact serializer is:

```text
canonicalText(value):
  null    -> "null"
  boolean -> value ? "true" : "false"
  number  -> JSON.stringify(value)  // already validated finite safe integer, not -0
  string  -> JSON.stringify(value)  // one scalar string only
  array   -> "[" + value.map(canonicalText).join(",") + "]"
  object  ->
    keys = own enumerable string keys sorted by unsigned lexicographic UTF-8 bytes
    "{" + keys.map(key =>
      JSON.stringify(key) + ":" + canonicalText(value[key])
    ).join(",") + "}"

canonicalUtf8(value):
  UTF8(canonicalText(value))  // no BOM, spacing or trailing newline
```

Thus `JSON.stringify` is used only to encode one validated string key, string value or
scalar number. Null and booleans use the exact literals above. Arrays preserve their
original element order and recurse element-by-element. Object key sorting treats every
key uniformly: a key that happens to be an ECMAScript integer index receives no special
ordering. Strings are not NFC/NFD-normalized. SHA-256 output is 64 lowercase hexadecimal
characters.

The exact hashes are:

```text
payloadHash = sha256(canonicalUtf8(canonicalPayload))

submitRequestBytes = canonicalUtf8({
  expectedDecisionVersion: 1,
  requestId: lowercaseUuid(requestId)
})
submitRequestHash = sha256(submitRequestBytes)

submitResultBytes = canonicalUtf8({
  executionStatus: "not_started",
  executionVersion: 1,
  outcome: "submitted",
  requestId: lowercaseUuid(requestId)
})
submitResultHash = sha256(submitResultBytes)
```

For clarity, because keys are already in canonical order, the request bytes are exactly
the UTF-8 bytes of
`{"expectedDecisionVersion":1,"requestId":"<lowercase-uuid>"}` and the result bytes are
exactly the UTF-8 bytes of
`{"executionStatus":"not_started","executionVersion":1,"outcome":"submitted","requestId":"<lowercase-uuid>"}`.

Normative golden vector for request ID `00000000-0000-4000-8000-000000000001`:

```text
submitRequestHash = 37331ea1ca0efb36c78053d53eeab1400303b83c96d46d66326df728cbc573c9
submitResultHash  = 9810b46fb58878540c89ce90df0435613dc9ac52eba950a17a2b83d8236b45f0
```

Normative mixed-key golden, independent of insertion order:

```text
input own keys/values:
  "2"      -> "two"
  "10"     -> "ten"
  "é"      -> "accent"
  "普通"   -> "zh"
  "normal" -> "plain"

unsigned UTF-8 key order:
  "10", "2", "normal", "é", "普通"

canonical bytes interpreted as UTF-8 text:
  {"10":"ten","2":"two","normal":"plain","é":"accent","普通":"zh"}

sha256:
  81750994c44057efbb4e4ede693ac676a9adbee08324a0e171db48707aa0ca2c
```

In particular, the integer-index-looking key `"2"` remains after `"10"` because byte
`0x32` sorts after the first byte `0x31`; JavaScript's usual integer-index enumeration
must not rewrite the canonical result.

A port-created submit receipt has the closed legacy grammar:

```text
receipt_contract_version = "legacy-v1"
identity_kind = null
business_occurrence_key = null
task_key = null
identity_source_type = null
actor_id = canonical actorId = canonical submitterId
action_id = "property.approval.submit"
target_id = requestId
client_key = authoritative request.clientIdempotencyKey
request_hash = submitRequestHash
receipt_status = "completed"
result_ref = "property-approval:<requestId>:submitted"
result_hash = submitResultHash
result_version = null
completed_at IS NOT NULL
```

Replay requires dual proof: all identity/contract/status/result-ref fields above must
match and both `request_hash` and `result_hash` must independently recompute to the exact
bytes above. Checking request hash alone or trusting `result_ref` alone is forbidden.
Any identity/hash/result mismatch is `idempotency-key-conflict`; an incomplete receipt
is `property-runtime-unavailable` after the savepoint recovery protocol.
An alternate incoming key used to locate an existing request by business intent is not
part of the receipt identity and is never persisted on that request or receipt.

### 5.3 Exact request equality

Exact equality compares canonical scope, action, source identity/version,
requester/submitter/actor, business intent, payload schema version/hash, fixed-scale
amount and currency. `clientKey` is compared only in the client-key identity branch;
timestamps and runtime-generated IDs are never request inputs.

Invalid input is `property-validation-failed`. Missing/malformed policy or historical
actor evidence is `approval-policy-not-found`. A structurally valid policy with no
eligible checker after exclusions is `approval-no-eligible-approver`.

## 6. Replay and conflict matrix

Resolution occurs inside the caller transaction using section 3.1; a raw PostgreSQL
violation is never returned. If corrupt data matches more than one identity, the exact
priority is: **client key mismatch/replay, then business intent mismatch/replay, then
active source/version conflict, then terminal source-version monotonicity, then submit
receipt proof, then unknown constraint**. A higher-priority match is final and lower
branches are not allowed to override it.

| Observation | Required outcome |
|---|---|
| Same scoped requester/action/client key and exact request equality | Return original request; `replayed-client-key`. If it is a legacy draft, finish submission atomically first. |
| Same scoped requester/action/client key but any equality field differs | `idempotency-key-conflict`. |
| Same scoped action/business intent, different client key, exact request equality | Return original request; `replayed-business-intent`. If it is a legacy draft, finish submission using the authoritative request's persisted client idempotency key first; the alternate incoming key is not reserved. |
| Same scoped action/business intent but any equality field differs | `idempotency-key-conflict`. |
| Same active scoped action/source/source version but different business intent | `property-version-conflict`, with `latestVersion` set to the existing request decision version. |
| Terminal request and exact client-key or business-intent replay | Return that original request in its current terminal/execution state; never create a second request. |
| Terminal business-intent reuse with changed request equality | `idempotency-key-conflict`. |
| New intent for the same action/source with version less than or equal to the latest terminal source version | `approval-source-changed`, with `latestVersion` set to that terminal source version. |
| Known dependent stage/exclusion/manifest uniqueness contradiction | Roll back to the port savepoint, then `approval-reconcile-partial`. |
| Unknown constraint or unclassifiable unique violation | Roll back to the port savepoint, then `property-runtime-unavailable`; caller may prove the outer transaction is usable and decide to roll it back or continue without this operation. |

A completed submit receipt replays only after the section 5.2 request/result dual proof.
A visible `started`/`failed` receipt is `property-runtime-unavailable`; in a correct
caller-owned atomic transaction such a row cannot be left behind by this port, but the
rule protects legacy or corrupt state. Replay never changes business intent, execution
key, policy snapshot, effect ordinals or the original request timestamps.

Consequently, every exact request replay whose stored decision status is not `draft`
must locate and dual-validate its submit receipt before returning. An exact legacy draft
must create/complete that receipt while performing the submit edge. A non-draft request
with no receipt is `approval-reconcile-partial`; request-row equality alone is never
sufficient replay evidence. “Receipt” in the priority list is this mandatory proof
inside the already-selected identity branch, not permission to select a different
request.

Before returning any terminal replay, the port validates the frozen legal combinations:

```text
approved + not_started | executing | retry_wait | executed |
           execution_failed | infra_exhausted
rejected + not_required
withdrawn + not_required
expired + not_required
```

Any other terminal decision/execution pair is corrupt authority and returns
`approval-reconcile-partial`; it is never repaired or projected as a successful replay.

## 7. Projection semantics and cardinality

All projection queries enforce exact tenant+park predicates in SQL.

- `findById`: cardinality `0..1`; wrong scope and absent ID both return `null`.
- `findActiveBySource`: cardinality `0..1`, using the frozen active predicate from
  runtime section 4.3. More than one row is `approval-reconcile-partial`; the port must
  not choose one silently.
- `listBySource`: cardinality `0..N`; includes active and terminal requests, ordered by
  `created_at DESC, id DESC`. The deterministic ID tie-breaker is mandatory.

Projection ports are internal domain integration ports, not controller authorization
surfaces. They neither accept user-supplied scope nor replace approval read
authorization. An HTTP/controller caller must first derive scope from the authenticated
principal and pass the existing approval read-authorization Gate. Domain services may
use them only for their already-authorized, locked owning source. The port never throws
not-found for absence, preventing a cross-scope existence oracle; malformed UUID/query
input remains `property-validation-failed`.

## 8. Legacy compatibility rule

`PropertyApprovalService.createDraft(...)` and `submit(...)` remain source-compatible
legacy entry points. The runtime owner must extract manager-aware internal primitives:

```text
createDraftWithManager(manager, scope, command)
submitWithManager(manager, scope, actor, requestId, command)
```

The legacy methods open their existing outer transaction and delegate once. The new
`createPendingRequest` implementation delegates to both primitives with the supplied
manager and opens no transaction. The service may implement
`PropertyApprovalCommandPort` directly and bind the shared token with `useExisting`;
no second implementation of the state machine is allowed.

Legacy drafts remain readable and submit-able. An exact port replay that locates a
legacy draft may atomically complete its submit edge. Existing public DTOs, routes,
HTTP status codes and legacy-v1 submit-receipt rows are otherwise unchanged.

The port does not upgrade or rewrite pre-existing receipts. It may replay an existing
receipt only if that row already satisfies the complete closed `legacy-v1` grammar and
dual hash proof in section 5.2. A historical row that does not satisfy that proof remains
usable only through its existing legacy endpoint compatibility path; the new port fails
closed with `idempotency-key-conflict` and does not guess an alternate hash grammar.

## 9. Maker-checker, receipt and effect invariants

- Requester and submitter are always persisted as actor exclusions. Required source
  creator, payment recorder, purchase creator and payment executor exclusions remain
  action-specific and fail closed when history is unknown.
- The authenticated `actorId` must equal `submitterId`; the same canonical UUID is the
  submit receipt actor. A caller cannot nominate another actor as receipt owner.
- No excluded actor can satisfy an eligibility count. Every stage must retain at least
  one eligible checker at submission time. Decision-time authorization still rechecks
  current tenant+park, permission, scope, exclusion and prior decisions.
- The submit receipt and request transition commit together. Request idempotency,
  mutation receipt and execution effect receipt remain three independent protections.
- Creation writes only frozen effect manifests. It writes no domain effect row, effect
  receipt, approval terminal event, task, notification or external side effect.
- Manifest kind, ordinal, stable line key, owning unique, cardinality, amount/currency
  and invariant hash must exactly match the current frozen authority. Runtime execution
  later owns effect row + effect receipt + audit + outbox atomicity.
- The command port cannot approve, execute, publish or compensate. A successful create
  therefore cannot bypass maker-checker or produce a high-risk business effect.

## 10. Required targeted goldens

The independent Gate and later runtime implementation must include targeted goldens for:

1. exact token exports, symbol descriptions, interface/method names and contract version;
2. compile-time exact command/projection keys and all nullable fields;
3. missing, fake and inactive transaction contexts; supplied manager identity preserved;
4. a spy proving zero nested `DataSource.transaction`, query-runner create/commit/rollback
   and manager release calls;
5. atomic created path with one request, stages/exclusions/manifests, three ordered audits
   and one completed `legacy-v1` submit receipt whose actor equals submitter;
6. rollback after each write boundary, leaving zero partial rows;
7. same client key/same request replay and same key/different request conflict;
8. same business intent/different key exact replay and changed-request conflict;
9. concurrent client-key, business-intent and active-source unique races with deterministic
   replay/conflict translation;
10. exact replay of all nine legal terminal combinations: approved paired separately
    with not_started, executing, retry_wait, executed, execution_failed and
    infra_exhausted; rejected, withdrawn and expired each paired with not_required;
11. every illegal terminal decision/execution combination returning
    `approval-reconcile-partial`;
12. legacy draft completion and authoritative receipt identity: first alternate-key
    business-intent completion writes exactly one receipt with the persisted request key
    and exact request/result hashes; a third same-intent key is
    `replayed-business-intent` with no second request/receipt; the original key is
    `replayed-client-key`; original key plus changed intent is
    `idempotency-key-conflict`; an unreserved alternate plus changed intent on the same
    active source/version is `property-version-conflict`; independently corrupt
    request-hash, result-hash, receipt key to either alternate, result-ref, actor,
    version/nullability, status and contract-version negatives;
13. active duplicate corruption (`>1`) returning `approval-reconcile-partial`;
14. terminal source-version monotonicity and deterministic terminal list order;
15. cross-tenant/cross-park ID and source probes returning null/no rows;
16. policy missing, malformed manifest, missing historical actor and no eligible checker;
17. actor/submitter equality, requester/submitter exclusion, maker-checker denial and zero domain effects/outbox on
    request creation;
18. fixed two-decimal amount acceptance and rejection matrix, cents equality/summation,
    currency pairing and proof that no JavaScript-number conversion occurs;
19. every version at `1` and `2147483647`, plus rejection of 0, negative, fractional,
    `2147483648`, `Number.MAX_SAFE_INTEGER + 1`, `NaN` and infinity;
20. closed JSON positives (null-prototype object, nested dense arrays, safe integers) and
    a separate negative for every rejected node/prototype/accessor/cycle category in
    section 5.1;
21. canonical UTF-8 byte fixtures for nested key ordering, non-ASCII keys/values,
    escaped controls, NFC versus NFD distinction and unpaired-surrogate rejection;
    the exact mixed `"2"`/`"10"`/ordinary/non-ASCII key SHA above; and array order with
    integer, string, boolean and null elements preserved by recursive serialization;
22. exact 64/65-byte `sourceType`, 128/129-byte business-intent and 128/129-byte client
    key boundaries, including multibyte Unicode boundaries for the first two;
23. exact request/result canonical byte fixtures and known SHA-256 literals, plus proof
    that BOM, newline, spacing or alternate key order changes/rejects the proof;
24. client-key > business-intent > active-source > terminal-version > receipt > unknown
    conflict priority when fixtures deliberately satisfy multiple branches;
25. request/receipt `ON CONFLICT DO NOTHING` races and known dependent/unknown constraint
    failures under the normative savepoint protocol;
26. after each replay, classified conflict and unknown-constraint error, execute a
    sentinel SELECT and INSERT with the same caller manager to prove the outer
    transaction is still usable; then prove caller commit and caller rollback behavior;
27. same-transaction projection visibility before caller commit and no visibility after
    caller rollback.

Contract goldens must be generated from the exact shared exports, not duplicated test
interfaces. PostgreSQL concurrency/rollback cases belong to the approval-runtime owner;
the shared owner supplies compile-time/runtime ABI goldens.

## 11. Open findings and release conditions

First-review disposition:

| Returned item | v2 closure |
|---|---|
| P1-1 actor/submitter ambiguity | `actorId` is explicit and must equal `submitterId`; receipt actor is the same UUID. |
| P1-2 receipt/hash replay ambiguity | Closed `legacy-v1` row grammar plus exact request/result canonical bytes and mandatory dual proof. |
| P1-3 unique conflict aborts caller transaction | Normative savepoint plus request/receipt `ON CONFLICT DO NOTHING`; usable-transaction golden. |
| P1-4 open `Record<string, unknown>` payload | Recursive `PropertyApprovalJsonValue`, plain-object and dense-array closure. |
| P1-5 unspecified canonical/reject behavior | Unsigned UTF-8 key ordering, JSON bytes, Unicode rule and complete recursive reject matrix. |
| P2-1 ambiguous decimal spelling | One fixed two-decimal grammar and integer-cents equality/summation. |
| P2-2 unbounded versions | Safe PostgreSQL-int range `1..2147483647` for every non-null version. |
| P2-3 missing boundary/conflict/terminal goldens | UTF-8 boundaries, all terminal pairs, unknown constraint and conflict-priority cases added. |

Second-review disposition:

| Returned item | Current closure |
|---|---|
| P1 canonical object serialization | Whole-object/array `JSON.stringify` is forbidden; recursive manual serialization, uniform unsigned UTF-8 key ordering, scalar-only encoding and mixed integer-index/non-ASCII exact SHA golden are frozen in section 5.2. |

Contract-candidate findings:

```text
open_P0=[]
open_P1=[]
open_P2=[]
```

Pending release work is not silently treated as a finding closure:

1. independent contract review must return `open_P0_P1=[]`;
2. shared owner must implement the accepted declarations and goldens, publish a new
   current B-contract/shared SHA, update the authority locator and retain rejected SHAs;
3. approval-runtime owner must implement only under
   `apps/api/src/modules/property-approvals/**` and pass the targeted independent Gate;
4. B-2c domain adapters remain fail closed until both new handoffs are current.

Verdict: **contract design complete; ready for independent review; production
implementation remains BLOCKED.**
