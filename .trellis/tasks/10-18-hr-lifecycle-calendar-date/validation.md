# Calendar-date validation

- Reproduced the native pg DATE parser under Asia/Shanghai: 2026-11-02 becomes 2026-11-01T16:00:00.000Z when serialized as a JavaScript Date. The existing lifecycle page renders this field directly.
- Actual PostgreSQL query fixture: list, detail and task dueDate remain YYYY-MM-DD or null under UTC, Asia/Shanghai and America/Los_Angeles process/session zones. Nine required read audits observed.
- Targeted lifecycle tests:12 pass,0 fail,0 skip; includes actual template publication/frozen-checklist regression, DTOs, permissions and controller contracts. Owned loopback15483 randomized test databases/container removed. This narrow fixture does not replace the separate full native lifecycle continuation test.
- API typecheck and build passed. Targeted ESLint and git diff --check passed.
- No schema, stored data, permission, workflow, completion timestamp or frontend code changes. No production write or deployment yet. Full native continuation, CI and production runtime verification remain pending.
