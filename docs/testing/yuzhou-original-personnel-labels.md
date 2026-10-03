# Original personnel archive labels

The existing sensitive legacy archive projection renders `person.oldaddr` as
原玉舟籍贯 and `person.edulevel` as 原玉舟学位. The labels are supported by the
retained SQL procedure metadata, not inferred from modern field names:

- `u_personinfo2003`: `person.oldaddr AS 籍贯`; SHA-256
  `adf140a230a553b28eca6558dcd324e7ac84fa58f821be23dab75af59437017a`.
- `web_personinfo_SelectCommand`: `person.oldaddr AS 籍贯`,
  `person.edulevel AS 学位`; SHA-256
  `4785a80d7bdc5496c7d64d06567f3a51e3c4fd6aef1f7add7b43d3fc65410868`.

This display is limited to `yuzhou-v10`, `employee_profile`,
`dbo.person.core_residue` and the existing sensitive archive read permission.
Only already-returned source properties are read. No API, import, permissions or
modern profile backfill changes are involved. Other source projections retain
their existing generic display. The existing original confirmation date remains
separate. Source metadata and synthetic fixtures do not establish production
value completeness or business acceptance.

Run the focused interaction tests:

```sh
pnpm --filter @jinhu/web exec vitest run test/interaction/hr-legacy-employment-date.test.tsx test/interaction/hr-legacy-personnel-facts.test.tsx
pnpm --filter @jinhu/web test:unit:hr
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web build
```

Check source and permission boundaries, scalar text escaping, null/empty versus
absent or malformed values, no duplicated raw keys, failed detail switching and
authenticated-context clearing. Inspect the actual presenter with shared design
system CSS at desktop and 390px, including long values. Production-role and
production-value acceptance remain separate checks after deployment.
