# Performance legacy HTTP test integration

The retained `hr-performance-legacy-http.spec.ts` adds real Nest route/DTO tests
for server-derived tenant/park scope, integer boundaries, rejection before service
invocation, and decimal-string/null response preservation. Its service and identity
are synthetic: this does not prove login, JWT or global authorization guards.

The retained post-import PostgreSQL opt-in spec adds controller HTTP reads against
the same read-only DataSource, page-three verification and foreign-park isolation,
with app cleanup in finally. It remains explicitly opt-in and was not executed in
this integration; imported database state and audit persistence are not claimed.

Both files were integrated byte-for-byte for useful coverage, not to manufacture
runtime evidence. No application/service/guard behavior changed. Focused synthetic
HTTP test passed 1/1; scoped ESLint passed. API no-emit typecheck covered 1,329 files
with zero diagnostics using the existing external dependency tree through in-memory
compiler resolution options. No node_modules were copied or installed; no database,
private inputs or production services were accessed.
