# B2a/C2 v12 targeted parent-preflight root cause

## Status

Static correction complete after the second targeted failure. Dynamic Docker rerun remains pending and no candidate artifact may be emitted from the targeted diagnostic run.

## Failure

The targeted run `b2ac2_v12_targeted_20260801a` first stopped while applying `000189_property_b_module_rbac_definitions.sql` with SQLSTATE `23514` and marker `property-permission-parent-preflight-failed`. After copying only that first missing root, `b2ac2_v12_targeted_20260801b` correctly advanced to the next complete-contract check and stopped with `property-bundle-permission-resolution-failed`.

## Root cause

The runner introduced a second qualifying business scope for tenant `10000002` and park `20000002`. It created the tenant, park, and enabled `asset` module assignment, but did not create that tenant's production permission baseline. The first visible missing row was the tenant-local `asset` parent permission; it was not the full defect.

Migration `000189` requires exactly one active `asset` parent permission for every distinct tenant in its validated qualifying scope. It subsequently resolves all signed bundle members independently for each qualifying tenant. Its 16 bundles contain 125 member references resolving to 52 distinct permission codes: 25 are installed by `000189`, while 27 must already exist in the tenant permission baseline. Those pre-existing permissions include file, party, audit, homestay, housing, property-operation, and property-occupancy surfaces.

The first missing prerequisite was:

- tenant: `10000002`
- permission code: `asset`
- required state: `is_enabled=true`, `status='enabled'`, `is_deleted=false`

The complete root cause is therefore a missing tenant permission subtree, including its field semantics and parent graph. This is a runner fixture-chain defect, not a defect in `000189` or `000194` migration logic.

## Correction

The isolated runner now copies every active, enabled, non-deleted production permission row from seeded tenant `10000001` into tenant `10000002`, with the second park scope, before applying the exact Track B chain. It preserves the permission fields used by API, page, data, display, and hierarchy contracts. Fresh fixture UUIDs are mapped within the transaction, and every `parent_id` is rewired to the corresponding cloned parent so no identifier crosses tenant boundaries.

A fixture-local fail-closed assertion requires a non-empty exact row count, rejects every source parent that is missing from the copied graph, and compares the complete source and fixture semantic row sets in both directions. This establishes the complete production-seeded permission subtree rather than copying individual rows in response to successive migration errors.

The production migration preflight is unchanged. The runner neither catches nor reproduces the production error marker and cannot bypass the `000189` check.

## Verification boundary

Static regression verifies that the fixture is installed after the second qualifying scope and before the exact migration-chain loop, preserves parent mapping, and rejects any runner-side copy of either production preflight marker. It also parses the signed `000189` definitions and locks the 125-reference, 52-distinct, 25-new, 27-pre-existing resolution contract. Node syntax and static contract results are recorded in the parent execution report after running them.
