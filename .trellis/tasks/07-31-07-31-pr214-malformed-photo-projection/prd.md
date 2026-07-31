# PR214 malformed photo projection

## Goal

Reject partially malformed photo ID projections so resubmission preserves existing evidence.

## Requirements

- Treat a photo ID projection as available only when the runtime value is an array
  and every member is a string.
- If any member is malformed, omit `photo_file_ids` from the resubmission payload so
  the API preserves the existing evidence association.
- Preserve the existing semantics for valid empty arrays and valid string arrays.
- Capture the strict replacement-projection rule in Trellis specs.

## Acceptance Criteria

- [x] `[null]` and `["file-id", null]` projections are unavailable and cannot
  become an explicit empty or partial replacement.
- [x] Valid string arrays continue to normalize by trimming and removing empty
  string entries.
- [x] Regression tests cover partially malformed arrays.
- [x] Web safety tests, lint, typecheck, and build pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
