# Deterministic ciphertext tampering in the release test

Release 33976845257 failed before deployment at
`party-sensitive-data.service.spec.ts:72`. The safe log classification proves the
test expected null but got its synthetic plaintext. Appending `00` does not mutate
a ciphertext whose last byte already equals zero, so random encryption makes the
test intermittently fail (approximately 1/256).

Only fix the test mutation: flip a bit in its final payload byte and assert the
result changes. Exercise every possible final byte, including zero. Keep runtime
encryption, nonce generation, authentication, keys, credentials and production data
unchanged. Run the affected test and submit a minimal PR; no blind release reruns.
