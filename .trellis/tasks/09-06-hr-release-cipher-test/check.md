# Bug analysis and verification

1. Root cause: implicit assumption (E). The malformed-envelope test assumed replacing
   the random ciphertext's final byte with `00` always changes it. Release run
   33976845257 disproved that at line 72, returning its known synthetic plaintext.
2. No speculative reruns or production changes were attempted. Both affected assertions
   now use the same deterministic XOR-one-bit mutation.
3. Regression exhausts all 256 final bytes, checks prefix/length preservation and change,
   then exercises the real service's null and explicit-authentication-error paths.
4. A scoped search found this fixed-zero pattern only in the two replaced API assertions.
   Production encryption still uses random nonces; runtime code and credentials are untouched.
5. The Party security spec records the rule. No corresponding source-template tree exists
   in this application repository; no template was invented.

Affected test: 9/9 PASS both in a runtime run and a separate normal ts-node typechecked
run. Existing installed dependencies were reused read-only via NODE_PATH; compiler
baseUrl/typeRoots pointed to those same dependencies without disabling type checking
in the second run. No dependencies were installed or changed. Targeted ESLint using
the byte-identical existing repository config: 0 errors, 0 warnings. `git diff --check`
passed. Full application checks remain in CI; production release has not been retried.
