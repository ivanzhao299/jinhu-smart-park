# @jinhu/api Frontend Specs

`@jinhu/api` has no browser frontend surface. Do not add React, Next.js, DOM, CSS, or client-side state code under `apps/api`.

Use this package only for NestJS API code, TypeORM entities, DTOs, guards, interceptors, filters, and API-local tests. Frontend work belongs in `apps/web` and should load `.trellis/spec/web/frontend/index.md`.

Reference files:
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/web/app/layout.tsx`
