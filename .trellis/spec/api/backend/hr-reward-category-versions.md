# Reward category version maintenance

## 1. Scope / Trigger
The modern rewards page must edit the current complete category definition and view immutable history, reusing the existing version publication transaction. Existing submitted/approved case references stay unchanged. No source import, DDL, role or payroll mutation.

## 2. Signatures
GET /hr/rewards/categories/:id/versions?page=1&page_size=20 -> {category:{id,code,status,currentVersionNo},items:[{id,versionNo,kind,name,impactLevel,description,createdAt}],total,page,page_size}.
POST existing categories/:id/versions accepts optional expectedVersionNo integer1..2147483647; modern callers always submit it. Existing callers omitting it remain compatible, without a stale-draft guarantee. Publication response retains existing id/versionNo/kind/name/impactLevel projection.

## 3. Contracts
Exact HR_REWARD_MANAGE and actor tenant/park match are checked before history reads and version transaction, including wildcard/super. UUID route identity; strict decimal scalar pagination derives PickType metadata from existing operation DTO and rejects extra query fields. History header/items/count share REPEATABLE READ; version_no DESC,id order and bounded page. Disabled categories retain readable history; deleted/foreign categories are unavailable. Required metadata audit contains no definition values, authors or employee rows.
Publication locks the enabled non-deleted category, compares supplied expectedVersionNo, then appends one immutable version and updates its pointer. Trimmed name must remain nonempty. Existing idempotency interceptor and captureBody:false audit remain. No case/version-history rows are rewritten.
The permission-gated modern editor lazily reads the selected category's history, initializes the complete current definition including description, retains its frozen expected revision across history pages, and uses the parent page's synchronous write lock. Identity/target close aborts reads. Unknown-result retries keep key and exact payload, including409 until explicit reload; definitive400/403/404/422 allow correction. Confirmed success closes the editor before parent refresh; refresh failure warns separately. A newer current header disables stale publication while preserving the draft; explicit discard/reload initializes the new definition. Read-only roles do not mount operation history.

## 4. Validation & Error Matrix
Missing exact permission/foreign actor ->403 before SQL. Missing/deleted/foreign category ->404. Disabled publication ->404. Stale supplied expected revision ->409 before INSERT. Invalid name/revision/page/unknown query ->400. Audit failure prevents history response. Malformed/duplicate client history ->local retry without enabling publication. Failed history preserves draft and disables publish until retry. Late closed-target results never restore an editor.

## 5. Good/Base/Bad Cases
Good: two modern editors from revision23 produce exactly one revision24; the loser keeps its draft and explicitly reloads. Base: an approved case keeps version1 while the category reaches25. Bad: overwrite old version rows, silently publish an old edit atop a newer definition, drop an unread description or retry an unknown result with a different key/payload.

## 6. Tests Required
Actual controller/service/ValidationPipe tests cover exact authority/scope, strict query/revision values, empty names, bounded snapshot reads, required audit, locked stale conflict and old omitted-revision compatibility. Owned loopback15488 query fixture (HR_REWARD_VERSIONS_PG_REQUIRED=1) verifies23+ history versions, competing expected-revision publication, old reference unchanged, header/list/count under concurrent publication, out-of-range totals and disabled/deleted/foreign cases. Random DB drop and container removal required. This fixture does not replace full-schema migration or business acceptance.
Actual editor and containing-page tests verify description/payload, paging retention, unknown retries, stale header/reload, failed read, target abort, malformed history, read-only no-read, shared parent write lock and success/refresh split. Desktop/390px use real component with synthetic API; never claim these as production role acceptance. Complete CI and sequential deployment/cleanup/runtime proof remain separate gates.

## 7. Wrong vs Correct
Wrong: initialize edit fields from category list that omits description; generate a new key on each retry; use history failure to clear the draft. Correct: load the complete current definition, freeze expectedVersionNo, retain the same key/payload for unknown results and preserve old case references.
