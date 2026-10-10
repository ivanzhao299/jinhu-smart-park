# Formal compensation ledger CSV

## 1. Scope / Trigger
Export current applied employee/plan search under existing READ permission for HR reconciliation. File contains salary settings, not payroll paid.

## 2. Signatures
hrApi.compensationAssignmentExport(token?,keyword="",employeeId?,signal?) -> {items,total,snapshotAt}. compensationLedgerExportCsv(unknown) -> {csv,total}; shared csvDocument/downloadCsv own encoding/download.

## 3. Contracts
Require completed current ledger, no loading/error/unsent changed search; disable while export busy. Capture one token and synchronous controller mutex. Render-time context ref includes executed query/page/refreshVersion and raw search; account/park/permissions remount entire ledger. Abort/null request ownership on context cleanup/unmount, discard abort-ignoring old responses, old finally cannot clear newer mutex. A cancelled request permits a fresh export. Strict cardinality, safe total0..5000, unique nonempty IDs, existing full row guard, canonical real UTC millisecond timestamp (parse and ISO round-trip, not regex alone). Whitelist employee/plan code/name, effective dates, three exact monetary strings, shared status labels with unknown fallback, version. No internal IDs/extra fields. Shared formula-safe quoted UTF8 BOM CSV; spreadsheet automatic number coercion is outside CSV guarantees.

## 4. Validation / Error Matrix
Malformed rows/cardinality/time/duplicates/overflow -> no download and local error. Read failure -> no file, retain list and permit retry. Identity/query/refresh/search/permission/unmount change -> silently discard old response. New filter must be applied before download; new complete backend snapshot may legitimately differ from previously viewed list.

## 5. Good / Base / Bad Cases
Good:21 rows downloaded despite20-row UI page. Base: empty result generates header-only complete CSV. Bad: captured key compared to itself, effect-only fence, generation change leaving hidden mutex true, or old finally unlocking a new download.

## 6. Tests Required
Actual ledger interactions: exact applied filter/token/signal, synchronous doubleclick, local failed read/retry, search/query/refresh/externalrevision/account/permission/unmount cancellation, abort-ignoring late response and restarting while old finishes. CSV beyond onepage, exact large decimal/cents, allowed fields only/formula+quotes+newline safety/Chinese status, empty, invalid/duplicate/incomplete/oversize/invalid calendar timestamp. Final Web lint/typecheck/build and HR contracts. Actual compiled component/CSS desktop1280 and phone390 no overflow/44px; synthetic fixture is not production HR business acceptance.

## 7. Wrong vs Correct
Wrong: const guard=key; promise.then(()=>guard===key), which compares same-render captures. Correct: check current render-time context ref and exact controller identity, then download. Wrong: cancelled old finally always clears busy. Correct: only current controller may clear its state; cleanup releases cancelled ownership.
