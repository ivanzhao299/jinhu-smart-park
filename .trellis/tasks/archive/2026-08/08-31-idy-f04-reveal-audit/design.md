# Design: IDY-F04 Reveal Audit

- Preserve encrypted-at-rest identity storage and masked projections.
- Remove plaintext from the normal Party response contract.
- Add a dedicated reveal endpoint/action with an atomic permission, validated reason code, and required audit before response.
- Do not log, persist in audit payloads, or expose plaintext through errors, lists, exports, or unauthorized responses.
