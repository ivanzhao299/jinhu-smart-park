# Yuzhou private import transport

This is a transport for the existing `execute-production-import.mjs` CLI, not a
deployment or an additional authorization producer. The public repository and
Actions logs must never receive plaintext HR artifacts, database credentials,
crypto keys, or complete failure output.

The `prepare-yuzhou-private-import` and `execute-yuzhou-private-import` dispatch
modes run an independent job in the existing Deploy Production workflow. Its
shared concurrency group serializes it with deployments. Neither mode enters
the deployment job. Dispatch the reviewed transport branch using `--ref`; do
not deploy that branch as the application. The executor checkout and the
`EXECUTOR_SHA` constant must both be pinned to the final approved application
commit. There is no caller-supplied ref, command, repository, or download URL.

## Packet preparation in the private custody environment

Use a new private directory outside the repository. The packer generates a
random nonce, a 32-byte one-time AES-256-GCM key, an authenticated binary packet,
and a hash-only receipt. It streams file bytes, caps total artifact bytes at
2 GB and file count at 64, and preserves each producer artifact byte-for-byte.
It relocates descriptor paths without changing payload, sealed plan, envelope,
runtime-receipt, approval, or key contents. Input files must be owned regular
single-link 0600 files. Output directories are 0700 and files are 0600.

An empty probe request is `{"kind":"probe"}`. It exercises the same ciphertext,
draft release, SSH, fixed Git bundle, pg dependency, runtime image, socket target
hash, and TCP server identity checks without a sealed plan or business records.
It cannot create an executable prepared packet.

An import request has this shape (store it as 0600):

```json
{
  "kind": "import",
  "materials": {
    "config": {
      "formatVersion": 1,
      "entrypointKind": "yuzhou_hr_controlled_production_import_entrypoint",
      "deploymentMode": "smart_park_integrated",
      "executionIntent": "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE",
      "requestedDomains": ["T0", "T1", "T2", "T3"],
      "artifacts": {
        "sealedPlan": {"path":"/private/sealed-plan.json","sha256":"<64 hex>"},
        "payloadBundles": {
          "T0":{"path":"/private/t0.json","sha256":"<64 hex>"},
          "T1":{"path":"/private/t1.json","sha256":"<64 hex>"},
          "T2":{"path":"/private/t2.json","sha256":"<64 hex>"},
          "T3":{"path":"/private/t3.json","sha256":"<64 hex>"}
        }
      }
    },
    "runtimeEvidence":{"path":"/private/runtime.json","sha256":"<64 hex>"},
    "cryptoEnvelope":{"path":"/private/envelopes.json","sha256":"<64 hex>"},
    "cryptoKeyFiles":[{"keyReferenceSha256":"<64 hex>","keyFile":{"path":"/private/key.bin","sha256":"<64 hex>"}}]
  }
}
```

`config` is the existing CLI configuration object without `execution`; include
only the domains and optional artifacts already covered by the actual sealed
plan. Database binding and PostgreSQL credential descriptors are never packed:
the host generates them privately from actual runtime credentials and a
read-only connection. The original runtime receipt must already be the exact
receipt bound into the sealed plan; the transport does not regenerate it.

```sh
node scripts/hr-cutover/yuzhou-private-import-packet.mjs pack \
  /private/request.json /private/new-packet-directory
```

Upload **only** `packet.bin` as the sole asset of a temporary draft release in
`ivanzhao299/jinhu-smart-park`, with tag `yuzhou-private-<nonce>` and asset name
`packet.bin`. Never publish the draft. The custody operator puts the content of
`transport-key.txt` into `YUZHOU_IMPORT_TRANSPORT_KEY` using stdin, never a command
argument. The repository is public: draft visibility is additional protection;
GCM encryption is mandatory regardless of visibility.

## Prepare, then execute

Dispatch existing `deploy-production.yml` on the reviewed transport branch with:

- `deploy_mode=prepare-yuzhou-private-import`
- `transport_release_id=<numeric draft release ID>`
- `transport_nonce=<32 lowercase hex from packet receipt>`
- `transport_packet_sha256=<ciphertext SHA-256 from packet receipt>`

The runner downloads only the fixed repository's verified draft asset. It sends
the authenticated packet plus a fixed-commit Git bundle and the locked pg
pure-JavaScript dependency closure over the existing SSH channel. No remote
package installation occurs. The host uses exactly
`/tmp/jinhu-yuzhou-import-<nonce>`, refuses an occupied preparation root, and
never extracts packet-supplied archive paths. Plaintext is authenticated before
any individual artifact is published. A flat allowlist rejects path traversal.

Prepare requires a clean exact executor SHA and matching immutable production
API/web image revisions. It independently verifies the activated socket target
identity/scope using the existing scoped target-inventory helper with the sole
approved scope hash from the fixed v2 execution contract. Other active scopes
do not block this selection. Inventory must report PASS and both exact approved
hashes; its record details stay on the host and are never returned to the runner.
It then observes the actual TCP database/user/server tuple and
compares its database OID with the production Postgres container. It creates
0600 binding/credential files, then invokes the **real original CLI without
`--execute`**. Only `STRUCTURE_READY` produces `TRANSPORT_PREPARED`; its config
hash and ciphertext hash are retained in the private root. A successful empty
probe instead returns `TRANSPORT_PROBE_PASS` and cannot be executed.

After prepare, dispatch a separate `execute-yuzhou-private-import` using the
same nonce and packet hash. It needs no release or transport key. It rechecks
source, running image revisions, target, actual connection identity, and the
prepared configuration hash, then exclusively claims the nonce and invokes
the real original CLI with `--execute`. Original sealed-plan, C/S/M, runtime
receipt, authorization/window, crypto, target and write guards remain active.
An attempted execution is never automatically retried, even when it fails.
The custody operator must inspect the original control receipts before any
separately authorized recovery. This transport does not add a recovery writer.

## Cleanup and evidence

The runner deletes the verified draft release after prepare, including failed
attempts, and removes ciphertext from runner/host and the host transport key.
The repository's contents token cannot delete Actions secrets. The custody
operator must run `gh secret delete YUZHOU_IMPORT_TRANSPORT_KEY` after prepare
success **or failure**, remove the local one-time key/ciphertext under the
custody retention policy, and record cleanup in the private checkpoint. Do not
add a more privileged token just to automate secret deletion. A killed runner
can interrupt cleanup; explicitly check the release, secret, and remote files
before resuming. Cleanup failure emits a stable `*_CLEANUP_REQUIRED` code.

No plaintext Actions artifact is uploaded. Host full failure logs and producer
materials remain in the owned 0700 packet root for custody-controlled recovery;
they are not printed. Runner failure logs remain 0600 under `RUNNER_TEMP` and
are not uploaded. Public results contain only fixed codes, hashes and counts.

Successful core execution is **not complete historical migration**. The v2 CLI
supports T0–T3, the existing optional performance domains, and sealed
`T5_NONFILE`. T5 nonfile covers employee profile/family/skills/credentials/custom
fields and logic; its model excludes photo/docs. The T4 payroll snapshot loader
and T5 photo/file owner-evidence loaders remain lab-only/HOLD paths. They are not
exposed or widened by this transport. Original successful execution still sets
`fullProductMigrationComplete=false`.

## Local acceptance and checkpoint

Objective: convey existing authorized private material to the existing exact
production CLI via the existing SSH channel, with separate prepare/execute.
Implementation base: `ed954495a4dbf16eef945184cd93528d6f85c097`.
Final execution pin: `6e85a6683ac516b6bc49d2bdc4784b9c14589f3e`. The packet
module constant and workflow executor checkout must remain identical. No
production action is authorized by this document.

Checks: authenticated round trip/probe, ciphertext tamper despite a recomputed
outer checksum, nonce/hash mismatch, traversal, source/runtime drift, 0600 and
symlink rejection, real CLI prepare failure, original deployment governance
contracts, Node syntax and ESLint. Real SSH/probe/import acceptance is owned by
the parent task and has not been run by the implementation worker.

Changed files: the existing workflow; packet/host/dispatch helpers; focused
transport contracts; this operations document. No writer, target model,
authorization policy, production evidence, or application source is changed.
Next action: parent reviews the diff and publishes the exact C, then performs the empty
probe and genuine prepared import using its actual sealed material. Maintain a
private checkpoint with packet hash/nonce, exact executor and runtime C, workflow
run ID, prepare/execute state, secret/release cleanup state, and any original
CLI reason code. Do not place private paths or business rows in public reports.

After a successful committed core import, the host opens a fresh read-only
connection and reconciles the operation C/S/M, seal and scope, all four phase
counts and payload digests, and control-record disposition totals against the
sealed plan. Only aggregate counts and `reconciliationStatus` leave the host.
A post-commit audit failure returns `REQUIRED` while retaining the successful
import receipt; it must be resolved with a read-only audit, never by replaying
the import. Private reconciliation receipts remain inside the owned host root.
# 已授权范围的全局 ID 清点

传输分支的 `diagnose-yuzhou-hr-production-id-census` 使用 `production-import-assigned-scope-id-census.mjs`。生产可以有多个启用人事的范围；它按照执行契约中唯一已授权的范围散列选择目标，明确保留全局范围数量，并要求被选范围恰好存在且有效。所有目标表的 UUID 清点仍覆盖全表，包括其他范围和已软删除记录，不改变业务数据。

结果保存为 `yuzhou-hr-production-assigned-scope-id-census`，使用独立证据种类，分别记录观察器提交和固定生产执行器提交 `00cbab6b93e3cfbcca1c0eb36f0537c3f871860c`。`materialize-production-import-assigned-census-baseline.mjs` 直接核验真实 GitHub 运行、该传输分支、观察器提交、制品 ZIP 散列和完整全局 ID 集，再生成既有受控执行器使用的 touched baseline。该方法不把其他范围数量改成一，也不把观察器提交当作应用运行版本。

观察器只读改动在传输分支使用；不得作为业务应用部署合入主分支。最终签署的数据导入计划仍须包含当前执行器的完整演练通过回执、真实 API/Web 运行版本和新鲜目标基线。旧版单范围清点失败回执必须保留。

针对性检查：`node --test scripts/e2e/yuzhou-assigned-scope-id-census-contract.mjs scripts/e2e/yuzhou-assigned-census-baseline-contract.mjs`。
