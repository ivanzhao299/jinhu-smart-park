# B-2c PropertyTask composition runtime re-sign handoff

- schemaVersion: `b2c-property-task-composition-runtime-handoff-v2`
- status: `RE-SIGNED CANDIDATE / INDEPENDENT REVIEW PENDING`
- decision: `OWNER RE-SIGN COMPLETE / NOT INDEPENDENTLY SIGNED`
- productionEnablement: `false`
- date: `2026-08-02`

## 1. Successor identity

- predecessor signed `B-property-task-runtime SHA`:
  `f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645`
- predecessor disposition: immutable signed C4/B-2a historical input; not overwritten
  and not claimed as the B-2c composition output
- successor grammar: `b-property-task-runtime-v1`
- successor regular-file count: `27`
- successor grammar bytes: `3718`
- successor candidate `B-property-task-runtime SHA`:
  `3256cdf11095f79b3a5bdbca12bafd72c55f3a4f679d240ea1e6eb7d71a95fe7`
- AppModule included: `false`
- domain source registrations included: `0`

The successor SHA is a local owner candidate only. Independent review must recompute
the full regular-file tree, grammar bytes and SHA before it can become current
authority.

## 2. Contract and shared identity

- exact composition contract candidate:
  `b2c-property-task-composition-contract-candidate.md`
- contract candidate raw SHA:
  `04b995c57d0b1bf49810b7d7ca0a30de1756295d5bd52def625a28e612e0da36`
- re-frozen approval port contract SHA:
  `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`
- approval contract final signoff raw SHA:
  `a33b45e565d896eea3b27a78702808148ec8339eb031cbbfd441552946a8a3c3`
- approval shared implementation handoff raw SHA:
  `71d097226d2f5e11f6ad0fa31e098baa92803becb1337cfa4a83b68a81ff910d`
- approval shared implementation SHA:
  `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`
- current `track-b-contracts.ts` raw SHA:
  `e70ff68fed5feb4bd81cbcf7397acbbc3edc98fb47f507df96707a07fc058fbe`
- corrected `property-task-contracts.ts` raw SHA:
  `8cd064f1d3b3da62787d0be8e3d70891e72fd81b6aadead96e5ee6a85036755a`
- corrected shared grammar: `b-shared-source-v1`
- shared grammar file count / bytes: `10 / 1294`
- corrected candidate `B-shared-source SHA`:
  `af7ddf1462e31a7961324a75a12723a411c56a5e7bef3a0c98f400483b9e2f0d`

The exact ten shared rows are recorded in the contract candidate. This shared SHA is
a successor candidate and does not replace or masquerade as the signed C1 shared
identity. The earlier local candidate `6704689a...` was computed before approval
shared stabilized and is explicitly superseded; it is not an input to this re-sign.

## 3. Owned implementation

| Path | Raw SHA-256 | Purpose |
|---|---|---|
| `packages/shared/src/property-business/property-task-contracts.ts` | `8cd064f1d3b3da62787d0be8e3d70891e72fd81b6aadead96e5ee6a85036755a` | exact B-2c mode, resolver ABI/descriptor validation, immutable snapshots |
| `packages/shared/test/track-b-property-task-contract.test.cjs` | `a3d08fb615d231f28063babb7d92203615f62785b717b20600655aec9e40523a` | malformed ABI matrix and legacy exact-empty regression |
| `apps/api/src/modules/property-tasks/property-task.registry.ts` | `bfd6e4de35e562dd9e76c1c6f6a5e0fd608d4a76765dee66594667e773e827ed` | single injected registry provider and frozen resolver/projector view |
| `apps/api/src/modules/property-tasks/property-task.module.ts` | `91df8a90a10a9b96f2ec22bbdbd96697d5e23cc5ff96f1b5ac159041b7bc1dc6` | single dynamic composition entry and token aggregation |
| `apps/api/src/modules/property-tasks/property-task.contract.spec.ts` | `bb20569fba7a17fead991a0ecefcf54ab8ad6f9716a8a99d14b593d4a62f8e7a` | default/composed provider behavior and immutable registry proof |
| `apps/api/src/modules/property-tasks/property-task.module.spec.ts` | `d58dc20c38a5867fa32077aea710e517e34fa17b0ea8ed24e0294874a2f0a23f` | one-provider DI metadata, frozen registration snapshot, empty/duplicate token failure |

No AppModule, domain, migration, approval runtime, property-operations or SaaS-module
file is part of this lane.

## 4. Startup failure coverage

The shared malformed matrix rejects:

- owning resolver with absent or non-callable `invokeOwningCommand`;
- derived resolver with callable or explicitly undefined owning hook;
- absent/non-callable `scanCandidates`;
- absent/non-callable `lockAndResolve`;
- unknown assignment authority;
- absent/empty/internal-rebuild descriptor, source mismatch, missing/extra descriptor key;
- empty, malformed, duplicate or unsorted `requiredModules`;
- empty/malformed `surfaceId`, `pagePermission`, `sourceDetailPermission` and
  `queueCode`;
- empty domain route, missing `[taskId]`, query-bearing route and traversal route;
- empty composition, duplicate resolver token, duplicate registry key and any
  test-fixture registration in B-2c mode.

Positive cases cover both derived and owning sources, a sorted multi-module
descriptor, projector enumeration, immutable metadata, and the unchanged legacy
exact-empty factory/provider.

## 5. Validation evidence

All commands used the repository Node.js `20.20.2` runtime directly because `pnpm`
was not on the non-interactive shell PATH.

| Check | Result |
|---|---|
| shared TypeScript build | PASS |
| complete shared tests | PASS, 5/5 files |
| all PropertyTask specs | PASS, 12/12 files |
| API ESLint (`apps/api/src --ext .ts`) | PASS |
| API typecheck | PASS |
| API Nest build | PASS |

The first API build invocation used the repository root instead of the Nest package
directory and failed to locate `tsconfig.json`; rerunning the identical Nest build
from `apps/api` passed. This is a command-location diagnostic, not a product failure.

## 6. Boundary and review state

- owner known failures: `[]`
- owner open P0/P1: `[]`
- independent review of this composition re-sign: `pending`
- current authority locator update: `pending independent signoff`
- B-2c domain adapters/AppModule/production enablement: `blocked`

This handoff must not be labeled signed, current, production-ready, or a domain Gate.
