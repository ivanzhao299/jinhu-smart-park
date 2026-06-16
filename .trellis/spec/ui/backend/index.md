# @jinhu/ui Backend Specs

`@jinhu/ui` has no backend runtime. Do not add NestJS modules, database code, API clients, migrations, or server-only logic to this package.

Shared backend contracts belong in `@jinhu/shared`; API implementation belongs in `apps/api`.

Reference files:
- `packages/ui/src/index.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/app.module.ts`
