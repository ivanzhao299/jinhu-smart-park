# Design

Extract deployment classification into a repository-owned, unit-testable script. The GitHub workflow consumes its outputs for scoped verification and passes the resolved mode to the existing production deploy script. Classification uses the deployed release SHA when available and the complete push range otherwise; unknown paths fail closed.

Modes:

- `fast-css`: runtime stylesheet transfer only.
- `web`: Web/shared-Web validation, Web image rebuild/restart, Web health and page acceptance.
- `api`: API validation, API image rebuild/restart, API health and protected API acceptance; migration only if migration paths changed.
- `database`: migration/seed plus API compatibility/health without rebuilding Web.
- `full`: both applications, migrations when pending, full acceptance.
- `ops-only`: documentation/Trellis-only; no production mutation.

The existing rollback, secret, parity, release marker, cleanup, and protected-account controls remain mandatory for every mutating mode.
