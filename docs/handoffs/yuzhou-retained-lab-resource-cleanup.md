# Dedicated retained lab resource cleanup

API: `cleanupYuzhouRetainedLabResources({ prepareRequest, prepareReceipt, resourceDescriptor, sideConfig, finalReceipt, httpRegistry, outputDirectory })`. Each input except the empty private output directory is a `{ path, sha256 }` descriptor. The prepare receipt/descriptor and side final/HTTP files must occupy their original fixed registry locations. CLI:

```sh
node scripts/hr-cutover/yuzhou-retained-lab-resource-cleanup.mjs --cleanup --request /absolute/private/cleanup-request.json --request-sha256 <sha256>
```

Cleanup accepts only a real-command prepare receipt and a complete persisted side LAB_PASS with HTTP, rollback, zero residual, expected counts and source/execution bindings. The original request must match run/name/image/port, generated Compose bytes and descriptor. The same explicitly bound local Unix socket/daemon identity, persistent resource lease nonce and live owner labels are verified. Strict resource descriptor checks occur before deletion. No system socket, Docker context or shared resources are changed.

The existing global runtime lease is acquired exclusively; an active or stale writer lease is not stolen. Cleanup additionally writes an exclusive retained intent into the original resource lease. A new dedicated pg client connects only to the verified loopback port/database. In a REPEATABLE READ READ ONLY transaction with statement timeout, the existing pg probes verify actual baseline counts, ledger rollback status, zero active maps/running batches/other connections, and the exact registered HTTP fixture IDs. ROLLBACK and connection close complete before any resource removal.

Only the registered container ID, then network ID, then volume name with creation-time/owner checks are removed. Every deletion has a private fsynced intent written first and bounded enumeration confirming absence afterward. There is no retry of deletion commands and no global prune, compose down, wildcard removal or directory deletion. The final cleanup receipt is emitted last only after all three absence checks and runtime lease release succeed.

Original keys, passwords, source/prepared files, Compose config, registry, stage/final receipts and resource lease are preserved. Failure or acknowledgement loss requires explicit review; the retained cleanup intent prevents blind retry. There is no crash-resume implementation. Tests may inject commands/clients but produce `synthetic_adapter` evidence, not real cleanup proof. Even real cleanup output is not itself a formal finalRehearsalPair or production authorization.
