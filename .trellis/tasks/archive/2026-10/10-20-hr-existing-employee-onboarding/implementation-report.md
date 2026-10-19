# Existing preboarding employee onboarding

Confirmed product gap: initial onboarding service already accepts a preboarding employee without candidateId, while modern creation required candidate read and a converted candidate. Added explicit recruitment/existing-employee paths using the shared paginated employee selector. Direct path filters status=preboarding, requires existing directory-read authority and submits no candidate association. Switching clears both references, conversion continuation returns to candidate mode. Existing operation hook normalizes missing candidateId against formal null receipts and retains exact uncertain-request replay.

New source selector uses scoped DS layout with44px touch options and phone stacking. No API, permissions, schema or production business data changes.

Implementer reports focused initial-onboarding/shared-contract-selector interaction31/31, Web typecheck/lint and diffcheck PASS. An initial JSX callback parse error was found by root's real-component build and corrected before passing. Exact body/null mismatch was corrected and covered. Independent final checker is in progress.

Root CUA actual modern components with narrow synthetic HR (no candidate read): reproduced original disabled entry; after fix selected employee across page2 of21, saved direct draft, submitted to approval and saw actual pending receipt plus own-review restriction. Desktop1280/phone390 CSS checks show no horizontal overflow. Screenshots/source hashes in private browser/proof.json under /Users/mac/.codex/artifacts/hr-existing-employee-onboarding-20261020. This UI fixture is not production role or API/DB acceptance.

Full parent goal stays active: actual production role acceptance, formal July2026 full-source payroll trial, legacy rule/report equivalence, incremental import, restore/cutover and independent product acceptance remain separate.
