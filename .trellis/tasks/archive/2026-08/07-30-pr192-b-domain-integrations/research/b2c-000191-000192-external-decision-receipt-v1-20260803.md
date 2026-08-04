# 000191/000192 External Decision Receipt v1

Status: **ALL DECISION BRANCHES SELECTED / ROLE COVERAGE PARTIAL / NOT FULL TECHNICAL OR PRODUCTION SIGN-OFF**

Source: current Codex task user messages

Source task session: `codex_019fc52f-8279-7611-b68c-96b937b5c305`

Received at: 2026-08-03T17:18:52+08:00, 2026-08-03T17:20:22+08:00, and 2026-08-03T17:27:05+08:00

Named signer: `危立帅`

Asserted authority: `代产品/财务/数据责任人确认`

This receipt records exactly the authority asserted by the user. It does not claim
that three independent people signed, does not invent account IDs or organizational
delegation documents, and does not supply homestay/housing domain-owner or
audit/security-owner signatures that were not stated.

## Recorded decisions

| Decision | Selected branch | Recorded statement |
| --- | --- | --- |
| DEC-01 | A | Cancellation fee is frozen at approval submission time; occupancy release and credential voiding remain in the same atomic effect manifest. |
| DEC-02 | A | Do not infer sources for unlinked legacy refunds/waivers; block new approval finance for affected bookings until audited manual reconciliation. |
| DEC-03 | A | All legacy housing monetary data in scope may be interpreted and backfilled as CNY. |
| DEC-04 | A | Pre-create a draft move-out handover before submission and freeze its ID/version, amounts, and target receivable. |
| DEC-05 | A | Preserve one frozen aggregate target receivable; freeze expected-version CAS and one audit row for every purchase item. |
| DEC-06 | A | Use the terminal-safe purchase lifecycle matrix: rejected, void, and refunded are terminal; a refunded purchase cannot subsequently be voided. |

## Signature coverage

- Product/finance/data responsibility: confirmed through the named delegated signer.
- Homestay domain-owner role required by DEC-01: not separately asserted.
- Housing domain-owner role required by DEC-04/05: not separately asserted.
- Audit/security role required by DEC-05/06: not separately asserted.
- DEC-06 branch choice: confirmed by the named delegated signer.
- DEC-06 housing-domain and audit/security role assertions: not separately supplied.
- Trusted signer-directory/identity-authority artifact: not supplied; the name and
  delegated roles are currently evidenced only by the cited Codex user messages.

## Effect on execution

All selected branches may now be used to finish a superseding technical authority and
its tests. This receipt alone does not authorize migration reservation or authoring:
the revised authority must first reach `open_P0_P1=[]`, and the remaining required
domain/audit authority must be supplied or explicitly delegated.
