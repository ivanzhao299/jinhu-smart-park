# Real bundle laboratory tools integration

Seven retained laboratory tools and six synthetic contract files were brought into
the production candidate byte-for-byte from the existing 402d worktree. This makes
the previously local-only execution dependencies available to a committed candidate;
it does not run a laboratory or production import or rebind earlier evidence.

The CLI retains explicit validate/preflight/isolated-execute modes, pinned private
artifacts and execution dependencies, exclusive ownership, registered HTTP fixtures,
formal writer/rollback reuse, and aggregate residual evidence. Production remains
HOLD in these tools. The actual AppModule runtime requires the existing API pg,
NestJS, bcrypt and ts-node dependencies and a verified loopback lab container;
no dependency or workflow changes are included here.

Validation: six focused synthetic suites passed 83/83, all thirteen files passed
syntax checks and SHA-256 equality with retained source, and all relative static
imports resolved. Scoped ESLint passed with readonly Node/Web runtime globals
declared in the lint invocation (no rules disabled, no source-byte changes).
There was no database, Docker, private-input or live HTTP execution. No TypeScript
sources changed, so package typecheck was not required. CI script registration is
not changed in this bounded integration.
