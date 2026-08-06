# B-2c Legacy Draft Receipt Client-Key Contract Change Request

Date: 2026-08-02  
Status: OPEN / P1 CONTRACT DECISION REQUIRED  
Frozen contract SHA: `5cb700cc3265a75422e3204cea30598b84ca7919dfa9c0e6a65194bd3ed48597`

## Conflict

The frozen contract currently requires both:

- section 6: a legacy draft found by the same business intent and a different incoming
  client key is completed "using the current supplied key";
- section 5.2 replay proof and QA's authoritative-request rule: a completed receipt's
  `client_key` must exactly equal the authoritative request identity
  `request.client_idempotency_key`.

For a pre-existing draft whose stored request key is `draft-key`, completion through
the same business intent with incoming `new-key` cannot satisfy both rules. Writing
`new-key` makes future authoritative replay fail receipt proof; writing `draft-key`
contradicts the frozen "current supplied key" sentence.

## Recommended unique rule

Adopt the QA-recommended authority rule:

```text
submit receipt client_key = authoritative request.client_idempotency_key
```

The incoming command key is used only to locate the client-key branch and to establish
client-key versus business-intent conflict priority. It never rewrites the request key
and never becomes the receipt key of an already-existing request.

Consequences:

1. New request: stored request key, incoming key and receipt key are identical.
2. Legacy draft found by original client key: receipt uses the stored request key.
3. Legacy draft found by business intent with a different incoming key: receipt still
   uses the stored request key; disposition is `replayed-business-intent`.
4. Repeating that same business-intent command with either the original or another new
   incoming key validates the one receipt against the stored request key and replays.
5. The incoming alternate key is not reserved as a second request or receipt identity.

## Required contract edit and goldens

Replace section 6's phrase "finish submission using the current supplied key" with
"finish submission using the authoritative request's persisted client idempotency key".
Update section 4 step 7 and section 5.2 `client_key = command.clientKey` to distinguish a
new request from an existing legacy draft.

Required goldens are mandatory and must be synchronized into the signed main contract
section 10, not left only in this change request:

1. A legacy draft found by the same business intent with first alternate incoming key
   completes exactly once. The single receipt uses the persisted request key and exact
   canonical request/result dual hashes.
2. A third incoming key with the same business intent returns
   `replayed-business-intent`, creates no second request and creates no second receipt.
3. The original persisted key returns `replayed-client-key` and validates the same
   single receipt.
4. Conflict matrix: original persisted key plus a different business intent returns
   `idempotency-key-conflict`; an unreserved alternate key plus a different intent and
   the same active source/version returns `property-version-conflict`.
5. Independently corrupting `request_hash`, `result_hash`, or receipt `client_key` to
   either alternate key returns `idempotency-key-conflict`.

The signed authority update must change all four normative locations together:

- section 4 step 7 (receipt acquisition key for new versus authoritative request);
- section 5.2 (closed receipt grammar and replay proof);
- section 6 (legacy draft business-intent completion/conflict matrix);
- section 10 (the five mandatory golden groups above).

No runtime semantic change for this item may be promoted until the contract authority
accepts and publishes the revised signed contract. Conflict-classification and
savepoint-usability corrections are independent and may proceed meanwhile.
