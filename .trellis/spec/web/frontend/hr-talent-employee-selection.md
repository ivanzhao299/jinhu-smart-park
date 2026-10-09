# Talent employee selection

## Scope and signatures

TalentEmployeePicker wraps the existing HrEmployeeSelection purpose=talent and hrApi.talentEmployeeOptions(page,keyword,token,signal). Five original FormData paths: profile employeeId, meeting employeeIds, successor employeeId, development-plan employeeId and action ownerEmployeeId. Exact original write permissions remain; no generic employee READ requirement.

## Selection contract

Page20 with literal search and complete count. Retained single snapshots and independent removable meeting selections serialize original IDs via hidden inputs. Cross-page/search/read failure must not discard selections. Deduplicate meeting IDs, refuse501 with feedback, disable empty meeting. Every successful target operation clears its completed selection; failures keep dates/reasons/selectedIDs. Saving one plan action must not clear another plan's owner draft. Entire workspace keyed by full auth-user context clears old forms/projections and aborts candidate reads on identity, park or authority changes. Candidate shape/page/count/cardinality must pass the shared selection validation before render; older generations ignored.

## Lazy access and rendering

Only permission-gated open forms mount candidate controls. Action owner picker only mounts after its plan disclosure opens; each plan owns separate selection. Read-only pages make no employee/compatible-options queries; compatible options remain only for succession management positions. Shared DS forms/buttons/records, local layout CSS only, 44px controls, desktop and390px no overflow.

## Verification

Tests cover five exact payload paths under operation-only authorities, cross-page/search/outage retention, removal/duplicates/500limit, malformed response, stale response, scope reset and independent owner forms. Keep contract/lifecycle/probation/reward picker regressions passing. Browser uses actual full client with synthetic API, separately labelled as local, never production import or real business UAT proof.
