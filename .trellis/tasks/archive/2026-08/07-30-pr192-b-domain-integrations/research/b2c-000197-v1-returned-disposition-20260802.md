# B-2c 000197 v1 Returned Disposition

Date: 2026-08-02

Status: **RETURNED / AUDIT-ONLY / NEVER EXECUTED**

The following v1 artifacts remain immutable audit evidence and are not current inputs:

- R1 SHA `65acbccf71c91795602e7408930bdce44721acaafa503fa81d6f2506b8da1f36`.
- Gate manifest SHA `6926d42365dbe70f1627459cf66929818aceea61891e062b570bc11436ff48f1`.
- Static handoff SHA `33bbc079ec77e9658d69d041e9a4be55a051ed2d662ecff70eaa6e11e06436ab`.
- SQL SHA `39148494abd2734df999be4fbfb3190beff81455d8035ff6ac4904490d5a8120`.

They were returned because the prefix-history matrix, failed-retry authority binding,
full resource identity and repository/worktree rescan were incomplete. No v1 SQL was
executed and neither PostgreSQL target contains a `000197_*` history row.

R0 grammar SHA
`705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
was not returned and was not edited. Current work must consume only the separately
sealed v2 R1, SQL, runner, spec, manifest and handoff SHAs.
