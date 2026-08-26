# Design

Reuse `ds-page`, `ds-hero`, `ds-panel`, `ds-mobile-record-list`, `ds-mobile-record`, `ds-kpi-grid`, `ds-kpi-card`, `form-field`, and `ds-button`. Add only attendance-oriented layout classes to the existing HR CSS module.

The request queue uses a compact two-field toolbar. The daily-result status filter moves below the heading into the same toolbar pattern. HR operations become a responsive grid of four bordered subgroups; each subgroup owns its label, fields, and action. Month close gets a compact, labeled action toolbar. At 720px and below all toolbars and operation groups become one column and buttons become full width.

No handlers, permissions, request payloads, or API calls change.
