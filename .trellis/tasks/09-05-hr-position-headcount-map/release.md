# Code-only publication

To avoid blocking independent mapping fixes behind the backup workflow authorization, created
codex/hr-t0-candidate-mapping-v1 from origin/main 7398ce8c8d4f2669d9961aa9c9d99ab429f6544e and
cherry-picked only the full-inventory and headcount fixes. No workflow file changes are present.
Original branch and all three original commits remain intact. This is not a workflow permission bypass:
the backup workflow change is not published or executed here.

In the isolated code-only worktree: full T0 artifact/candidate generation and7 pure groups pass;
59 related contracts pass; diff check clean. Existing GitHub repository credentials accepted the push.
No dependencies installed, source rows read, or production imports run. CI/merge/runtime confirmation
remain release evidence to collect, not implied by push success.
