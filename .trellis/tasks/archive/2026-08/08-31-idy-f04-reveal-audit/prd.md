# PRD: IDY-F04 Reveal Audit

- Issue: #513; parent queue: #509.
- Party detail is masked by default; ordinary responses never contain plaintext identity numbers.
- Plaintext reveal is a separate permissioned action requiring a controlled reason and required audit.
- Audit failure fails closed. Tenant/park scope and sensitive-log restrictions remain mandatory.
- API, Web, shared contracts, tests, release documentation, CI/review/merge and main dual-green are in scope.
