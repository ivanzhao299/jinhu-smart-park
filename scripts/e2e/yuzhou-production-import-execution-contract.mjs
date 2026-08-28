#!/usr/bin/env node

// Production execution advanced to v2. Preserve the established test entrypoint
// as an alias so CI cannot accidentally keep validating the retired v1 model.
await import("./yuzhou-production-import-v2-contract.mjs");
