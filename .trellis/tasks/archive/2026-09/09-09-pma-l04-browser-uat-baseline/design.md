# Design

Extend the existing dependency-free CDP runner instead of introducing Playwright. Keep BrowserContext as the isolation boundary. Add `--viewport-matrix` and `--case-file`; make the post-user logout/isolation audit mandatory.

Case files contain only selectors/text expectations and resolved fixture routes. Credentials remain environment or ignored CSV inputs. The runner captures screenshots, hashes them, writes a relative-path evidence manifest, then writes its redacted report.

The implementation does not create fixtures or claim the historical HCD cases passed. A final dedicated run must produce real evidence or retain an explicit BLOCKED verdict with its environmental reason.
