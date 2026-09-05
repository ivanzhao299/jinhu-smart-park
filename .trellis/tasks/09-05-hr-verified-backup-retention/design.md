# Design

Keep Gate-19 as owner of restore validation and temporary cleanup. An optional Node helper checks
the fixed /srv/jinhu-production-data mount and private child directory, then streams the two exact
container artifacts to a new private directory. It never reads an environment file or prints child
stderr. Hash and size validation precede fsync and receipt publication. Partial copies are retained
privately on failure for operator inspection; they never receive a success receipt.

Workflow dispatch adds a boolean default false and transfers the helper alongside Gate-19.
Gate-19 forwards explicit yes/no through its environment-file loading boundary, invokes precheck
before dump, and invokes retention after both restore checks. Reports bind the retained receipt;
existing temporary cleanup never reaches the fixed retention root. No database writer changes.
