# Codex Review 4795277748 Break-Loop Analysis

## Bug Analysis: File Permission Intersections And Queue Display Ownership

### 1. Root Cause Category

- **Category B — Cross-Layer Contract**: protected business files require both a
  domain permission and the generic `/files` endpoint permission, but the frontend
  projected only one side of that authorization contract.
- **Category C — Change Propagation Failure**: the earlier turnover upload fix was
  not expanded to attachment reads or the sibling housing file-backed workflows.
- **Category E — Implicit Assumption**: turnover labels assumed the current unit
  candidate page was a complete display dictionary even though it is paginated and
  excludes disabled inventory.

### 2. Why Earlier Fixes Failed

1. The previous fix correctly intersected turnover execution with `file:upload`, but
   retained an unconditional `AttachmentList`, missing the symmetric `file:read`
   requirement.
2. The earlier role review focused on action buttons and immediate upload requests;
   it did not treat editable fields with a hidden submit button as an unauthorized
   mutable surface.
3. Candidate pagination was reviewed for selectors, but its reuse as a queue label
   source was not traced as a separate consumer.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | API contract | Return unit display fields with each turnover item | DONE |
| P0 | Permission projection | Intersect domain read/write with `file:read`/`file:upload` | DONE |
| P1 | Same-page audit | Apply the rule to housing handover, repair, signature, and purchase forms | DONE |
| P1 | Regression coverage | Test permission gates and turnover label ownership | DONE |
| P1 | Documentation | Record executable rules in backend, frontend, and cross-layer specs | DONE |

### 4. Systematic Expansion

- **Similar issues**: any page that mounts an API-backed attachment list or uploader
  can produce predictable 403s if it checks only the surrounding business permission.
- **Design improvement**: operational list responses own the display fields needed
  to render each row; candidate APIs remain selector-only data sources.
- **Process improvement**: permission review uses a four-way matrix—domain only,
  generic file only, both, and neither—and audits fields, effects, and controls.

### 5. Knowledge Capture

- [x] Updated property-business executable contracts.
- [x] Updated frontend file-control contracts.
- [x] Updated the cross-layer review checklist.
- [x] Added targeted and real API regression assertions.
- [x] Confirmed this repository has no generated `src/templates/markdown/spec/` copy.
