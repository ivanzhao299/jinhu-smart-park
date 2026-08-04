# B-2a Property Task Runtime superseding combined final signoff

- schemaVersion: `property-remediation-b2a-combined-final-signoff-v2`
- status: `SIGNED`
- decision: `PASS / CLOSED`
- signature: `B2A_PROPERTY_TASK_RUNTIME=SIGNED`
- signedAt: `2026-08-01`
- productionEnablement: `false`
- nextStage: `B-2b extension test data`

## Superseded candidate

`b2a-combined-final-signoff-20260801.md`, SHA-256
`248c866bc3ffbaabaac5864e9d43cdfa8e1de995189a7738a5f1e9ed593c1f6f`,
is preserved as a `RETURNED / NON-AUTHORITATIVE` historical candidate. Its
unqualified C1-C3 reference and missing C1.5 downstream compatibility proof
cannot authorize B-2a closure. This v2 signoff supersedes it without editing or
relabeling its bytes.

## C1 and C1.5 contract lineage

| Evidence | Path | SHA-256 | Disposition |
|---|---|---|---|
| C1 historical final gate | `b2a-c1-final-gate.md` | `1856d7a5903fc5022a6904e6e21c92be16056a84ef2250846b31fc7baa775056` | historical lineage only |
| C1.5 current final gate | `b2a-c1-5-final-gate.md` | `06733bc1a4a4fe44b592b5f6a7beb2d019ea2804691a2f160cd97b7ee5e5ca87` | current authority / PASS |
| C1.5 mandatory compatibility closure | `b2a-c3-legacy-compatibility-final-gate-signoff-20260801c.md` | `e03110ecb8884de77a3be3080a8e8d0ccfef13965ba47b2a1470698e44e4144f` | PASS / SIGNED |

C1.5's named mandatory downstream P2 is closed only by the signed run
`b2ac3_legacy_compat_formal_20260801c`: artifact
`2341ebc46bcce48a34058d65aeaf5d5325a5c07ddce5a4a19682fc4aa73a968f`,
manifest `163874b99bb561495ef20b05450a1938ac7a74abb1e2a2ed3ae10cff1ebd4a98`
and reservation
`c0a7743ac0073ac53d8d4e8abc1124b1a0ad313e4386315df6d5890ddb28bfa5`.
The result is `117/117` exact comparisons for thirteen actions across three
statuses and three immutable receipt fields, before 000195, after migration
before port installation, and after port installation.

## C2 schema and security gate

| Evidence | Path | SHA-256 |
|---|---|---|
| final gate signoff | `b2a-c2-final-gate-signoff-v12d.md` | `624b55a79c228ca414eb5f71d4782c83cce54224e20782a68aa53d540f356484` |
| machine signoff | `b2a-c2-final-gate-signoff-v12d.json` | `0be731ea41ffceddf050e3a4fac971ce4e03ef3c9cc8e6bbfe926cb565949274` |
| candidate artifact | `b2a-c2-candidate-gate-artifact-v12d.json` | `b5169a6e2668d3a2491814f34dd6745e386056f721236160aa5fe331aae41e50` |
| candidate manifest | `b2a-c2-candidate-gate-artifact-v12d.json.manifest.json` | `67bca562e4b80a12b7fb9cde03e14eb622f27154e649b402c9a8f5f8a8065844` |

C2 v12d remains the formal signed schema/security authority. The authorized C2
v11 run is diagnostic evidence only and is not consumed by this signoff.

## 000195 and C3 receipt port

| Evidence | Path | SHA-256 |
|---|---|---|
| 000195 independent final gate | `b2a-c3-0-000195-final-gate-signoff.md` | `5cda30ebc3efecfa67e097dec490b41114771e88d030b7b645b9e1807b0da8b4` |
| 000195 migration | `database/migrations/000195_property_mutation_receipt_contract_v2.sql` | `9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4` |
| C3-0 formal artifact | `b2a-c3-0-formal-candidate-20260801f.json` | `5dfd0e69ae6f5974d6c3f80ebd8160abbab066da4907a3d33aed24824d1281ba` |
| C3-0 manifest | `b2a-c3-0-formal-candidate-20260801f.manifest.txt` | `c1683da295b60deb480fb1ea9ffd0519263eefc2911f0bb7bffd75210c2821aa` |
| C3 receipt-port final gate | `b2a-c3-final-gate-signoff.md` | `efed9823bfa6086319447c69068a744231a3a2b793997cfd887e0b318107b27d` |
| C3 runtime artifact | `b2a-c3-runtime-formal-candidate-20260801d.json` | `76ed0588c25a0e88eb365ccff1a51e1cec2d8db26c16e127b1479feff250363a` |
| C3 runtime manifest | `b2a-c3-runtime-formal-candidate-20260801d.manifest.txt` | `01696a19a7876719d40b3fb23f0aad417431d3e1d97044002f432aeace493a5d` |

The immutable C3-0 golden rows canonical SHA-256 is
`3c2bd8a18ac4236a8db1e4eff583e9daec8c8aa4fac56e21011dee69ee5bd9ff`.

## C4 task runtime, handoff and composition

| Evidence | Path | SHA-256 |
|---|---|---|
| C4 runtime final signoff | `c4-runtime-formal-final-signoff-v13l.md` | `42ceac995d29f87dc4fdbabaca188ef602136d55d937a37699b39eabf15814db` |
| C4 artifact / manifest / reservation | signed in the C4 signoff | `68de0a4fc23543b376dec0434faca476e451ec606e7577e850701596f6fdda0d` / `508da2d5fd79c440f225e16f938d8704a4a9546bd78ff71fbb9b2efd9e86e652` / `9fea4ecb8f16ee4b4aa3a37ccbdb8621f95d653c47e329d5efe4176b4abcf899` |
| runtime/callsite handoff | `b-property-task-runtime-v1-handoff-signoff.md` | `b3b14ba493e4acc142daf1588b6d28bcb5de9ce9ac0dc71d3a084fd9e88740c1` |
| AppModule composition signoff | `appmodule-composition-final-signoff-20260801c.md` | `c9582747dbbef371ad7bc37820da95a0a737b3ca559a5989e4ba08cb2582171c` |
| AppModule artifact / manifest / reservation | signed in the composition signoff | `06556e17eaad9f18abff6f8e88ae691d9516734e1c0c5dc84fd945633a808be2` / `f237fbc229d1459304a4c8385571818bb96d22e541555ef3d9ce1ee14a6b234a` / `2aafcbc1c173dbffd4b2fba909f3ffe505479158c6d7092935cb009b2eb81556` |

The handoff binds runtime SHA
`f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645`
and callsite SHA
`066dc38facdcf660d092ff85ec51557b81463081f52e4edc951a31f71f30cb15`.
C4 formal results are `93/93`, cross-operation matrix `73/73`, and ten
independent proofs. AppModule composition is local `12/12`, PostgreSQL `4/4`,
with exact cleanup.

## Combined decision

- C1.5 current contract gate: `PASS / SIGNED`
- C2 schema/security gate: `PASS / SIGNED`
- 000195 independent database gate: `PASS / SIGNED`
- C3 receipt port: `PASS / SIGNED`
- C1.5 legacy compatibility closure: `PASS / SIGNED`
- C4 task runtime: `PASS / SIGNED`
- runtime/callsite handoff: `PASS / SIGNED`
- AppModule composition: `PASS / SIGNED`
- combined independent review P0/P1/P2: `0 / 0 / 0`
- B-2a technical status: `PASS / CLOSED`
- B-2b release: `allowed`

Failed and diagnostic runs remain immutable with their original dispositions.
This combined signature releases only B-2b repeatable extension test data and
its independent gate. B-2c, B-3, B-4, B-5 and Track C remain serially blocked
by their roadmap gates. Real desktop/390px, keyboard, zoom, external human UAT
and production release remain pending; `productionEnablement=false`.
