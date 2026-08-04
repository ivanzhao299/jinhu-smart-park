# B-2a C2 Property-task Projection Budget Addendum v3 Candidate Evidence

> Date: 2026-08-01 (Asia/Singapore)
>
> Status: `CANDIDATE EVIDENCE / THREE-PARTY REVIEW PENDING / NOT PASS`

## 1. Candidate identity

| Item | Exact value |
|---|---|
| Candidate raw SHA-256 | `127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4` |
| Grammar header | `b2a-c2-projection-budget-addendum-v3` |
| Canonical budget digest | `d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45` |
| Canonical grammar bytes | `1692` |
| Canonical grammar hex characters | `3384` |

Exact full canonical grammar hex:

```text
6232612d63322d70726f6a656374696f6e2d6275646765742d616464656e64756d2d76330a696e7075740972756e74696d652d667265657a652d72617709316336316334323562373039623431353534323364366666663161333963653737386539393566663936616566343131333564663263343130623135623237640a696e70757409706879736963616c2d616464656e64756d2d72617709333833306231326436363562626662333963366532373437363337656264313539326637616266626534643434616635336336346161313233646438343464350a696e70757409636f7272656374696f6e2d706c616e2d72617709623839646536613637356539616664663734393038363166383630303839386432363538646435633236626536343639616439336663666464393566393364610a696e7075740963302d7369676e6f66662d72617709313932613033366134363435323434623163616565313266663262653234306361323562646662393563353039353531346339323038653635306561613338360a696e707574097368617265642d68616e646f66662d72617709613961396437626261633539356138353234383337373462326137383833303535613932356533366636323165323633353936373063666662306361393337310a696e70757409622d7368617265642d736f7572636509623439333030303666346539626566366632393736616235623065316135313237353631636462363537366334363436353061633832636630383634303536610a696e7075740963312d66696e616c2d7369676e6f66662d72617709313835366437613539303366633530323261363930346536653231633932626531363035366138346566323235303834366233316663376261613737353035360a627564676574096275646765745f6f726967696e096e65772d70726f70657274792d7461736b2d70726f6a656374696f6e2d616464656e64756d0a627564676574096d6967726174696f6e5f6c6f636b5f74696d656f75745f6d7309353030300a627564676574096d6967726174696f6e5f73746174656d656e745f74696d656f75745f6d730936303030300a6275646765740970726f6a656374696f6e5f7265706c6163655f62617463685f6d61785f726f7773093230300a6275646765740970726f6a656374696f6e5f7265706c6163655f7472616e73616374696f6e5f6c696d69745f6b696e6409686172640a6275646765740970726f6a656374696f6e5f7265706c6163655f7472616e73616374696f6e5f686172645f6c696d69745f6d7309353030300a6275646765740963325f676174655f6f757465725f7761746368646f675f6d730936303030300a62756467657409706f7369746976655f6d656173757265645f617474656d7074735f65786163740932300a62756467657409706f7369746976655f617474656d70745f6578636c756465645f657861637409300a62756467657409706f7369746976655f617474656d70745f7265706c6163656d656e745f657861637409300a73656d616e7469630962617463685f73636f706509636f6d706c6574652d736f757263652d7265706c6163656d656e740a73656d616e7469630967756172647309616461707465722d61646d697373696f6e2d63616c6c65722d70726f73706563746976652d66756e6374696f6e2d66696e616c0a73656d616e74696309646561646c696e65096162736f6c7574652d6d6f6e6f746f6e69632d626567696e2d64697370617463682d7468726f7567682d636f6d6d69742d61636b0a73656d616e74696309706f7369746976655f617474656d707473097072656465636c617265642d7265636f72642d616c6c2d6e6f2d7265706c6163650a73656d616e746963097072655f636f6d6d69745f6661696c75726509726f6c6c6261636b2d756e6368616e6765640a73656d616e74696309636f6d6d69745f616d626967756f7573097369676e65642d6d6f64652d73616d652d6c6f676963616c2d6964656e746974792d7265636f7665720a73656d616e746963096661756c745f73716c737461746573096f76657273697a652d32323032332d6c6f636b2d35355030332d6c6174652d50303030312d706f73742d617574686f726974792d32323032332d616d626967756f75732d30383030360a73656d616e746963096170695f627573696e6573735f636f6e747261637409756e6368616e6765640a73656d616e7469630963325f70656e64696e670970726f64756374696f6e2d63616c6c65722d63342d7265616c2d616461707465722d6232630a
```

The candidate's embedded Node command reproduced marker cardinality `1/1`,
digest, byte length and full hex without normalization beyond `<TAB>` to `09`.
All v1/v2 and disputed digests are superseded and invalid.

## 2. v3 dispositions incorporated

### A. Fixed positive attempts

For every action or signed worst-path representative, the contract now requires
at least five warm-ups followed by exactly twenty predeclared measured ordinals.
All twenty execute once and remain recorded; exclusion and replacement counts
are both exactly zero. Unexpected timeout, cancellation, SQL error, missing
ack, ambiguity or late ack records its actual outcome and immediately fails the
Gate. p95 and max use all twenty; raw nanoseconds govern the hard deadline.
Negative tests use separate unique `injection_id` values.

### B. Commit ambiguity and signed receipt mode

Recovery preserves one logical identity and uses the already signed selection:

- command/manual: `execute-or-replay`, including one legitimate physical
  receipt insert when exact identity is absent;
- terminal after lock: active selects `execute-or-replay`; same-terminal selects
  `existing-only`;
- completed exact receipt replays; started/failed fail closed; existing-only
  absent fails closed.

Evidence must cover actually committed and actually not-committed outcomes,
locked state, acquire mode, exact logical identity, receipt insert count and new
logical action count. The prohibition is a second logical action/different
identity, not all physical receipt insertion.

### C. Frozen faults

| Marker | SQLSTATE | Required stage |
|---|---|---|
| `oversize-preaccess` | `22023` | Top-level/object validation and count complete; receipt/head access both zero. |
| `forced-lock-delete-replace-wait` | `55P03` | Block at exact projection DELETE/replacement write. |
| `late-precommit-after-projection-head-audit` | `P0001` | Projection/head/audit written; receipt incomplete; COMMIT undispatched. |
| `post-authority-oversize` | `22023` | Authority changed then final 201 guard rejects; whole transaction rollback. |
| `commit-ambiguous-after-dispatch-link-cut` | `08006` | Link cut only after COMMIT dispatch; same-identity recovery resolves truth. |

### D. Machine evidence schema

The candidate now requires schema version, run identity/times/base commit;
container image digest, CPU/RAM/OS and PostgreSQL settings; deadline/begin/ack/
outcome; mode and source/head/receipt/payload/rowset hashes; remaining budget
and effective timeouts; exact positive attempt counts and raw attempts; negative
injection point/SQLSTATE/blocker timeline; snapshot hash grammar; stage markers
and receipt/head access counts; pre/post count+SHA for authority, assignment,
audit, head, projection, replacement audit and receipt; ambiguity truth/mode/
identity/insert/new-action/outcome; exact cleanup targets/status; pending states
and all review fields.

## 3. Review checklist

Each architecture/database, test/security and product/RBAC/interaction reviewer
must independently accept or return all of the following:

1. exactly 20 predeclared positive attempts, 20 recorded, 0 excluded, 0
   replacement, with failures retained;
2. negative injections are separate and cannot substitute for positives;
3. command/manual and both terminal branches use the exact signed acquire mode;
4. completed/started/failed/absent dispositions and physical receipt insert
   semantics match the signed receipt contract;
5. all five marker/SQLSTATE/stage combinations are exact;
6. both committed and not-committed ambiguity outcomes reconcile under the same
   logical identity with no second business action;
7. expanded evidence schema, snapshot grammar and cleanup targets are complete;
8. canonical v3 raw SHA/digest/1692 bytes/full hex reproduce exactly;
9. C2 retains `pending_C4` production caller and `pending_B2c` real-adapter
   admission;
10. C1 re-sign remains unnecessary only while every C1 input is unchanged.

## 4. Gate status

```text
review.architecture_database = pending
review.test_security = pending
review.product_rbac_interaction = pending
review.open_p0_p1 = not_computed
candidate_gate = NOT_RUN
C2_budget_release = blocked
```

No reviewer has signed this candidate. No signed C0/C1 file, shared source,
code, migration, runner, or database was modified by this v3 revision.
