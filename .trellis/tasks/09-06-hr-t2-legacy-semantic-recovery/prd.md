# Legacy T2 contract semantic compatibility

## Requirement
Accept authenticated historical contract staging that predates the five derived semantic fields, without rewriting original staging bytes or source row identities/hashes. Preserve modern projection behavior and all true data exceptions. This fixes actual evidence: 802 real contracts lack all five derived fields and are rejected with T2_SEMANTIC_DECISION_INVALID; 349 renewals then become parent-blocked. Eight changes lack parent contracts independently.

## Acceptance
- Legacy and equivalently enriched synthetic contracts yield equal business fields while each keeps its original source hash.
- Term, signature and renewal semantics use the existing reviewed transformer logic; no guessed term from legacy duration fields or fabricated signature history.
- Partial or inconsistent supplied derivations fail explicitly; no silent correction of existing claims.
- Invalid dates, ranges, negative/overflow counts and original hash drift remain rejected.
- Tests cover actual-shaped legacy absence through projector and candidate/materializer, plus modern compatibility and negative cases.
- Only aggregate real-source projection evidence may be emitted; no source rows or private paths in Git.
- No source extraction, database writes, complete A/B rerun, secret access, production activation or compatibility-score inflation.
- Accept exact Chinese yes/no legacy agreement flags alongside existing boolean/binary encodings; null, blank and unknown encodings remain explicit exceptions. Actual source audit found all three agreement flags use Chinese no on all 802 contracts.
- Old isolated SQL loader is not the production payload writer and is not certified by this task. Record its different flag/signature semantics; do not silently claim equivalence.
