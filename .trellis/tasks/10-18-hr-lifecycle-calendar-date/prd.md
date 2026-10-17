# Stable lifecycle calendar dates

Fix checklist list/detail and task detail DATE values being serialized as prior-day UTC instants on Asia/Shanghai hosts. Return YYYY-MM-DD or null from existing queries; preserve database values, scopes, permissions, required read audit and workflows. Verify genuine PostgreSQL list/detail under multiple process/session zones, API typecheck/build, native independent HR continuation, CI and production runtime consistency. This operational fix is separate from the unfinished cross-enterprise transfer prototype.
