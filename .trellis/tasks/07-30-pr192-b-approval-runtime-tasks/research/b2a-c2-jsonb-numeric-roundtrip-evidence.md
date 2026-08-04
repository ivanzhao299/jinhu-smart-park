# B-2a C2 JSONB numeric roundtrip evidence

Status: candidate review disposition; this file does not sign C2 or release C3.

Environment: isolated PostgreSQL 16 container owned by the C2 runner. No existing
database was connected or modified. The container and anonymous volume were removed
by the runner.

Exact query:

```sql
SELECT ('{"x":1}'::jsonb->>'x') || '|' ||
       ('{"x":1e0}'::jsonb->>'x') || '|' ||
       ('{"x":1.00}'::jsonb->>'x');
```

Raw result:

```text
1|1|1.00
```

Disposition: the signed C2 function receives `p_rows jsonb`, and the signed plan
requires JSON number type, positive/base-10 integer semantics, range guards, and
cast guards. It does not freeze rejection of the original scientific numeric
lexeme. PostgreSQL JSONB canonicalizes `1e0` to the same observable integer value as
`1` before the function is invoked, so the C2 database function cannot recover or
reject that lost lexeme without changing the signed function signature. Raw numeric
lexeme policy, if desired, belongs to the HTTP DTO/raw parser gate before conversion
to JSONB. C2 continues to reject non-integral values and values outside PostgreSQL
integer range. This disposition must be accepted by independent review; it is not a
self-signed waiver.
