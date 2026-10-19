# Ordered implementation

1. Read applicable API/shared/Web specs and exact service/DTO/frozen-source SQL/table contracts; report mismatch before guessing.
2. Implement additive opt-in source-value projection with strict DTO, exact decimal strings, issue flags, required audit and existing bindings. Add focused API tests and realPG SQL fixture using existing HR PG harness; no new migrations.
3. Add typed Web opt-in request and complete bounded preview/apply for whole selected source roster. Reuse selection/decimal/CSV ownership patterns. Explicit default fill-blanks mode, optional explicit replacement, no automatic writes.
4. Real combined actual parent composition tests plus existing source/save/correction/route contracts; API precision/NULL/duplicate/scope/audit/drift and input tests. Sharedbuild/API+Weblint/typechecks. Keep workers1 where practical.
5. Sequential independent trellis-check; root actual desktop/mobile synthetic browser. No child commits/deploys.
6. Root freshbase gate, focused required specs synchronized, commit/PR/CI/full release health→Docker cleanup→independentruntime/Julyreadonly. RealJuly rules/input business signoff remains separate, fullgoalactive.
