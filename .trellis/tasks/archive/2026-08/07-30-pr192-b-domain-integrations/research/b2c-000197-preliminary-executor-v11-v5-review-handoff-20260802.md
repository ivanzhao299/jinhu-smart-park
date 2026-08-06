# B2c 000197 preliminary executor v11 v5 review handoff

Status: frozen candidate awaiting exact database GO, QA/security GO and old-writer drain GO. This handoff does not authorize live execution. All v1/v2/v3/v4 freeze outputs are audit-only.

- Formal run ID: `b2c197_prelim_20260802f`
- Targets: exact E/F SUCCESS authority only
- Resource authority SHA: `6c1c38fae1a91387af2e0f27cbac88d58d15f80e91f4ef7a9c1baf5b8cb6e424`
- Recovery SUCCESS handoff SHA: `387f9750065b0ee56009b9a2ff92ab178bd2586d97c498198df0528032a85183`
- Recovery terminal/manifest SHA: `548df7ba050aa4a9fae48280662c8b90298d0415542a172e191ace2d2e008bdd` / `ddfa1d8df83e0698aba41383db1ccdd7fdcfba6150ffbcf0ed443e6b75b9dd68`
- Read-only preflight SHA: `13de4c00f84e8ffe3bb1e0cae50159ae848ebd10e5abbf78311f788ac8cc873a` / `99a279311cc542d27c8f9f448d865f52b846e5441d6daeb5a423261a0fbe6463`
- SQL SHA: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- Writer: `approval-port-v8`; runtime v8 SHA `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Manifest SHA: `e6d79fc1581ba580932b4689095117ffd2b482d33f5809c71964102f7b5af017` (1000 rows)
- Failure cases SHA: `862975e6b44914ac7747658b00daf87e5ce6798c6a556dc51924dd62065e0af1`
- Executor SHA: `45041f5953f20a4e6820d9c6248b3677adab233a4b6e13afedc75e27e1cee81d`
- Orchestrator SHA: `88e430267c061d77143aee5f4e6677d848e924ece677ff2820655c6f5f3b7e5d`
- Resolver SHA: `c4e4bdfa3d945cb61f4478219a7d712f134fea5773a1ed1107428eac9cc28e7c`

The candidate already contains guarded formal execution. Database review binds the frozen candidate. QA additionally binds the database review SHA. Drain binds both review SHAs, avoiding cyclic hashes. Every authority uses a fixed path/header, exact fields, formal_go=true, decision=GO and open_p0/open_p1/open_p2=0; missing, duplicate, unknown, stale or wrong values fail before the formal evidence root is created.

The formal callgraph executes all four inline P0001 fault boundaries on both targets before the first migration. Failure terminals persist only bounded and redacted child validity, SQLSTATE, marker and truthful snapshot checked/exact state. Formal/live remains blocked until all three new GO files pass exact intake.
