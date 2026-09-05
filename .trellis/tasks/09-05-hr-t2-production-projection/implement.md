# Execution

1. Compare extractor, transform, isolated loader, T2 phase artifact and production target model.
2. Implement pure projections without another writer or source pass.
3. Test complete target field sets, exact decimal strings, null/zero, invalid/unmapped input, date preservation and source/evidence identity.
4. Wire the tests into the existing production import verification entry and document remaining candidate assembly work.
5. Run focused contracts and independent review before publishing. Do not disturb the active backup deployment or claim production import readiness.

6. Implement and test candidate graph assembly in a bounded worker while the coordinator checks the existing release/backup workflow and maintains docs/test wiring. Do not spawn nested workers, extract real records, run full A/B or publish a partial PR.
7. Review graph tests against actual target foreign keys, reuse collision/hash helpers, run existing payload/bridge/T2 contracts, and preserve a local checkpoint for private materializer integration.
