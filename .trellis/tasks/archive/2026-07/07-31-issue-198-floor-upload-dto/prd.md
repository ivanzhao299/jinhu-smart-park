# Issue 198 floor attachment upload DTO rejection

## Goal

Make floor layout and other domain-specific uploads send only the metadata their
endpoint owns, while keeping generic `/files` association fields intact.

## Requirements

- Keep `biz_type` and optional `biz_id` on generic `/files` uploads.
- Omit those association fields for custom `uploadPath` endpoints; their route
  parameters and service adapters are authoritative.
- Preserve `file`, `remark`, and the request helper's `original_name` behavior.
- Add an executable multipart-field regression test.

## Acceptance Criteria

- [ ] `/files` FormData contains `biz_type` and the provided `biz_id`.
- [ ] `/floors/:id/layout` FormData omits `biz_type` and `biz_id`.
- [ ] Both paths preserve `file` and trimmed `remark`.
- [ ] Existing filename recovery tests remain green.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
