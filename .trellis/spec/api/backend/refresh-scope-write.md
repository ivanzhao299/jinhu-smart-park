# Refresh Session Scope Write-Through

## 1. Scope / Trigger

Opt-in park identity transition session creation. Additive persistence, not independent
enterprise login or replacement of existing principal authorization.

## 2. Signatures

- `AuthModule.withParkScopeTransition(): DynamicModule` explicitly supplies the writer.
- `AUTH_REFRESH_SCOPE_WRITER` binds `AuthRefreshScopeWriter`.
- `persist(manager: EntityManager, token: AuthRefreshTokenEntity): Promise<void>`.
- All new sessions continue through `AuthService.createScopedRefreshToken`.

## 3. Contracts

- Default AuthModule supplies no writer and retains repository save. Do not add optional columns
  to shared entity metadata, change AppModule, or infer activation from table presence.
- Caller creates one transaction; writer locks canonical live tenant/park/scope/user rows,
  saves using that manager and binds the exact new tenant/park/user tuple before commit.
- Reject missing, ambiguous, inactive, deleted or foreign bindings without legacy fallback.
  Include disabled nondeleted duplicate parks in ambiguity detection; read at most two candidates.
- Home park is not session park. Existing authorization remains authoritative for secondary parks.
  Do not create membership, module or RBAC grants.
- Reject preset token IDs, non-string hashes, and flags other than undefined or strict false.
- Normalize DML RETURNING with `typeormQueryRows` and require one exact matching ID.
- Existing old-token revocation remains separate; do not claim atomic old/new rotation.

## 4. Validation / Error Matrix

- Invalid manager/input: stable denial before queries or persistence.
- Missing/duplicate/disabled/deleted/cross-tenant/stale binding: stable denial.
- Query/save/update/RETURNING failure: stable denial and rollback by caller.
- Transaction begin/callback/commit failure: outer opt-in catch yields the same stable
  `UnauthorizedException("Refresh token scope unavailable")`, never raw diagnostics or fallback.

## 5. Good / Base / Bad Cases

- Good: already-authorized second-park session receives second-park scope.
- Base: default module works without new columns or writer queries.
- Bad: replace session scope with home park, commit before binding, leak SQL diagnostics,
  or report this partial persistence slice as complete scope authorization.

## 6. Required Tests

- Default/dynamic registration, exact transaction manager, no fallback and safe transaction errors.
- Input runtime types, locks and predicates, exact DML cardinality.
- Actual migrations and AuthService.refresh: two parks, disabled/duplicate rejection,
  late update failure leaves no new token, default behavior, no grants, concurrent scope lock.
- Disclose synthetic identity/signing/audit substitutions; they are not runtime acceptance.

## 7. Wrong vs Correct

Wrong: save and commit a new token, then update scope in another transaction.

Correct: resolve, save and scope-bind within the caller's transaction. Normalize outer
transaction failures too. No replacement token is returned on failure.
