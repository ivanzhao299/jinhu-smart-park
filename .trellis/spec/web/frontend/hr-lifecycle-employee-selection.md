# Lifecycle checklist employee continuity

The checklist creator uses existing scoped employee directory authority and20-row server search/paging. All original status options including departed remain selectable for departure event binding; contract wrappers retain explicit active/preboarding/probation eligibility. Shared HR selector owns bounded pagination, retention, request cancellation and DS layout; each domain retains authoritative rules.

Employee directory failures must not block checklist, template or assignee reads. Refresh and Retry must retry the independent metadata requests too. Canceling task detail must clear its loading state. Explicit employee ID is required before a create writer. Checklist page replacement cancels only the list/detail reads it owns; do not cancel independent pending templates, assignees or selected-employee event requests without restarting them. Changing employee clears both previous event options and selected event; abort replaced event reads and discard late responses. Key the full lifecycle view by complete authenticated context and employee navigation so account/scope/permission changes clean up prior form/detail/read state.

Checklist records and task detail items must render on desktop as well as mobile: DS mobile list defaults to desktop display:none, so provide a route-owned layout-only grid class when cards are the only list representation. Preserve DS cards/buttons and verify desktop/390px no overflow.

Actual component tests cover employee101/page6, retained search target, departed employee event binding, empty selection/writer payload, independent error, scope replacement and late-response cancellation. Shared changes require previous contract tests. Synthetic browser evidence is not production role acceptance.
