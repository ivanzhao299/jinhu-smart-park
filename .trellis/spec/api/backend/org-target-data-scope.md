# Organization exact-target data scope

## Scope and signatures

`GET /orgs/:id`, `PATCH /orgs/:id` and `DELETE /orgs/:id` must use the same live organization data scope as the list/tree. The controller supplies `JwtPrincipal` to `OrgsService.detail/softDelete`; update already receives the principal and passes it through the shared target lookup.

## Contract

- Route permission is checked before service lookup. Resolve `DataScopeService.buildScopeFilter(actor, "org")` before loading an exact target. A restricted actor whose allowed IDs exclude the requested UUID receives the normal `Org not found` result, without a target/child/assignment lookup or write.
- For an allowed target, keep the requested ID and tenant/park/deletion predicates intact. Do not overwrite an exact ID with a broad `In(allowed_ids)` predicate, which could return another organization.
- Compare UUID spelling canonically when checking membership, preserving PostgreSQL's equivalent uppercase UUID request spelling. An allowed target must remain readable/editable; a scope check that rejects every target is not acceptance.
- Update/delete use their transaction-scoped repositories under the existing organization hierarchy lock. Parent/leader eligibility, hierarchy integrity, active-child/user-assignment constraints and protected legacy-field rules continue to apply.
- Existing unrestricted/super behavior comes from the same DataScopeService; do not introduce a second role or permission interpretation.
- Imported formal organizations follow these ordinary rules. They remain editable when the current actor has the operation permission and target visibility.

## Evidence

Unit cases reject hidden detail/update/delete before target lookup and persistence; allowed IDs stay exact and editable. The existing hierarchy/contact/protected-field tests remain required.

Owned actual HTTP reproduction returned200 for a hidden organization before the fix. After the fix, the compiled same-workspace independent API with real password login rejects those exact endpoints with404, while normal organization/position edits, position CAS/idempotent replay, required audit, read-only permissions, named organization scope and live revocation pass. This is not full field-policy, all-domain transfer or production business acceptance.
