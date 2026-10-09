# Talent profile complete historical browsing

## Scope and API

GET /hr/talent/profiles-page?page=1&page_size=20&keyword=<literal name/code>&employeeId=<optionalUUID> complements the old compatible500-limited profiles array. Requires exactly talent READ/TEAM_READ/SELF_READ; write-only and unrelated employee READ do not authorize this route. Direct service checks principal tenant/park and these read atoms before transaction. Existing access precedence and employeePredicate preserve park/managed tree/self semantics. Do not apply candidate active/is_deleted filters to existing history: original profiles include departed/deleted employee history.

## Data and consistency

HrTalentProfilePageDto extends same-domain strict pagination DTO: decimal scalar integers page1..2147483647, size1..100(default20), trimmed literal keywordmax100 and optional UUID; real ValidationPipe rejects repeated arrays/booleans/hex/exponents/unknown properties. Direct service rejects invalid page bounds.

Response {items,total,employeeCount,page,page_size}; count(*) and count(distinct employee_id) refer to the entire filtered set. Tenant/park-qualified employee join, organization/self and optional employee/literal search are identical for count/list. Escape backslash/percent/underscore with bound values. REPEATABLE READ + SET TRANSACTION READ ONLY encloses count then page, stable created_at DESC,id DESC order. Keep original id/snapshotNo/asOfDate/current employee name/code/performanceSource/feedbackSource/createdAt projection, stripping original performance id and feedback subjectId. Required existing sensitive read audit succeeds after read transaction before response; no keyword/employee values. Invalidquery400, missingpermission/foreignprincipal403 before DB; outside-object/search miss/out-of-range yields empty rows and accurate totals, audit failure no successful response.

## Cases and validation

Good: older601 profile reachable and version evidence retained; team sees subtree; self sees only own history including departed employee; concurrent insertion does not split count/page snapshots. Bad: first500 used as complete history, native candidate eligibility erases history, page-local distinct count shown as whole directory.

Unit real metadata assertions use ANY_PERMISSIONS_KEY for RequireAnyPermissions, never compare undefined PERMISSIONS_KEY values. Corrected existing talent candidate metadata test; actual permission implementation unchanged. DTO/HTTP/service/audit tests plus owned loopback15482 opt-in HR_TALENT_PROFILE_PAGE_PG_REQUIRED=1 random disposable PG database603 profiles,31pages, stable ties, literal search, scopes, source parity with oldroute, no sourceID/privatecontact leak, concurrent insert and cleanup. NoDDL/import/write rule changes. Query fixture is not migration/business UAT proof.
