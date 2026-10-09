# Validation

- Baseline main1ce86e1fdd25d88388e283427d69f0c648a06e4b. Only Web payroll statement, authenticated HistoryPayroll key, domain printCSS and task/spec changed. No import replay/API/DDL/auth configuration/financial mutation.
- Final local16/16 interactions (new10 plus existing export6), existing WebHR230/230, Webtypecheck and affected ESLint PASS. Initial test-only unsupported exact option and irregular JSX whitespace caught and fixed; no failures suppressed. Real PostgreSQL/API suites omitted: no backend/query/data/input changes. Local full build omitted to avoid duplicating final CI.
- Actual full HrPayrollClient with synthetic transport: desktop1275=scroll1275, mobileiframe390/doc385=scroll385, printbutton44px, paperhidden on screen. Exact compiled @media print rules substituted to screen in test-only preview: bodywhite, rootdisplaynone, exactlyone statement and66tbodyrows (summary1+65items), all tail items/null fact retained, long text wraps and nooverflow. Screenshots inspected. This is not a generated PDF/printer-driver or real production role proof; retain actual PDF pagination and HR/self business UAT in acceptance.
- No production business test writes. Browser tabs44/45/46 closed; server55700 terminated. PriorPR912 deployed/cleanup/API-Web1ce verified independently; PR913 CI passed and release watcher21040 active. Candidate must integrate latest main and pass one final CI before release.

## Latest main integration

Integrated PR913 main140f2740e77893ca0e1c77f5180ecb3455105315. Only two documentation overlaps: parent task childlists unioned after all other JSON fields proved equal; specindex retained both entries. No production source conflicts. Combined54 interactions (print/export16 plus talent38), Webtypecheck and affected lint PASS. Earlier230HR retained: payroll amount/unit/contract inputs unchanged. Browser actual payroll source/CSS same as inspected. Final CI required; PR913 deployment37976961716 remains watched independently before next merge.

## Production validation recovery

PR913 full deploy37976961716 stopped before host deployment:1 of703 interactions failed because a test read the summary spy immediately after DOM text appeared, before the passive useEffect callback. Receivednull(expectedloading), expected3. Production source/UI semantics unchanged; fix six spy assertions to await their own callback withwaitFor, no sleeps or disabled assertions. Bundle fix in this candidate before its merge. Rerun only failed verification job for unchanged PR913 after this focused diagnosis; its host deploy must still complete/API-Web140f verified before this PR merges. Old PR914 watcher44085 deliberately terminated130 before changing its pinned head; replace watcher only after new candidate validation/CI.

Recovery validation: all 96 Web interaction files / 713 tests passed; affected test ESLint and Web typecheck passed. Latest origin/main remains 140f2740e77893ca0e1c77f5180ecb3455105315. No production source change in this recovery; actual PDF pagination remains unverified.
