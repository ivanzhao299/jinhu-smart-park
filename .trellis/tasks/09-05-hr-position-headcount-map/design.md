# Design

Use a small pure parser for the nullable int4 field and the existing candidate quarantine contract.
Read headcountLimit only from the already-bound stage source; no source table or schema changes.
The parser distinguishes valid null from invalid input. Mapping full candidates continues to use
the existing identity/collision dependency graph. Add pure boundary tests and actual candidate
generation assertions. Exact source excerpts and reviewed git diffs justify evidence refresh.
