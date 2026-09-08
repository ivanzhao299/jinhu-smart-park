# Yuzhou production target activation

The execution contract now allows only `jinhu-smart-park-production`, identity
`06ac3572434dbef9bde1c46e448906c4e86fbee28b36d8a4020ac15fa24a6f13`, scope
`dd115030dbdf977460bf3224598f0c15c1e92aec2aca18eb5bbeb656efecb9ab`.
The parent operator verified read-only snapshot run 34221941787 and inventory
run 34222100876 against release 47481178. No production import was performed by
this activation change.

Contract `PASS`/`READY` means target capability is enabled, not permission to run.
The existing sealed-plan validation, exact current/merged/runtime code binding,
source/mapping identity, final rehearsal pair, production window,
one-time authorization consumption, crypto checks and rollback gates remain intact.
Deployment and seed workflows still do not invoke the import writer.
Fresh verified backup evidence remains an upstream preparation/approval prerequisite;
the entrypoint does not itself load a prebackup artifact, and this toggle does not
verify backup freshness.

This commit changes the execution code identity. Prepare and authorize the final
production package only after the resulting release identity is verified; do not
relabel the corrected e1ce8b38 laboratory packet as that release. Retained source
stages and unchanged business payload values can be reused with fresh preparation
bindings, without SQL source extraction. Runtime receipts remain external artifacts
to avoid a self-referential Git SHA. Payroll, photos and attachments remain HOLD.
