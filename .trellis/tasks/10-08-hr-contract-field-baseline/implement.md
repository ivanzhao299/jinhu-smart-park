# Implementation

1. Add actual-PG old-subset reproduction and retain failing evidence.
2. Add bounded verified field admission and narrow revision marker.
3. Expand PG coverage for unchanged/changed/modern/lifecycle/permissions/rollback/concurrency and original immutability; run existing importer PG, contracts, type/lint.
4. Publish latest clean candidate, CI, merge/deploy with auto scope; verify changed API and retained Web runtime plus health/cleanup.
5. Preserve task checkpoint and whole S0-S7/independent-HR goal.

Local results: reproduced the old-subset false conflict before fix. Real original-receipt PG gate passes 8 tests including seven named admission scenarios and existing original migration/hash/concurrency/rollback checks; independent actual importer PG passes; 12 focused API contract/term/prepared-profile tests pass. Source recipe/shared/Web untouched. API type/lint checks pass; post-expansion final check and publication pending. Both random databases removed; owned PG stopped. No production business writes.
