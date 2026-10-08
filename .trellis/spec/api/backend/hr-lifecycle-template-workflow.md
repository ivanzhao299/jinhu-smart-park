# Lifecycle template version workflow

## 1. Scope / Trigger

Lifecycle template management, checklist assignment candidates and immutable version publication. No auth, role, migration, import, employee-status or payroll expansion.

## 2. Signatures

- Existing GET /hr/lifecycle/templates remains READ or TEMPLATE_MANAGE.
- GET /hr/lifecycle/template-options requires exact ASSIGN and returns only id/code/name/type/versionId/versionNo/itemCount of current published enabled templates.
- GET /hr/lifecycle/templates/:id requires exact TEMPLATE_MANAGE and returns that summary with ordered minimal items: code/name/category/defaultDueDays/required.
- Existing POST /templates and POST /templates/:id/versions publish immutable versions. DTOs accept1..50 unique task codes with nonblank code/name/category and offset integers-365..365.

## 3. Contracts

New reads validate exact service authority and actor tenant/park before queries. Current version is the highest published version of a nondeleted enabled current-scope template. Detail resolves version and items in one scoped SQL snapshot; candidates never expose items. Preserve old list permission metadata. Shared private summary query avoids candidate/list drift and orders type/name/id.

Publishing continues to lock the template row, allocate MAX(version_no)+1 and insert new version/items atomically. Existing checklist version/snapshot and copied task rows are never updated. Relative item due dates continue to derive from submitted checklist dueDate, not employee start or event date.

## 4. Validation / Errors

Unrelated or foreign actor scope -> Forbidden before querying. Missing/disabled/unpublished/foreign template ID -> NotFound. Empty/51items, trimmed duplicate codes, blank item fields and invalid due offsets -> DTO rejection. No new role grant or old list expansion.

## 5. Good / Base / Bad

Good: assign-only operator chooses a published summary without template-management access. Manager loadsV1, publishesV2, and existing V1 checklist keeps identical snapshot/tasks.
Base: old READ list endpoint remains available.
Bad: broaden template list to ASSIGN, expose editing detail to assign-only actors, update old version rows or reinstantiate old checklists after a template change.

## 6. Tests Required

Metadata/service permission lattice, scope before-query, minimal projections, ordered current published detail and DTO boundaries. Owned actual PostgreSQL query/write fixture must demonstrate new-version publication, scoped candidate/detail exclusions and unchanged prior checklist snapshot/tasks. HR_LIFECYCLE_TEMPLATE_PG_REQUIRED=1 permits only loopback15483 and randomized disposable database cleanup; this fixture is not full migration/trigger acceptance.

Exercise the real Nest ValidationPipe for null/string/empty nested items, wrong boolean fields and unknown properties; invalid nested data must yield BadRequest rather than a server exception.

## 7. Wrong / Correct

Wrong: overwrite V1 task names or require READ to populate an already-authorized ASSIGN action.
Correct: action-specific summary plus exact manage detail; insertV2 and retainV1 snapshot.
