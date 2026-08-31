# Yuzhou T5 document owner evidence continuous rehearsal

## Goal

Provide a reusable, fail-closed continuous isolated-lab runner for the
current-source Yuzhou T5 document-owner evidence stage. It must produce the
same checkpoint, two load/rollback cycles, cleanup, and private aggregate
receipt shape used by the verified photo-owner evidence runner.

## Requirements

- Accept only a sealed `core_t0_t2` HOLD configuration whose code SHA matches
  the current committed checkout, and a private `0700` document-owner stage.
- Bind the stage to the same controlled source snapshot and source-restore
  receipt as the core configuration.
- Use the existing document evidence loader and its exact rollback entrypoint;
  do not create binary files, employee-document links, employee writes,
  compensation, payroll, payslip, or message writes.
- Stop the core run at `rollback_ready`, execute load -> rollback -> reload ->
  rollback, then always resume controlled core cleanup. A runner error must
  attempt rollback/cleanup and persist a private HOLD summary.
- Use no credential-bearing environment variables in child processes and
  retain `productionImport=HOLD` in all results.
- Add a focused contract test and a package command. Do not make a production
  import or modify the controlled source backup.

## Acceptance Criteria

- [ ] Argument, stage-boundary, source-binding, two-cycle receipt, cleanup,
      and failure-recovery contracts are covered by a narrow automated test.
- [ ] The runner invokes only the existing document loader/rollback scripts
      under the isolated T5_FILE allowlisted environment.
- [ ] A fresh real-source A/B lab rehearsal records only aggregate evidence:
      1,003 source, 989 loaded, 14 quarantined per cycle, two rollbacks per
      side, and zero residual resources after cleanup.
- [ ] No production database, file binary, or personal-data output is used.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
