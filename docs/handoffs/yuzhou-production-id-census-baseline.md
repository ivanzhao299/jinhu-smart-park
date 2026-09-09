# Global ID hash census → touched baseline

This bounded route supports **insert/quarantine only**. Direct
`collect-production-import-baseline.mjs` remains the merge/skip collector.
No route authorizes import, creates A/B evidence or changes production gates.

1. Dispatch the deployed, reviewed `Deploy Production` workflow on `main` with
   `deploy_mode=diagnose-yuzhou-hr-production-id-census` and the existing verified
   hash-only `source_manifest_json`. No rows, IDs, commands or credentials belong
   in dispatch inputs. The fixed script reads all UUID IDs in the 16 target tables,
   across scopes and including soft deletion. It rejects RLS/views/inheritance and
   holds ACCESS SHARE schema locks; it does not change roles or disable RLS.
2. After the run succeeds, obtain its run ID/attempt and the exact artifact ID
   named `yuzhou-hr-production-id-census`. Keep the hash collection controlled;
   hashes are pseudonymous, not a claim of anonymization. Artifact retention is one
   day, while the database snapshot is valid for at most one hour.
3. Create a private config and empty private output directory using the existing
   private preparation discipline. Config keys are exactly:
   `formatVersion:1`, `triple:{codeSha,sourceSnapshotHash,mappingContractHash}`,
   `targetIdentitySha256`, `targetScope:{tenantId,parkId,scopeSha256}`,
   `provenance:{runId,runAttempt,artifactId,codeSha}` (IDs as decimal strings),
   `phases:{T0:{path,sha256},T1:{path,sha256},T2:{path,sha256},T3:{path,sha256}}`,
   `outputDir`. Phase paths reference original prepared records artifacts, whose
   hashes refer to file bytes, not canonical JSON.
4. Run `node scripts/hr-cutover/materialize-production-import-census-baseline.mjs
   --config <private-config>` with an already authenticated `gh` and `unzip`.
   The CLI directly checks GitHub API repository/workflow/main/head/run/attempt,
   successful completion, exact artifact membership/time and ZIP digest, then
   downloads the one expected file. A self-written provenance JSON is not accepted
   in place of that API/download. No new credentials are created or printed.
5. Supply the output `touched-baseline.json` raw SHA descriptor to the existing
   plan materializer. `baseline-collection-receipt.json` is emitted last and pins
   config, phase bytes and remote evidence. Do not use partial output without this
   receipt. The materializer itself still requires the full separate runtime,
   A/B and authorization inputs; this route supplies only the baseline.

Completeness uses sorted, unique per-table ID hashes, exact counts and recomputed
newline-delimited digests; the collection is capped at two million IDs and
192 MiB. ID hashing is UTF-8 `yuzhou-global-id-v1`, unit separator, `public.table`,
unit separator, lowercase PostgreSQL UUID text. Set hashing uses
`yuzhou-global-id-set-v1`, the same table domain and sorted hashes joined with LF,
without a trailing LF. PostgreSQL built-in SHA-256 and local SHA-256 must agree.

Identity is recomputed on the actual SQL connection with the existing
database/user/transport/OID/scope algorithm. No fallback transport or credentials
are used. DB-clock future timestamps fail; local conversion cannot extend TTL.
Absence is a consistent-snapshot fact only: subsequent changes remain subject to
the writer's transaction-time global absence/CAS checks. Synthetic contracts do
not establish a live production census, valid A/B or an import authorization.

## 本轮验证记录

- 新增 census 合同 31/31 通过；覆盖真实默认仓库路径检查和 baseline → 既有 draft 生成器接线。
- 既有部署路由、目标 inventory、preimport snapshot 合同通过；定向 ESLint、模块语法和 diff 检查通过。
- 在已有隔离 PostgreSQL 16 上执行最终生成 SQL（含 ACCESS SHARE）成功，返回 JSON；以该结果自身观察时间检查内部格式和摘要通过。没有业务写入或新建数据库。
- 单独使用合成 UUID 验证 PostgreSQL 与 JavaScript 的 ID / 集合哈希一致。
- 本机 Docker 时钟比 Mac 快约 99 秒，真实当前时间校验拒绝该隔离结果；未修改时钟、放宽 TTL，亦未称其为有效生产回执。
- 尚待验证：合并后实际 GitHub 诊断产物下载与本地生产 baseline 生成。真实生产导入、完整 A/B 和业务验收均未因本切片完成。
