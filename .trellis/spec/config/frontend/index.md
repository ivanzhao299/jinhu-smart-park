# @jinhu/config Specs

`@jinhu/config` is a small shared configuration package. It currently exports the base TypeScript config only.

Reference files:
- `packages/config/package.json`
- `packages/config/tsconfig/base.json`

Rules:

- Keep this package configuration-only.
- Do not add runtime application code, React components, NestJS providers, or environment secrets here.
- Export new shared config through `package.json` `exports` so workspace consumers can import it by package subpath.
- Verify config changes by running the relevant consumer command, usually `pnpm typecheck` or a narrower package typecheck.
