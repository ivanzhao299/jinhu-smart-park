# Codex Review 4803041776 Break-Loop Analysis

## 1. What failed

Three sibling boundaries were incomplete:

1. Homestay rescheduling could replace a force-released occupancy and implicitly
   restore it to `active`.
2. Homestay availability could report an inactive unit as available.
3. The frontend used a stay-operation action as the only booking-detail entry and
   cleared the complete detail for terminal bookings, removing legitimate audit and
   finance access.

## 2. Root-cause categories

- **C — incomplete sibling-entry analysis:** the earlier occupancy fix hardened
  check-in but did not trace the same released state through reschedule.
- **D — incomplete projection analysis:** write-path active-unit checks existed, but
  the availability read projection was outside that review path.
- **E — coupled UI contexts:** detail visibility, stay actions, and finance actions
  were represented by one preparation panel instead of independent capabilities.

## 3. Why previous fixes did not prevent this review

The previous verification proved the exact scenarios that had already been reported,
but its state/action matrix was incomplete. It checked force release against check-in,
not against every operation that consumes the occupancy. It checked inactive units on
booking writes and rentable KPI capacity, not the availability projection. It also
solved misleading terminal stay buttons by clearing the whole panel, without listing
which read and finance capabilities must remain.

This was therefore not an absence of all self-testing; it was insufficient negative
coverage around adjacent entry points and retained capabilities.

## 4. Implemented prevention

- Period replacement now validates the exact source, current period, expected
  lifecycle status, and hold validity under the occupancy lock.
- Period replacement cannot change lifecycle status or erase release metadata.
- Inactive units are explicitly `out_of_service` in homestay availability.
- Booking detail, stay operations, finance summary, and finance mutations have
  separate capability decisions.
- Behavioral and E2E coverage includes released-occupancy reschedule, inactive-unit
  availability, terminal detail retention, and permission combinations.

## 5. Required future review matrix

For each lifecycle or occupancy change:

- enumerate create, confirm/activate, reschedule/replace, check-in, cancel/no-show,
  checkout, force release, availability, KPI, and detail refresh;
- test the allowed state and nearest forbidden state for every applicable entry;
- distinguish controls removed by a negative requirement from detail/capabilities
  that must remain;
- exercise booking-read only, finance-read, finance-register/waive, and stay-manage
  permission combinations;
- prefer behavioral tests for invariants; source-pattern tests may supplement them
  but cannot be the sole proof.

No mirrored project-specific spec template exists in this repository, so there is no
template copy to synchronize for these contract updates.
