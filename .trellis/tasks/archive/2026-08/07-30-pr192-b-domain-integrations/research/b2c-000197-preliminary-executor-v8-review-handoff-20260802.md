# B2c 000197 preliminary executor v8 review handoff

Status: frozen candidate awaiting two new independent v8 GO reviews and one new
old-writer drain v8 GO. No earlier GO or RETURNED artifact authorizes v8, and this
handoff does not authorize live execution.

## Frozen v8 chain

- Logical formal run ID: `b2c197_prelim_20260802c`
- Fixture run ID: `4fce75ade89881fb1079f88f3a1e46ab`
- SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- R0: `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
- R1: `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b`
- Approval runtime v8: `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Failure cases v8: `9e2b22832934db122bd02cbad138ffbf7488c6ee78814ed2e9cc8a53ff6e5663`
- Executor v8: `7c5c98193556a5ff52ff4d6c532c6e0efea1f4da04d20629d2ab225204699f2a`
- Orchestrator v8: `954ffd7f8d3b045ede7ae27e2a38a997e5c3effe84eccc410b831d4a4472f48b`
- Closure resolver v8: `18a5aa6831a77f1ec0381e1edacc270c2ba25abf3e47d6a6b28bf2a0f02cf0b7`
- Executor spec: `cea91498edb09b61bd37e0ddb73a2202e1e826152ce73e71a3d50408855f013b`
- Orchestrator spec: `b7b05ea6f864d2a98a39d74e02187bb8a7a4c47dd453c8a63a3e142da2cec5ec`
- Capability spec: `57700e696d95dcc9215a637b1d36c8a706f547b29a3b96468e472a1c16ed5fd6`
- Recursive closure spec: `d027352a292508adc73a8aab08fed907185b124919ba05f6ab6cd1e6a8241a00`
- Frozen closure spec: `7b45eb45c5011ae35ad6cb677d1b55737595944547c4ebd9d5459d631169e77e`
- Input manifest, 159193 bytes: `7f5077aace6794f964c3e676abc5980f296ddacbe4777e0b89ebf343bcbe05eb`

Any byte, size, symlink, source-reason, prefix, resource identity or manifest-row
drift returns this candidate to review.

## P1 corrections

`formalStaticV8` now spawns capability closure as a real Node child through the
same evidence recorder as every other static phase. The child uses explicit TAP,
requires the exact three ordered names, and records immutable intent, result,
stdout, stderr, exit status and parsed TAP. Recursive closure is a second real
child with the same exact treatment. The post-seal static gate has seven children:
executor, orchestrator frozen mode, capability, recursive closure, frozen closure,
000197 contract and approval lifecycle.

The deterministic resolver begins from every formal child entry and approval PG
entry, then recursively parses repository JavaScript, MJS, CJS and TypeScript
import, type import, re-export, require and dynamic import edges. Relative and
`@jinhu/*` repository misses fail closed with exact importer/specifier diagnostics.
Node builtins and external packages are separately classified; neither is silently
discarded. No `node_modules` file is admitted to the repository manifest.

Because the formal approval compile retains workspace typecheck, the resolver
loads package scripts, workspace/lock/config files and the API tsconfig chain. A
TypeScript Program file set is compared byte-for-byte with a real
`tsc --listFilesOnly` run through `dirname(process.execPath)/corepack pnpm` on each
runtime. Both produce the same 957 repository compiler files, including the PG
spec's entities, ports, error, authorization, JWT principal and `@jinhu/shared`
declaration graph.

The authoritative manifest has 997 exact file rows with size, SHA and source
reason: 23 authority inputs, two read-only-preflight files, seven typecheck
governance files, 945 remaining compiler files and 20 formal-recursive files.
Overlap is assigned one deterministic reason. Omission, excess, duplicate,
symlink, size, SHA, reason and `node_modules` checks all fail closed.

The manifest and this handoff are governance outputs and intentionally do not
appear as their own manifest file rows, avoiding an impossible self-hash cycle.
The manifest binds all executable and authority inputs; new reviews bind both the
manifest SHA and this handoff SHA. Post-seal static-gate evidence is an immutable
review output, not an input to the candidate it verifies.

## Validation and read-only preflight

Node 22.23.2 and Node 24.18.1 each passed 33/33 direct tests: executor 8,
orchestrator 4, capability 3, recursive closure 3, frozen closure 3, contract 8
and approval lifecycle 4. Both runtime-specific corepack paths report version
`0.35.0`; both real compiler-list comparisons passed with no missing or excess
repository file. ESLint passed on all v8 owned JavaScript.

The complete v8 C/D read-only preflight passed with exact retained identities,
no host port bindings, primary and mirror `000191`/`000192`/`000197` absent,
running/failed zero, other clients/open transactions/approval-create writers zero,
approval rows zero, exact old index/predicate and no build residue:

- artifact, 3204 bytes: `f7f0576d318712c1115e34af5be2e9558fbc44f77f705a1247e80a934284cf7c`
- manifest, 379 bytes: `5de5ae05a3d2f55533c8bbcf2f3b2fabfb90b363bc961c24ce9017b86f9d8df6`

C and D remain retained and unchanged.

## Required new authority

New reviews must use schema
`b2c-000197-preliminary-v8-independent-review-v1`, bind this exact handoff,
manifest, resource authority, resolver, executor and orchestrator, and identify
the distinct database and QA/security reviewer authorities with `decision=GO`.

The new drain must use schema `b2c-000197-old-writer-drain-v8`, bind the same
logical run ID and resource authority, and prove `decision=GO`, stopped intake,
zero in-flight approval creates and writer build `approval-port-v8`.

All v3-v7 review, drain, GO and RETURNED artifacts are audit-only. They are not
read, imported, statted, spawned or listed as v8 manifest inputs. No v8 review or
drain artifact is created here. Final/current and later `000191`/`000192`
scenarios remain deferred; `final_current=false` and live execution stays blocked.
