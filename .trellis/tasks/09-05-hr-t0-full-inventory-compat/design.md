# Design

Extract the existing hash-only inventory validator as a pure exported function in the T0 candidate
module. Recognize only the old unbound T0 format or current full workflow format; require the latter
to carry sourceManifestSha256 and triple equal to the expected triple. Validate every table and record
before constructing the T0 lookup. File reader retains SHA-256 of original full bytes.
Test with synthetic hash-only records and validate the already obtained real hash-only artifact
without showing row identities or producing business writes. Rebind only reviewed source references.
