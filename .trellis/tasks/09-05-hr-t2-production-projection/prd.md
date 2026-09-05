# T2 production field projection

Implement the missing reusable field-conversion layer between receipt-bound T2 staging and the existing production payload generator. Cover contract types, contracts, changes and hash-only legacy evidence. Preserve ambiguous legacy terms and timestamps; never infer signature history from one signature date. No source extraction, database connection, production activation or binary processing.

Acceptance: every projected field passes the existing target model; exact decimals, null/zero distinction, invalid dates, unresolved flags, provenance drift and derived evidence identities have executable synthetic tests. This is not the full T2 candidate builder: inventory collisions, approved dictionaries, employee/contract dependencies, sealed payload assembly and real-row verification remain required.
