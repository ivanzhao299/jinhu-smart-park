# Retained bundle sequential pair owner

Each default side execution starts a fresh Node subprocess with a fixed executable and fixed existing CLI path/arguments, without a shell. Nest/AppModule/ConfigModule caches cannot cross A/B. SIGINT/SIGTERM are forwarded to the active child and cancellation cannot claim success. Raw child stderr, exceptions and extra stdout fields are not returned; only the bounded status and persisted receipt hash are consumed before independent receipt verification.

API: `runYuzhouRetainedBundlePair({ A: { path, sha256 }, B: { path, sha256 }, outputDirectory })`. Paths identify immutable private side configs prepared for existing dedicated resources. The output directory must already be private and empty. The optional API runner injection is exclusively a synthetic test seam; results using it are labeled `evidenceMode: synthetic_adapter`. Production CLI offers no injection:

```sh
node scripts/hr-cutover/run-yuzhou-retained-bundle-pair.mjs --execute-isolated --request /absolute/private/request.json --request-sha256 <sha256>
```

Before execution, the owner verifies config hashes, strict resource separation, same source config/material receipt/prepared triple, different side/run/operation/key references, and matching complete execution bindings. It invokes the existing CLI lifecycle once for A, reads the actual persisted final wrapper through its integrity verifier, then invokes B only after A passes. Each final receipt must prove LAB_PASS, HTTP verification, rollback, zero residuals, no failure codes and expected counts. Both receipts must carry identical measured execution commit, executor and runtime-tree identity while retaining source preparation identity separately. Both are read back again before receipt-last publication.

Failures do not automatically rerun either side, including missing or ambiguous final receipts. Existing side checkpoints/final receipts must be reconciled by the controller. The owner does not provision Docker, restore/extract SQL, clone datasets or use the old core pair runner. Side CLIs retain their existing shared exclusive lease and transaction ownership.

Success is `RETAINED_PAIR_DATABASE_LIFECYCLES_PASS`. The private `pair-lifecycle-receipt.json` contains only safe bindings/counts and explicitly says Docker resources are not cleaned, independent trust roots are not verified, and formal finalRehearsalPair is not produced. Database reverse rollback/residual proof is not Docker volume/network/container cleanup proof. Dedicated resource production, real resource cleanup evidence and formal pair evidence assembly remain necessary follow-ups; old core cleanup receipts cannot be reused.
