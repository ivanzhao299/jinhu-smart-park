# Independent whole-package check — 2026-10-20

Reviewer: existing `monthly_payroll_full_check` trellis-check; direct review and self-fix, no recursive agent. Workspace `/Users/mac/.codex/worktrees/hr-payroll-monthly-ingress-20261020/jinhu-smart-park`; baseline `2fd4505f8ad8f89ac1ea42764c34ff01f9edaf55`.

## Findings (fixed)

1. Shared/offline/API schema parity: reject unknown nested keys, malformed formulas/summary/value unions, catalog-value inconsistency, duplicate identities/aliases/formulas, invalid dates and numeric precision. Recompute declared book/roster/catalog hashes using stable canonical codepoint order. Offline conversion no longer drops invalid input before validation.
2. Prepared completeness: reject non-candidate rows and multiplicity other than one; remove caller-provided preparedRows bypass. Authenticate complete retained files. Preserve original item metadata and orphan formula null-target/manual-review semantics; formula targets resolve exact itemCode only.
3. API contract: validate package/hash/scope before persistence, verify exact live mappings before new preview, align status/head/import permissions. Preserve original T4 bidirectional comparison, immutable versions, current-head CAS and current-source qualification. Preview does not lock operations after the month lock, preserving the checked lock order.
4. Initial and revised complete-month proof: migration381 supplies append-only extraction facts. A controlled CLI reads the complete retained prepared files, checks independently supplied expectedManifestSha256 and reviewed expectedExtractorSha256, binds exact database/OID/scope and full canonical books content. Public preview/commit, including committed replay, require this registration. No ordinary actor registration endpoint or policy approval was added.
5. Registration operations: private configuration and output, loopback default or explicitly selected single-label docker_service host; exact database/OID retained, connection-string override rejected, no host discovery/fallback/opened port. Real retained sources are not replayed from backup.
6. Added meaningful adversarial/offline/API/PG fixtures, including removal of a book/value/formula or amount alteration with recomputed client hashes, unregistered initial month, immutable registry, strict original-T4 alias/orphan behavior and extractor/manifest/target drift.

Primary reviewer edits: shared hr-yuzhou-payroll-source; offline builder and registrar; migration381; source service/controller/projector; source contract and extraction fixture; source/baseline PG specs; original package and strict-validation contract scripts. Root-owned Web/journey/task documents were read-only in this review; only this report is written under the task.

## Root Web, journey and document audit

The Web gross summary correctly uses record.lines with role=gross. NULL/reference-only rows remain traceable and are not all described as needing historical correction. The journey PASS criterion requires all93 records to have exactly one equal gross line, netEqual93 and differentLineCount0. Existing private outputs are chmod0600 before replacement; validationRevision changes the all-book trial idempotency key while keeping ordinary request replay behavior. Source values and business assumptions remain separate.

Two documentation follow-ups were sent to root, which owns these files: replace the current extraction-pending/checkpoint/runtime summaries after final evidence binding; document the first-run two-stage journey (normal employee mapping/package generation, controlled extraction registration, then resume the same journey config). The fresh journey does not self-register and must not be presented as having no registration prerequisite. Older dated checkpoints remain historical evidence, not current status.

## Verification performed by reviewer

Results below were executed in this same workspace during the review and reused only while their relevant source remained unchanged. The source inventory below records the final reviewed bytes; root will bind full raw receipts before release.

| Command / check | Result |
| --- | --- |
| `pnpm --filter @jinhu/shared build` | PASS; authoritative offline imports require this build first |
| API and Web TypeScript checks; API rechecked after registry/fixture edits | PASS |
| `node --test scripts/e2e/yuzhou-payroll-source-validation.contract.mjs` | PASS41/41 after final CLI transport/hash guards |
| Original `yuzhou-payroll-source-package.contract.mjs` | PASS; combined original+strict run42/42 before final transport-only additions |
| In apps/api: `TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-yuzhou-payroll-source.contract.spec.ts` | Final PASS4/4 |
| Existing scoped HTTP parser tests | PASS6/6; no later parser changes |
| Readiness/coverage contracts | PASS11/11; no later diagnostic changes |
| Focused eslint of shared/API/parser/offline/diagnostic tests; final registrar/builder/API/fixtures/PG specs lint | PASS |
| `node --check scripts/e2e/hr-payroll-july-source-journey.mjs` | Final PASS |
| `git diff --check` | Final PASS |

Final focused lint command:

```sh
pnpm exec eslint scripts/hr-cutover/register-yuzhou-payroll-source-extraction.mjs scripts/hr-cutover/build-yuzhou-payroll-source-package.mjs scripts/e2e/yuzhou-payroll-source-validation.contract.mjs apps/api/src/modules/hr/hr-yuzhou-payroll-source.service.ts apps/api/src/modules/hr/hr-yuzhou-payroll-source-extraction.fixture.ts apps/api/src/modules/hr/hr-yuzhou-payroll-source.contract.spec.ts apps/api/src/modules/hr/hr-yuzhou-payroll-source.pg.spec.ts apps/api/src/modules/hr/hr-yuzhou-payroll-baseline.pg.spec.ts
```

## Root-owned integration evidence and remaining binding

Root reports normal migration runner381 application with exact checksum; real93 controlled extraction registration PASS; final381-source-baseline-pg.log2/2 PASS. Fresh-key real93 preview/commit replay reuses the unchanged source; five tampered package variants with recomputed client hashes are rejected by the verified-proof gate. Root also reports normal desktop1440/mobile390 UI trial with gross93/net93 and no overflow. These are root-owned executions, not reviewer-operated DB/browser tests. The final normal-JWT all-book trial under the new validationRevision was still running at this report's creation; root must attach its final source-bound receipt and update the checkpoint before release.

No remaining product-code defect identified in the reviewed scope. Documentation/evidence binding above is outstanding with root. This is isolated technical acceptance only: NULL-zero/gross-reduction/U487/tax-insurance choices remain unapproved diagnostic assumptions. Wu business confirmation, production-role UAT, production trial/payment and complete legacy HR/cutover acceptance are not established by these tests. Reviewer performed no DB/runtime/production operations, commit, merge or deployment.

## Frozen identities and operational order

1. Build shared, verify reviewed extractor identity.
2. Apply381 via the normal checksum/history migration runner.
3. Use an absolute0600 config with allowExtractionRegistration=true, targetScope, database connection plus expectedDatabaseOid, preparedRoot, manifestPath, mappingPath, month, sourceInstance, preverified expectedManifestSha256, expectedExtractorSha256 and private receiptPath. Optional databaseTransport defaults to loopback; docker_service explicitly names one private service host. Do not print configuration or credentials.
4. Run `node scripts/hr-cutover/register-yuzhou-payroll-source-extraction.mjs --config /absolute/private/config.json`; the CLI registers extraction facts only.
5. Normal API preview/commit and existing freeze/input/all-book trial validation. Existing v1 package bytes remain compatible; existing reads are unchanged. Public writes/replays require corresponding extraction facts.

381 SHA256: `d07cd804b524bbd7a13fcda090eae78ed8b6c097a278510b89adf607e4196c78`.

Extractor identity rechecked at final audit: `5b6d26312b2019d6aae6f2ab2d69f8b6f54a53af025b3a5e6918330a5e582de3`.

## Final reviewed product source inventory

This inventory includes changed/untracked product source, scripts, tests and migrations in the active workspace; it excludes task prose and private artifacts. SHA256 of compact JSON mapping (sorted path keys) is `418f6749d14dcae09b8674b1cf3474a14fd32f92013eaa74c729767c9f00a2e5`.

```json
{
  "apps/api/src/modules/hr/dto/yuzhou-payroll-source.dto.ts": "312ba66d19c983c46d7d30c5ed332664e1dbe68f62e3ed27bc5d039a3b31ac57",
  "apps/api/src/modules/hr/hr-payroll-frozen-source.ts": "e1f0be5b661a5156b998703442a9ea3363f3d2ace7ad2b435f04d72d13a18c8b",
  "apps/api/src/modules/hr/hr-payroll-history.service.ts": "a15386a3c14e6f7fb5f7ad00f431a4d41c9f6248b1812bce00c3df2712b00536",
  "apps/api/src/modules/hr/hr-payroll-trial.service.ts": "94c1804f42635578368cb94fa55487d0dffa8d26d87c47d61c5d150473d5a729",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-baseline.pg.spec.ts": "e8ab54fa92bd27a748e058c0112f08990c8f3706e03b1fe871fafcf4c3d2eaed",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source-baseline.ts": "9eb683dc5be73600aedcb3b0842ab9f9e6d819449a4a1ae025bc1b316c348943",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source-extraction.fixture.ts": "0fe89182a7da326267a5fdfe1fdba2768ef149e26ffac343b275ca16ac2ad334",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source-projector.ts": "03e4de3c6b01fce0d477a259e5968ab0f9d90341ec3ab2ccdf1d5e3674cfddcd",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source.contract.spec.ts": "c2cb0f221dce4422d24fdd297a4a2532f1116651a138cd3aca26bfc749298a76",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source.controller.ts": "6bb077ef7aa70961233b3c1d3386a519ed730d8501a8e7d4173552d73e9a1bab",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source.pg.spec.ts": "86acf265941a292aff21346ba504011b6b01122d6a006d4b8a50c4d5edd26046",
  "apps/api/src/modules/hr/hr-yuzhou-payroll-source.service.ts": "fc84a50329207b9fa2bbd80d97d58396c661f2e3d1743c1f5e9742340f137582",
  "apps/api/src/modules/hr/hr.module.ts": "63985e94df263a2f26c595ac67ce21b040505237453bb85dd205e82f8ae4a4b9",
  "apps/api/src/shared/http/yuzhou-incremental-preview-json-parser.spec.ts": "56dc342aa9d75d922af4c3e9a2e3c3ece26865ca392258f3ee68a7db0cd65aa5",
  "apps/api/src/shared/http/yuzhou-incremental-preview-json-parser.ts": "26c6ba270d24d523f142d1a51ae3463d3af2d1bb25387111197534d5e11bf45a",
  "apps/web/app/hr/payroll/PayrollTrialComparison.tsx": "490618b192f6a74da97396f5738e9655c7f2f55a980074548d3b76e2f8ecc97a",
  "database/migrations/000377_hr_yuzhou_payroll_source_ingress.sql": "6a47a10fdf4ec21095a3b5fc30907f8b3807f6e59543bbaa1ba5cc16017c459d",
  "database/migrations/000378_hr_yuzhou_payroll_source_projection.sql": "c9aff07b60d1ee15032b6b7e0de63e2ef7f093e22ee480d071c070e607f06d15",
  "database/migrations/000379_hr_yuzhou_payroll_source_t4_anchor.sql": "23f06630d5f962534140d543d37e643e373c97d0df91a6cb984a1df09855fe69",
  "database/migrations/000380_hr_payroll_current_source_catalog.sql": "24d8898446ec42e15cdd2e7cb024654782b7971f0565069d9cdbe073c26bf278",
  "database/migrations/000381_hr_payroll_verified_source_extraction.sql": "d07cd804b524bbd7a13fcda090eae78ed8b6c097a278510b89adf607e4196c78",
  "packages/shared/src/hr-yuzhou-payroll-source.ts": "9508d7b0fbe1a81b7c74883db69cd2326327b1e664ff2df15d58ac39e077c606",
  "packages/shared/src/index.ts": "d7edd6fb8b3d93d53640bbb9e2d15c381e254a8e6d6084deb2c8d98fe5b025af",
  "scripts/diagnose-hr-payroll-readiness.mjs": "57bc99c7696ed0eb420ccb7f7250b315ec71e10fce64fe1585eb9264bef40567",
  "scripts/diagnose-hr-payroll-source-coverage.mjs": "fd28ff9e45567ab963c0c581da9bd36e22d8a5d4adb43a5e3ffe5a2d787de867",
  "scripts/e2e/hr-payroll-july-source-journey.mjs": "7ef7b426c15f1fe4307a420214631dc9fc3b130e18451d01238c905a629c108c",
  "scripts/e2e/hr-payroll-readiness.contract.mjs": "1108977f22443561cd40842151bf70757b1e7ff0264756fa4d337b4b2266f93e",
  "scripts/e2e/hr-payroll-source-coverage.contract.mjs": "26d4cfc1a1443ee24abd8ce75d45a0a86da829a528b724f9a06e0f59fc5c04f6",
  "scripts/e2e/yuzhou-payroll-source-package.contract.mjs": "30007edab95c569f75d12a68f7fb2a1da42bcbbbd9ad9e0dda664f15f69c5ae8",
  "scripts/e2e/yuzhou-payroll-source-validation.contract.mjs": "5202b8b3cd57fc8f753e81c528f680256f4f8c4040f9f8eb6c3e621ecaba4f3f",
  "scripts/hr-cutover/build-yuzhou-payroll-source-package.mjs": "8fdb52a25065b0bfa4b36aa22b890edc4c418ec0c590aa26b6c2f44c455813f5",
  "scripts/hr-cutover/register-yuzhou-payroll-source-extraction.mjs": "254428e4b67d2a0713a51f1e9c221383cd112e45eec494e5062408492c55b83c"
}
```
