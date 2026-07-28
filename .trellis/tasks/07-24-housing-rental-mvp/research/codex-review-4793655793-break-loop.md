# Codex Review 4793655793 Break-Loop

## Review findings

The review found five related invariant gaps:

1. Protected-file deletion locked the file row, but housing repair and homestay
   turnover binding did not keep the same lock through the owner write.
2. Homestay ledger input, summaries, refund limits, and persistence converted exact
   `numeric(18,2)` values to JavaScript `number`.
3. Housing meter readings, multiplier, and unit price were converted to JavaScript
   `number`, allowing a minimum reading increment to disappear near the database limit.
4. The commercial-contract exclusion predicate used SQL three-valued logic and
   filtered every commercial row when both optional exclusion parameters were null.
5. Cancellation revoked issued stay credentials before releasing occupancy, while
   the sibling no-show terminal transition did not.

## Root cause category

This was not a missing general test run. The previous unit, build, and real API
regressions passed, but the coverage was centered on normal values and individual
endpoints. The implementation and review process did not inventory both sides of
cross-aggregate references, all sibling terminal transitions, every optional SQL
branch, or values beyond JavaScript safe integer precision.

Several earlier corrections therefore protected one side of an invariant:

- delete locked while bind did not;
- cancellation revoked credentials while no-show did not;
- housing settlement money was exact while homestay ledger and meter arithmetic were not.

## Corrective pattern

- Protected evidence binding and deletion share a file-row `pessimistic_write` lock.
  Validation and owner persistence use the same transaction manager.
- Homestay money remains a decimal string at HTTP and frontend boundaries and uses
  integer cents for calculations, comparisons, summaries, and persistence.
- Meter inputs remain decimal strings and use scaled `bigint` arithmetic for readings,
  multiplier, usage, unit price, and rounded charge.
- Optional SQL exclusions explicitly require non-null parameters before applying the
  exclusion.
- All occupancy-releasing booking transitions revoke issued credentials first under
  the booking lock.

## Prevention gates

- Maintain a domain-wide decimal inventory covering DTO, UI payload, service
  calculation, persistence, response summary, and comparison paths.
- Maintain a terminal-transition matrix listing each dependent resource cleanup for
  cancellation, no-show, checkout, void, and reversal paths.
- Maintain a reference-integrity matrix listing each reference creator and deleter,
  their lock target, lock order, and transaction boundary.
- Add boundary tests above JavaScript safe integer precision, minimum database-scale
  increments, null optional parameters, and both orderings of reference races.
- Split future reviews by domain invariant where practical so one PR does not mix
  finance, occupancy, attachment, and lifecycle changes without dedicated gates.

## Verification evidence

- Targeted policy and schema regression tests cover all five findings.
- Full API unit suite passes.
- API and Web type checks, lint, and production builds pass.
- Real housing API E2E passes against the Docker PostgreSQL database.
- Shared-property and homestay SQL regressions pass and roll back their fixtures.

The repository has no `src/templates/markdown/spec` directory, so there is no generated
spec template counterpart to synchronize.
