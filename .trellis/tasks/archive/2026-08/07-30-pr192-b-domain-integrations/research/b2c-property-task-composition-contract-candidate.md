# B-2c PropertyTask composition contract re-sign candidate

- schemaVersion: `b2c-property-task-composition-contract-v2`
- owner: `shared-contract-owner / property-task-owner`
- status: `RE-SIGN CANDIDATE / INDEPENDENT REVIEW PENDING`
- productionEnablement: `false`
- date: `2026-08-02`

## 1. Authority and scope

This candidate consumes only the current authorities in
`b2c-current-authority-locator-v1.md`, including B-contract-v2
`e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944`, runtime
effect authority `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf`,
the signed C4 task runtime
`f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645`, and
the superseding B-2a combined signoff
`e61f39d936ef4a9b968beec645a09f2459419072d2b7c70067b71d7c2cbcc633`.

For the approval-port ABI consumed through current shared exports, this re-sign is
additionally pinned to the re-frozen approval contract SHA
`5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`,
approved change request SHA
`f91ad906733bab1808c8e48f044edb4e5dab6b44485f3e2f3536d08039ab1f35`,
and the contract-owner plus independent-QA GO recorded by
`b2c-approval-port-contract-final-signoff.md` (raw SHA
`a33b45e565d896eea3b27a78702808148ec8339eb031cbbfd441552946a8a3c3`).
The current approval shared implementation handoff has raw SHA
`71d097226d2f5e11f6ad0fa31e098baa92803becb1337cfa4a83b68a81ff910d`
and records shared approval implementation SHA
`fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`.

The frozen runtime §16.2 keeps the C4 production registry exact-empty and assigns
real homestay/housing/property/approval/identity/turnover/work-order registrations
to B-2c. This correction adds only that downstream composition ABI. It does not
register a domain source, modify AppModule, or enable production.

## 2. ABI and mode contract

- `createPropertyTaskProductionSourceRegistry()` remains the legacy C4 exact-empty
  factory. Passing registrations through mode `production` remains a startup error.
- `createPropertyTaskComposedSourceRegistry(resolvers)` is the only shared B-2c
  production factory. Its `b2c-production` mode requires at least one resolver.
- `PropertyTaskModule.composeSources({imports,resolverTokens})` is the only Nest
  composition entry. It creates one frozen registration snapshot injected into the
  existing single `PropertyTaskSourceRegistryProvider`; it must not provide a second
  registry provider or mutate the registry after startup.
- Empty resolver-token sets and duplicate resolver tokens fail synchronously.
- The registry snapshots and freezes identity/access metadata and binds methods to
  the original resolver instance. Later mutation of registration arrays, resolver
  identity, authority, or descriptors cannot change the registry.
- Test-fixture values remain confined to `test-fixture` mode and cannot enter
  B-2c production composition.

## 3. Exact B-2c resolver startup matrix

Every `b2c-production` entry must satisfy all rows before the registry becomes
available. Any failure aborts module startup; there is no skip, partial registry,
warning-only path, or runtime fallback.

| Field/combination | Exact accepted form |
|---|---|
| `sourceType`, `taskKind` | lowercase `^[a-z][a-z0-9_]{0,63}$`; exact registry key remains `(sourceType,taskKind)` |
| `assignmentAuthority` | exactly `owning` or `derived` |
| `lockAndResolve` | callable |
| `scanCandidates` | callable for every composed source |
| owning hook | `owning` requires callable `invokeOwningCommand` |
| derived hook | `derived` must not declare `invokeOwningCommand`, including an own/prototype property whose value is `undefined` or non-callable |
| descriptor tag | exactly `workspace`; `internal-rebuild` is runtime-owned and cannot be a domain registration |
| descriptor keys | exact `tag,sourceType,requiredModules,surfaceId,pagePermission,queueCode,domainRoute,sourceDetailPermission`; no missing or extra key |
| descriptor source | `access.sourceType === resolver.sourceType` |
| `requiredModules` | non-empty array; each value matches `^[a-z][a-z0-9_]{0,63}$`; values unique and UTF-8 byte ascending |
| `surfaceId`, `pagePermission`, `sourceDetailPermission` | non-empty ASCII contract token matching `^[a-z][a-z0-9_:-]{0,127}$` |
| `queueCode` | lowercase `^[a-z][a-z0-9_]{0,63}$` |
| `domainRoute` | absolute path, ASCII lower-case path segments, exactly one `[taskId]`, no query/hash/backslash/dot-segment/double slash; regex `^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/\[taskId\](?:\/[a-z0-9_-]+)*$` |

Duplicate exact registry keys fail after per-entry validation. The malformed matrix
must include owning-without-hook, derived-with-hook, missing/non-callable projector,
unknown authority, missing/non-callable resolver, non-workspace descriptor, descriptor
key drift, source mismatch, empty/malformed/duplicate/unsorted modules, and an invalid
case for every remaining descriptor field.

## 4. Shared-source grammar and approval-stabilized identity

The shared ABI continues to use the signed `b-shared-source-v1` grammar and exact
ten-file order from the C1 handoff:

```text
b-shared-source-v1\n
file<TAB>packages/shared/src/property-business/access-manifest.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/index.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/permission-bundles.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/permissions.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/property-task-contracts.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/response-contracts.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/routes.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/track-b-contracts.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/track-b-endpoint-permissions.ts<TAB><raw-sha256>\n
file<TAB>packages/shared/src/property-business/track-b-routes.ts<TAB><raw-sha256>\n
```

UTF-8, single TAB, LF-only, no BOM, final LF; raw hashes are lowercase SHA-256.
After approval shared stabilized at `track-b-contracts.ts` raw SHA
`e70ff68fed5feb4bd81cbcf7397acbbc3edc98fb47f507df96707a07fc058fbe`,
the exact 1294-byte grammar has SHA-256
`af7ddf1462e31a7961324a75a12723a411c56a5e7bef3a0c98f400483b9e2f0d`.
Its exact raw-file rows are:

| Path | Raw SHA-256 |
|---|---|
| `packages/shared/src/property-business/access-manifest.ts` | `a7ca65ad970795dc82c237f6f8c2d966d9ae98c14a7697309800a04d60ca252f` |
| `packages/shared/src/property-business/index.ts` | `e6d9449683271e325bf5185665a946033e4e30641a0b57b6f1994f69d4886231` |
| `packages/shared/src/property-business/permission-bundles.ts` | `6c0ca347471d0136f6575db748b7bf34c900c8037cadded72d00e0998f16c158` |
| `packages/shared/src/property-business/permissions.ts` | `32486d858a5bf1d7f7192274fd7a0ab0b1ab32e08aaae070f3ed388e951c43d1` |
| `packages/shared/src/property-business/property-task-contracts.ts` | `8cd064f1d3b3da62787d0be8e3d70891e72fd81b6aadead96e5ee6a85036755a` |
| `packages/shared/src/property-business/response-contracts.ts` | `972657fa55b279d05cedd203c03da4c1c6214a8ebb5c4effa6d1936152edae61` |
| `packages/shared/src/property-business/routes.ts` | `b8961d9d066b8ac894c4948374a5b71d4ec386dfe4995df09f6d16fff97d7712` |
| `packages/shared/src/property-business/track-b-contracts.ts` | `e70ff68fed5feb4bd81cbcf7397acbbc3edc98fb47f507df96707a07fc058fbe` |
| `packages/shared/src/property-business/track-b-endpoint-permissions.ts` | `12e5f5243628ca9b3b443360505a4f83d38712ac60ec52c42982e24340a6d586` |
| `packages/shared/src/property-business/track-b-routes.ts` | `6f13f25e0d87822058259f027b9af967508564a202f37170667048b503617bfb` |

The earlier local shared candidate
`6704689ac2cd7aaff32627cce0730c39ec839d1d60a2eb9e46d00fa4c444abfe`
and its `track-b-contracts.ts` row `ad47c196...` are superseded and non-authoritative.
This re-sign output remains a local candidate identity pending independent byte
recomputation.

## 5. Release boundary

Implementation may modify only the assigned PropertyTask runtime/shared contract and
corresponding tests. A new task-runtime composition SHA must cover the resulting
`apps/api/src/modules/property-tasks/**` regular-file tree using the signed
`b-property-task-runtime-v1` grammar. It is a successor candidate and must not be
called or substituted for the signed historical `f6d6...` runtime SHA.

The successor handoff remains `RE-SIGNED CANDIDATE / INDEPENDENT REVIEW PENDING` even
after local checks pass. B-2c domain adapters, AppModule wiring, migrations, approval
runtime and production enablement remain blocked.
