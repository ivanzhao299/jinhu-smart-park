# T3 normalized candidate integration

## Verified starting point

- Legacy policy recovery commit: `2dbb860f`; actual controlled policies authenticated 12/12 original row hashes, with 51 reconstructed fields each, 144 historical child identities mapped to 72 normalized children, and 84/84 representable policy projections. This is transformation proof, not approval or production execution.
- T1 PR639 passed all CI jobs in run `33982155359` and merged to `c48276d7555a373bef231da4642522fa7b9b6546`.
- PR638 release `33982837584` succeeded; its deployment job reported `Production Docker cleanup finished.` Latest proven release here is `e16ccffd7626add769745094dcbc3807642a8e7e`, not the newer merged T1 commit.
- No historical production business import was performed in this slice.

## Executor capacity defect found before producing large artifacts

The existing executor loads `artifacts.sealedPlan` with `MAX_CONTROL_ARTIFACT_BYTES = 67108864`. The current payload generator emits a full per-record plan, not a small summary. Using its existing synthetic 16-table contract fixture, measuring the generated T3 insert-plan records, and multiplying each table's record size plus its array separator by the previously verified normalized projection counts gives:

| T3 target | Projection count | Synthetic insert-plan bytes per record |
| --- | ---: | ---: |
| hr_attendance_import_batch | 1 | 836 |
| hr_attendance_symbol_rule | 5 | 834 |
| hr_attendance_calendar_source | 144 | 1026 |
| hr_attendance_day | 4383 | 1008 |
| hr_insurance_policy | 12 | 822 |
| hr_insurance_policy_item | 72 | 1003 |
| hr_employee_insurance_period | 35008 | 1001 |
| hr_employee_insurance_item | 210048 | 1016 |

Extrapolated T3 plan size: **253354343 bytes**, before outer plan metadata and T0–T2. This is a current-format synthetic extrapolation, not a generated/approved real execution plan; unresolved records will have different dispositions and sizes. It proves the 64 MiB assumption does not cover the intended ordinary insert workload. The actual final plan must still be measured.

No large plan file, source copy, new database, or full rehearsal was created for this measurement. No executor limit was changed here. A following bounded fix must reconcile the plan-specific read limit and end-to-end memory budget with the existing sealed-plan validator/writer, preserving global budgets, byte hashes and authorization. Merely raising every control limit or claiming the 2 GB total-byte cap proves safe peak memory is incorrect.

## Current slice boundary

The normalized phase and T3 candidate assembly consume the same recovered policy representation and retain semantic failures explicitly. Private source-byte authentication/materialization and candidate-to-approved-decision freezing remain separate unfinished integrations. Full product parity and production import are not implied by a pure assembler test.

## Actual source relationship check

One bounded stream of the existing 48,869,999-byte insurance stage verified its current manifest file hash `fc76166540dea2056cd7c012a545de26435ae362abb26af7efd7802dc7c6d033` and all 35,008 staged rows. For the target model's employee/year/month unique key: 35,003 valid unique keys, five invalid keys, zero duplicate groups, maximum one source row per valid key. Only aggregate counts were emitted; no source values or identifiers were reported. This rules out a duplicate business-key mismatch in this source snapshot, but does not prove employee dependency resolution against current T0/target evidence. No SQL extraction, source copy or business write was performed.

Focused regressions completed before independent review: new T3 assembly 13/13; combined T3 candidates/projection/recovery plus T2 candidates 48 passed and one optional PostgreSQL literal-cast check skipped; old T3 phase artifact contract passed; production execution entrypoint 21/21 passed with synthetic callbacks and no real database connection. Full build/release and actual large-plan throughput are separate evidence.

Independent full-slice review found no concrete behavior defect. Its broader T2/T3 contracts passed 84 tests, with two optional PostgreSQL checks skipped because no local test container was selected; old T3 phase contract passed separately. Scoped ESLint passed with Node runtime globals, zero errors/warnings; new test explicitly declares structuredClone. Node syntax and diff checks passed. Workspace TypeScript/full build were not rerun for root MJS-only changes; they are not claimed as verified for this new candidate. No frontend/API surface changed, so browser acceptance was not run.

Integration commit `d5b62584` was followed by a normal merge of main `c48276d7`. Package test commands were combined rather than selecting one branch. Git's automatic merge duplicated the shared T0 validator export; the first post-merge tests caught the syntax error. Removing only that duplicate restored the T2 module exactly to main. Post-fix T1 source revalidation plus T2/T3 candidate contracts:42 passed, one optional PostgreSQL check skipped. No resets, rebases, force pushes or other-worktree edits were used.

## Following capacity repair

The next bounded slice changes only the sealed-plan file allowance to384MiB; config1MiB, other controls64MiB and payload/aggregate2,000,000,000-byte limits remain unchanged. A one-time local65MiB valid synthetic JSON probe passed the real plan validator with0 database/crypto/writer calls, then rejected changed bytes under the old descriptor hash. It took0.40s with maximum RSS262979584 bytes. This resolves the demonstrated64MiB file-rejection path in candidate code; it does not prove the memory cost of250k actual structured records or production deployment. See the capacity task's check.md and the entrypoint documentation for precise boundaries.

## Following private materializer integration

The private T3 file entry now connects authenticated source/stage manifests, all three staged domains, the full target inventory and T0 candidates to the normalized assembler. It writes phase, candidate and policy-lineage artifacts with exact canonical hashes, then a completion receipt. Source reads and artifact writes are chunked at64KiB; the shared serializer preserves legacy canonical bytes and newline without constructing a second full-output JSON string. The pure assembler still retains structured records. Full-size memory and actual real-source output size are not yet measured by this slice.

After independent review, the focused synthetic filesystem/CLI suite passed22 tests. The complete T3 package command passed the legacy phase contract and58 tests, with one optional PostgreSQL check skipped. It covers all three domains, current and12-to6 policies, missing/duplicate dependency conservation, source/target binding drift, read/write bounds, UTF-8, exclusive collisions, readback and completion-marker failures. Review fixed one authenticated-output-stat race and added a regression; precise validation and unavailable full-workspace checks are recorded in the task check file. There was no new source extraction, full A/B, database/volume creation or HR production business write.

Main c48276d7 deployment33983959520 completed successfully with the Docker cleanup completion marker confirmed. This is not deployment evidence for the later T3 materializer. PR640's field-projection CI succeeded, but its merge was refused because the adjacent package test command conflicts with the newer main command. This integration branch contains both PR640's complete head and main c48276d7, with both test commands retained. A replacement integration PR should supersede640 only after it exists; do not restart the old PR's full CI merely to resolve that already-integrated conflict.

Next execution sequence: review/commit this coherent T3 file path, merge and publish the integrated code once, obtain one current-code-bound production target inventory through its existing read-only producer, regenerate the required T0 candidates from unchanged controlled source evidence, then materialize T3 and measure its actual counts/bytes/dispositions. Do not relabel the c530-bound inventory or earlier T0 candidates as current. Approved-decision freezing, unresolved semantic dispositions, full-plan resource validation and actual authorized production execution remain separate unfinished work.
