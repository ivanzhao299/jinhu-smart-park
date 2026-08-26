# Design

Use a scoped selector on the existing HR page root: `.page > :global(.ds-panel)`. This fixes direct HR work surfaces while leaving global `ds-panel`, nested operation cards, upload surfaces, and every non-HR module unchanged.

Desktop padding is 22px, matching the reviewed HR operation-card rhythm. At 520px and below it becomes 18px, preserving useful phone width. Existing `sectionHeading`, form, filter, record, and action spacing remains responsible for internal relationships.
