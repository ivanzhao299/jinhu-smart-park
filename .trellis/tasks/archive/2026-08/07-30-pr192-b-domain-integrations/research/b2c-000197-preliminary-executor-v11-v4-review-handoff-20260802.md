# B2c 000197 preliminary executor v11 v4 review handoff

Status: frozen candidate awaiting exact database GO, QA/security GO and old-writer drain GO. This handoff does not authorize live execution. All v1/v2/v3 freeze outputs are audit-only.

- Formal run ID: `b2c197_prelim_20260802f`
- Targets: exact E/F SUCCESS authority only
- Resource authority SHA: `6c1c38fae1a91387af2e0f27cbac88d58d15f80e91f4ef7a9c1baf5b8cb6e424`
- Recovery SUCCESS handoff SHA: `387f9750065b0ee56009b9a2ff92ab178bd2586d97c498198df0528032a85183`
- Recovery terminal/manifest SHA: `548df7ba050aa4a9fae48280662c8b90298d0415542a172e191ace2d2e008bdd` / `ddfa1d8df83e0698aba41383db1ccdd7fdcfba6150ffbcf0ed443e6b75b9dd68`
- Read-only preflight SHA: `13de4c00f84e8ffe3bb1e0cae50159ae848ebd10e5abbf78311f788ac8cc873a` / `99a279311cc542d27c8f9f448d865f52b846e5441d6daeb5a423261a0fbe6463`
- SQL SHA: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- Writer: `approval-port-v8`; runtime v8 SHA `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Manifest SHA: `a8f4fdf92561693f4e393806f1aa64607038a552ec98e8e5d5dd6b482b7b433b` (1000 rows)
- Failure cases SHA: `862975e6b44914ac7747658b00daf87e5ce6798c6a556dc51924dd62065e0af1`
- Executor SHA: `f914917daa0a8008e5d705196b52ebe4c91b0dbccd1c742e545130a20e90eae2`
- Orchestrator SHA: `11e4dd468d9d95a6594f412f9e7eabd1243e7a892fe419b543db8fa45c1824a9`
- Resolver SHA: `c4e4bdfa3d945cb61f4478219a7d712f134fea5773a1ed1107428eac9cc28e7c`

The candidate already contains guarded formal execution. Database review binds the frozen candidate. QA additionally binds the database review SHA. Drain binds both review SHAs, avoiding cyclic hashes. Every authority uses a fixed path/header, exact fields, formal_go=true, decision=GO and open_p0/open_p1/open_p2=0; missing, duplicate, unknown, stale or wrong values fail before the formal evidence root is created.

The formal callgraph executes all four inline P0001 fault boundaries on both targets before the first migration. Failure terminals persist only the safe child SQLSTATE/marker/snapshot summary. Formal/live remains blocked until all three new GO files pass exact intake.
