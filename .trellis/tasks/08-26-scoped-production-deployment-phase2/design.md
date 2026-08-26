# Design

Add a `classify` job ahead of verification. It derives the complete push/PR range without production secrets and uses the repository scope resolver. Its outputs select package-scoped validation. The deploy job still recomputes against the authoritative production release marker; if the production result is broader than the preverified mode, deployment fails closed rather than releasing unverified components.

For transfer, `fast-css` keeps the existing exact file copy. `web`, `api`, and `database` use explicit allowlisted rsync sources required to build or migrate that component; `full` retains the full source sync. A transfer manifest contract prevents missing shared runtime files or accidentally widening narrow transfers.
