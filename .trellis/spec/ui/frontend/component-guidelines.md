# @jinhu/ui Component Specs

`@jinhu/ui` is a shared React component package. Components live in `packages/ui/src/components/<Component>/<Component>.tsx` with optional CSS modules beside them.

Reference files:
- `packages/ui/src/components/Button/Button.tsx`
- `packages/ui/src/components/Button/Button.module.css`
- `packages/ui/src/components/DataTable/DataTable.tsx`
- `packages/ui/src/index.ts`

## Component Shape

- Export named components and prop interfaces.
- Prefer `forwardRef` when the DOM node is useful to consumers, as in `Button`.
- Keep component styling in CSS modules imported as `styles`.
- Re-export public components from `packages/ui/src/index.ts`.

## Styling

CSS modules should use design tokens from `apps/web/app/globals.css` such as `--phoenix-*`, `--color-*`, `--bg-*`, `--border-*`, and `--shadow-*`. Keep package components generic enough for reuse across pages.

Reference files:
- `apps/web/app/globals.css`
- `packages/ui/src/components/Button/Button.module.css`

Avoid hard-coding app-specific routes, permissions, API paths, or business module names in `@jinhu/ui`.
