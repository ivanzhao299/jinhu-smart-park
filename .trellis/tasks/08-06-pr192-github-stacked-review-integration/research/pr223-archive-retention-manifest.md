# PR #223 Trellis archive retention manifest

## Purpose

Keep the canonical task record reviewable while excluding generated evidence payloads that made the
PR diff too large for useful GitHub and Codex review.

## Pre-prune baseline

- GitHub: 63,591 changed files, 12,120,811 additions, 8,254 deletions.
- Local `main...HEAD`: 63,901 changed files.
- `.trellis/tasks/archive`: about 62,777 files / 908 MiB.
- Primary payloads: copied runtime dependencies, formal source snapshots, source maps and superseded
  direct-PostgreSQL evidence runs.

## Excluded from Git tracking

- Raw files below `.trellis/tasks/archive/**/research/**` unless explicitly force-added as a compact
  canonical record.
- `.trellis/tasks/archive/**/formal-source-snapshot/**`
- `.trellis/tasks/archive/**/*.map`
- `.trellis/tasks/archive/**/*.tap`
- `.trellis/tasks/archive/**/*.reservation.json`
- All versioned direct-PostgreSQL evidence payload directories, including the final v31 raw
  intent/result stream and its generated source/dependency inventories. The compact v31 candidate
  manifest and candidate/provision/execution authorities remain canonical.

These files remain recoverable from existing commits and may remain in the local worktree after
`git rm --cached`; they are not authoritative review inputs.

## Retained in Git

- Every archived task's `task.json`, `prd.md`, `design.md`, `implement.md`, `check.jsonl` and
  `implement.jsonl` summary record.
- Compact final sign-offs, summaries and necessary indexes outside raw evidence directories.
- The final v31 candidate manifest plus candidate/provision/execution authority records and the
  current-authority locator.
- The external Windows Chrome UAT evidence directory is out of scope and must not be modified.

## Post-prune index baseline

- Final PR index compared with `origin/main`: 933 files, 177,252 additions, 8,254 deletions.
- Non-archive product/script/migration/task files: 873.
- Retained archived task and compact evidence files: 60.
- Generated/runtime archive files removed from the PR index: more than 62,000 relative to the
  original local integration diff; local physical evidence remains untouched.

## Canonical evidence rule

Git stores compact metadata needed to locate, identify and verify final evidence. Bulk dependency
copies, source snapshots and transient runner output belong in an external artifact store or local
evidence workspace, not in a pull-request diff. Because archived research is ignored by default,
future compact canonical records require an intentional `git add -f <exact-path>`.
