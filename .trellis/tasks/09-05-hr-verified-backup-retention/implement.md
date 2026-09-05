# Implementation sequence

1. Implement bounded private retention helper and explicit flag in Gate-19/workflow.
2. Verify positive copy, tamper/short/long/error/timeout, disk guard, missing mount, symlink,
   permissions, repeat-run isolation and no success receipt on failure using synthetic fixtures.
3. Run independent review and existing release contracts. Document retained versus temporary
   backup evidence, recovery lookup, capacity and off-host/encryption limitations.
4. Publish minimal PR only after checks. Production backup/import stays unexecuted.
