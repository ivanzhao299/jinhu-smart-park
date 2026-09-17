# T5 retained projection format compatibility

The private retained-stage reader accepts exactly two version-1 artifact kinds:
`retained-projection` and the retained reprojection producer's
`yuzhou_t5_retained_reprojection`. Both use the same exact fields and validation.
Historical artifacts must not be rewritten merely to rename their kind.

Acceptance still requires descriptor hashes, source restore receipt binding,
full retained source identity and row-hash coverage, definition evidence, and
the current T0 employee dependency mapping. Unknown kinds, changed identities,
raw `source` properties, and unsafe private files remain rejected. This change
does not certify business parity or authorize production writes; output stays
`productionImport=HOLD`.

Targeted regression:

```sh
node --test scripts/e2e/yuzhou-production-import-t5-private-stage-cli-contract.mjs
```

The fixture checks both accepted kinds produce identical payload records,
rejects identity drift for the reprojection kind, and retains unknown-kind,
empty-source, file-mode, and quarantined-parent checks.
