# PR214 preserve result photo evidence

## Goal

Preserve unavailable per-result inspection photo associations across Web and API updates.

## Requirements

- Track attachment projection availability independently for every inspection result.
- Omit `photo_file_ids` for unavailable result projections while preserving explicit
  replacement semantics for valid arrays, including valid empty arrays.
- On the API, preserve an existing result's photo IDs when the field is omitted;
  new results still default omitted photos to an empty array.
- Add Web and API regression coverage and capture the aggregate-wide replacement
  field rule in Trellis specs.

## Acceptance Criteria

- [x] Malformed or unauthorized per-result photo projections cannot erase existing
  evidence on resubmission.
- [x] Explicit empty and non-empty arrays still replace existing result photos.
- [x] Omitted photos on a newly created result produce an empty association.
- [x] Web/API tests, lint, typecheck, and build pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
