# Preserve the legacy position staffing limit in production candidates

`extract-yuzhou-t0.sh` already projects dbo.job.defpersons as headcountLimit and the isolated
loader stores it in hr_position.headcount_limit. Production T0 candidates currently force null.
Map exact signed PostgreSQL integers (including zero); retain null/blank as null; reject invalid,
fractional, boolean and out-of-range values into an explicit quarantine rather than dropping them.
Keep ambiguous historical negative integers intact, not silently replaced by zero or guessed rules.

Do not claim staffing report parity: legacy realpersons, asymmetric rightscope, row-level projection
and actual runtime validation remain gaps. Re-review existing stale loader/service/permission evidence
and bind current reviewed code without awarding compatibility credit or authorizing production.
