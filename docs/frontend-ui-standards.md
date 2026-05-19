# Frontend UI Standards

## Drawer Standard

All new drawer pages must use the shared drawer primitives from `@jinhu/ui`.

Use these building blocks instead of page-local ad hoc structures:

- `Drawer`
- `DrawerHeader`
- `DrawerActions`
- `DrawerTabs`
- `DrawerTabButton`
- `DrawerForm`
- `DrawerSection`
- `DrawerFormGrid`
- `DrawerFooter`
- `DrawerDetailGrid`
- `DrawerDetailItem`

Required behavior:

- Every drawer must pass `onClose` to `Drawer`, so overlay click and `Esc` close the drawer.
- Close actions belong in `DrawerHeader`; do not add large standalone close buttons inside content.
- Detail drawers use `DrawerHeader`, optional `DrawerActions`, optional `DrawerTabs`, then `DrawerDetailGrid`.
- Form drawers use `DrawerHeader`, `DrawerForm`, `DrawerSection`, `DrawerFormGrid`, and `DrawerFooter`.
- Avoid full-screen drawers unless the workflow truly needs a wide workspace.
- Prefer `size="md"` for ordinary forms and detail views.
- Use `size="lg"` for tabbed details or complex forms.
- Use `size="xl"` only for dense workflows with tables or multiple panels.

Style rules:

- Do not use inline styles.
- Do not hardcode colors in page components.
- Do not use Tailwind.
- Do not use old drawer layouts based on `task-item`, `form-stack`, or page-local detail item cards.
- Keep labels, values, tabs, buttons, and footer actions aligned through shared classes.
- Number inputs must use `onFocus={(event) => event.currentTarget.select()}`.

Migration priority:

1. Convert visible customer-facing drawers first.
2. Convert high-frequency management drawers next.
3. Leave only low-risk technical admin drawers for the final cleanup pass.
