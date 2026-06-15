# JinHu Smart Park safety module full-open phase 1 record

## 1. Purpose

This phase aligns safety module menu, page, API, and database permission semantics for the first full-open pass. It focuses on making already implemented safety entries consistently reachable by users who have the matching permissions.

## 2. Boundaries

This phase does not add business workflow enhancements, does not expand high-risk operation permissions, does not change production configuration, and does not write real production business data.

High-risk actions such as delete, close, void, review, stop-work, archive, acceptance, and manage-all remain behind their existing dedicated permissions and audit behavior.

## 3. Fixed Scope

- Operations terminal
- Overdue hazards
- Emergency/work-permit dashboard

## 4. Permission Alignment

| Entry | Previous permission behavior | New permission behavior | Reason |
|---|---|---|---|
| Operations terminal | Frontend fallback used `safety:operations-terminal`; backend menu used `safety_inspect_task:my` | Menu entry is exposed by `safety_inspect_task:my` | The terminal is a personal task execution surface, not a manage-all surface. |
| Overdue hazards | Frontend fallback used `safety_hazard:read`; backend/API used `safety_hazard:overdue` | Menu entry uses `safety_hazard:overdue` | General hazard read permission should not imply overdue hazard access. |
| Emergency/work-permit dashboard | Menu used `safety_emergency_statistics:read`; page/API also require `safety_work_permit_statistics:read` | Backend menu requires both `safety_emergency_statistics:read` and `safety_work_permit_statistics:read` | The dashboard combines emergency and work permit statistics, so both read permissions are required. |

## 5. Migration Patch

Migration `database/migrations/000144_safety_full_open_permission_menu_patch.sql` only repairs permission and menu metadata:

- upserts the three target page/API permission bindings;
- grants page-menu permissions only when the corresponding business read permission already exists;
- grants the emergency/work-permit dashboard page only to roles that already have both required statistics permissions;
- ensures `SUPER_ADMIN` has current safety and video-security menu/action permissions.

The migration does not delete historical permissions, does not clear role permissions, and does not modify business data.

Codex Review follow-up is tracked in `database/migrations/000145_safety_phase1_review_followup.sql` and the related page guard updates:

- operations terminal page guard now uses `safety_inspect_task:my`, matching the menu entry;
- overdue hazard view now allows `overdue_only=true` access through `safety_hazard:overdue` while the normal hazard list remains protected by `safety_hazard:read`;
- emergency/work-permit statistics permission metadata now points to `/api/v1/safety/emergency-work-permit-statistics`.

The follow-up migration only corrects API path metadata for `safety_emergency_statistics:read` and `safety_work_permit_statistics:read`; it does not change role grants or business data.

PR #149 follow-up keeps the overdue hazard entry on its own route:

- `/safety/hazards/overdue` no longer redirects to `/safety/hazards?overdue_only=true`;
- `/safety/hazards/overdue` renders the shared hazard page client in forced overdue mode, so layout/menu guards match `safety_hazard:overdue`;
- `/safety/hazards` still renders the normal hazard page and remains protected by `safety_hazard:read`;
- overdue hazard data continues to load through `/safety/hazards/overdue`, not the normal hazard list endpoint.

## 6. Verification Method

Administrator:

- Confirm safety and video-security menus are visible.
- Confirm operations terminal, overdue hazards, and emergency/work-permit dashboard can be opened.

Permitted normal user:

- With `safety_inspect_task:my`, confirm operations terminal is visible and accessible.
- With `safety_hazard:overdue`, confirm overdue hazards is visible and accessible.
- With both statistics permissions, confirm emergency/work-permit dashboard is visible and accessible.

Unauthorized user:

- Without `safety_inspect_task:my`, confirm operations terminal entry is hidden or access is rejected.
- Without `safety_hazard:overdue`, confirm overdue hazards entry is hidden or API access is rejected.
- With only one emergency/work-permit statistics permission, confirm dashboard entry is hidden or access is rejected.

Tenant or data-scoped user:

- Confirm visible data remains constrained by existing tenant, park, self, and manage-all rules.
- Confirm this phase does not grant `manage_all` to ordinary users.

## 7. Verification Result Template

```text
Branch:
Commit:
Operator:
Date:
Admin menu visibility:
Admin page access:
Normal user menu visibility:
Normal user page access:
Unauthorized user menu visibility:
Unauthorized direct API result:
Tenant/data scope check:
Migration check:
High-risk permission check:
Final decision:
Blocking issues:
Follow-up owner:
```

## 8. Phase Conclusion

After this phase passes lint, typecheck, migration review, and role/menu verification, it is reasonable to move to the next phase: safety module access smoke verification.
