# Current source facts at369ed5775

- apps/web/app/hr/recruitment/HrRecruitmentClient.tsx createOnboarding requires onboardingCandidate.employeeId and save button requires canCandidates.
- HrOnboardingService.assertReferences allows absent candidateId, then requires preboarding, primary_org_id and position_id; optional candidate must be exact hired source. Existing API semantics already support the missing modern path.
- Shared HrEmployeeSelection supports server search/page_size20 and existing directory read permission; onboarding purpose must use status=preboarding without changing other callers.
- Do not add new business-date rules: source behavior is insufficient to infer policy; keep this leaf to entry continuity.
- Prior leaf1012 technical release independently verified; its real production role acceptance remains pending. No historical backup extraction or production business data changes required.
