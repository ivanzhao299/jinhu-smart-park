# Reused bundle: new isolated run configuration

`prepare-yuzhou-real-bundle-lab-config.mjs` prepares a new run configuration only.
It does not start Docker, connect to a database, open keys, decrypt envelopes,
perform source extraction, copy prepared business files, or execute a rehearsal.

Create a private request file containing these required keys:

```json
{
  "existingConfig": { "path": "<private original config>", "sha256": "<raw SHA-256>" },
  "runId": "<new unique run id>",
  "targetDatabase": "jinhu_hr_migration_lab_<new unique suffix>",
  "outputDirectory": "<existing empty private directory>"
}
```

An optional `baselineCounts` key may explicitly supply the complete 16-table
count map when the new target's independently observed seed baseline differs.
Only `sys_org=14` (historical) or `15` (current standard seed) is accepted;
`hr_contract_type=3` and all other target tables `0` remain mandatory. Omission
preserves the original map. The receipt records `baselineCountsOverridden`,
`originalBaselineCounts` and selected `baselineCounts`; the config hash also pins
the selection. This is not a substitute for preflight: observed counts must match
the selected exact value, not merely either allowed number. Never delete a valid
seed organization to make a target match the historical baseline.

Invoke from the clean committed candidate using the raw request digest:

```sh
node scripts/hr-cutover/prepare-yuzhou-real-bundle-lab-config.mjs \
  --request <private-request> --request-sha256 <request-hash>
```

The output is `lab-config.json` and a readback-verified, fsynced, receipt-last
`lab-config-preparation-receipt.json`. The returned safe summary contains the new
config hash and manifest hash. Partial files without that receipt are not ready;
preserve them for inspection, never overwrite them or reuse an occupied run.

Prepared C/S/M, source scope, operationId, crypto descriptors and counts remain
unchanged. Current code/dependency/runtime fingerprints are recorded separately.
The operationId is part of ciphertext AAD: changing it without actual crypto
re-sealing is invalid. This input reuse is not independent-key or independent
trust-root evidence. The shared stateRoot remains the original global lock root;
old checkpoint/http/final records are retained and any existing lease blocks prep.
The target database must differ; this tool does not create it or prove emptiness.

After authorized target setup, retain the original pinned container/image/loopback
binding and run the existing CLI with the returned config hash:

```sh
node scripts/hr-cutover/run-yuzhou-real-bundle-lab.mjs \
  --validate --config <new-config> --config-sha256 <new-config-hash>
node scripts/hr-cutover/run-yuzhou-real-bundle-lab.mjs \
  --preflight --config <new-config> --config-sha256 <new-config-hash>
```

`--validate` must still authenticate the actual existing envelopes and key files;
preparation deliberately does not read their contents. `--preflight` must prove
target ownership, zero competing connections/active maps, expected seed baseline,
and capacity. Ensure frozen API dependencies including `pg` are installed in the
same candidate; no automatic install/fallback is performed here.

`CONFIG_PREPARED` is neither `LAB_PASS` nor formal A/B equivalence. Independent
Compose/ports/networks/volumes/crypto trust roots and formal same-C A/B evidence
remain separate requirements; the production authorization and A/B gates are
unchanged. No real data, credentials or private paths belong in public output.
