# Performance source-readiness output contract

Reviewed current migrations300/301/302/306/307/308/309/310/371/372 and service visibilitySql/resultSubjectIdentityJoin at workspace a1bfe8cebf2e822b4a68acf32a0a446527a9111a, 2026-10-16. These are source contracts, not live production observations. Fixed tenant10000001/park20000001.

## Fixed output

CLI adds exactly `kind=hr_performance_source_readiness_counts`, `formalContinuationReadiness=UNVERIFIED`, `productionBusinessWrites=0`. SQL object has exactly `sources`, `master`, `dimensionSubjectActiveEmployeeCount`, `ledgers`, `formal`, `scopedSourceFactsSha256`. All counts are nonnegative JavaScript safe integers. Missing/unknown/duplicate keys (also escaped-equivalent keys), invalid number types, malformed digest and contradictory counts fail closed. No personal names/codes, scores, amounts or individual rows are output.

## Six source families

| sources key | Fact table | Exact map source_table |
| --- | --- | --- |
| templateProfile | hr_performance_legacy_template_profile | dbo.assessmentcode |
| levelRule | hr_performance_legacy_level_rule | dbo.assgradecode |
| dimensionProfile | hr_performance_legacy_dimension_profile | dbo.assitem |
| dimensionLevelGuide | hr_performance_legacy_dimension_level_guide | dbo.assitemgradedes |
| dimensionResult | hr_performance_legacy_dimension_result | dbo.assessmentdetail |
| masterResult | hr_performance_legacy_master_result | dbo.assessmentmaster |

Each family has exactly `rawCount`, `visibleCount`, `exactMapCount`, `mapGapCount`.

- Raw: all fixed-scope fact rows regardless of map/batch state.
- Visible: exact existing visibilitySql semantics: map id/batch/source system/target table/id/verified/active and production-import succeeded batch. This does not check source table/hash or formal ledgers.
- Exact map: map id/batch/source system/source table/target table/id/verified/active plus valid fact identity/row SHA and equality to map SHA. Independent of batch visibility; a lab-batch exact map can be included. It does not claim canonical source PK or approved manifest qualification.
- Visible and exact-map counts each <= rawCount. mapGapCount = rawCount - exactMapCount. Neither visibility nor exact-map implies the other.

## Master counts and subsets

All master counters use **raw scoped master rows** as denominator; correlated EXISTS avoids multiplicative joins. Every master counter <= sources.masterResult.rawCount.

| Keys | Exact meaning / constraint |
| --- | --- |
| resolutionPresentCount, resolutionMissingCount | Resolution relation joined by master id/tenant/park/batch; partition rawCount |
| personResolvedCount, personUnresolvedCount | Resolved/non-resolved among present resolution rows; partition resolutionPresentCount |
| personAmbiguousCount | evidence_ambiguous or template_ambiguous; subset personUnresolvedCount |
| personUnmatchedCount | evidence_unmatched or template_unmatched; disjoint from ambiguity; their sum <= personUnresolvedCount (assessment_missing/not_applicable remain unresolved) |
| detailResolvedCount, detailUnresolvedCount | Partition resolutionPresentCount |
| detailAmbiguousCount, detailUnmatchedCount | Exact ambiguous/unmatched enums; partition detailUnresolvedCount |
| bothResolvedCount | Same resolution row has person and detail resolved; <= min(personResolvedCount,detailResolvedCount) and >= max(0,personResolvedCount+detailResolvedCount-resolutionPresentCount) |
| bothResolvedMatchedCount, bothResolvedMismatchCount | Exact persisted 000307 comparison enums matched/mismatch; partition bothResolvedCount |
| exactVisibleMatchedCount | Both-resolved matched master also has visible and exact map; <= all three component counters |
| subjectActiveEmployeeCount | Subject resolution + exact source-person SHA + unique **succeeded-owner T0** candidate + verified active canonical owner map + scoped non-deleted employee; details below |
| formalReviewLinkCount | Target cycle employee and its review cycle resolve in exact tenant/park; presence only, no lifecycle or employee-identity equivalence claim |
| formalTemplateVersionLinkCount | Target template version resolves in exact tenant/park; presence only, no snapshot/value equivalence claim |

`dimensionSubjectActiveEmployeeCount` follows the same subject intersection for dimension_result, bounded by sources.dimensionResult.rawCount.

## Subject intersection versus resolution state

`subjectActiveEmployeeCount` and `dimensionSubjectActiveEmployeeCount` count a conservative present-time join intersection; they are **not counts of all persisted resolved identity records**. Zero does not mean no resolved record, no usable source or failed business data. Current helper's running/apply branch is deliberately excluded because migration308 invokes a writer-capability verifier there. Observer inlines only the succeeded-operation candidate branch and calls no hr_* helper.

Exact provenance: current service resultSubjectIdentityJoin plus migrations306/308. Join resolution by fact kind, subject role, id/tenant/park/batch, status resolved and source-person SHA. SHA = SHA256(UTF8('dbo.person') || byte(0) || UTF8(btrim(source_person_code))), NULL for blank. Candidate joins projection receipt/record/phase/operation/batch/live scoped employee, approved disposition, rollback_status=not_started, v2 exact target scope, succeeded phase/operation and production-import T0 succeeded batch. Candidate row count must be exactly one; duplicate identical candidate rows stay ambiguous, matching current helper count semantics. Owner map further requires verified/active, dbo.person, canonical sha256:<identity>, exact target employee. This does not establish session/cycle identity or full source qualification.

## Independent ledgers

Exactly `relations308Count`, `relations308SucceededCount`, `facts310Count`, `facts310SucceededCount`, `assessment309Count`, `assessment309SucceededCount`; each succeeded <= its own scoped total.

- 308 total is receipt tenant/park scoped. Succeeded requires own succeeded/no rollback; same import batch+operation, production-import T0 succeeded batch/current DB; succeeded parent operation/phase; exact scope, code/source/mapping/target identity/scope hashes, T0 after-canonical hash.
- 310 total is receipt tenant/park scoped. Succeeded requires successful308 same operation/batch and matching code/source/mapping/target/scope/T0 hashes plus parent receipt SHA; own succeeded/no rollback/extension rollback nonce.
- 309 total uses target_tenant_id/target_park_id. Succeeded requires successful308 exact parent_import_operation_id/batch and matching code/source/mapping/target/scope/T0 hashes; own succeeded/no rolled_back_at and valid applied_state_sha256 shape.

These are status/binding observations, not sourceQualified. No complete approved artifact comparison, migration_batch_item set reconciliation, canonical math/evidence recomputation, loader dependency verification or live migration-catalog checksum assertion is performed.

## Formal presence

`formal` keys: `legacyTemplateVersionLinkCount` (raw scoped template profile target version matches exact id/template/tenant/park; <= templateProfile.rawCount), `fiveChannelVersionCount`, `fiveChannelPublishedVersionCount` (published subset <= total five_channel_v1 scoped versions), `fiveChannelDefinitionRevisionCount`, `fiveChannelInputRevisionCount` (scoped revision row counts). Presence does not establish current/complete/usable input or accepted formal continuation.

## Raw digest

Lowercase64hex SHA256 of UTF8 PostgreSQL json_agg(json_build_array(kind,id,batch,map,identity,rowHash) ORDER BY all six tuple columns) text; textual ordering uses C collation. PostgreSQL JSON uses comma-space separators; UUIDs are JSON strings; duplicate tuples are retained. Empty set is exact [] with digest4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945. Only scoped raw facts affect this hash: foreign facts, receipt/resolution state and map-record changes do not. Fact tuple changes do. This is not migration310's canonical fact set, resolution state or full mathematical manifest digest.

## Execution, errors and validation boundary

One REPEATABLE READ READ ONLY transaction, statement_timeout5s, lock_timeout2s, search_path public/pg_catalog, aggregate SELECT then ROLLBACK. Fixed SQL and one absolute deploy path; existing compose/psql transport; Node built-ins only for exact SSH stdin execution.

Fixed errors: HR_PERFORMANCE_SOURCE_READINESS_PATH_INVALID, HR_PERFORMANCE_SOURCE_READINESS_PROBE_FAILED, HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID. Workflow masks unknown SSH/startup errors as HR_PERFORMANCE_SOURCE_READINESS_REMOTE_FAILED. No raw error text or fallback zeros.

Workflow flag diagnose_performance_source_readiness defaults false and is runtime-revision-only; existing ops-only/skipDeploy classification stays unchanged; successful validated artifact only.

Required owned tmpfs PG executes the **complete generated query** against minimal typed populated query-projection fixtures, not full migrated schema/business guards. It verifies counts, scope, receipt and resolution negatives, fanout, hash, current subject intersection, formal presence, unchanged source rows and read-only write rejection. Finally inspects exact generated name+owner even after partial creation, rm-fv and container/volume absence. Production observation is root-only after independent review; parent formal continuation stays open.
