# Apartment Formal Documents And Signing

## Scenario: Frozen formal document and responsibility-role convergence

### 1. Scope / Trigger

- Trigger when changing apartment templates, generated documents, signing, default application reasons, or responsibility-user role seeds.

### 2. Signatures

- `GET/PUT /apartments/settings`: `default_application_reason` (1..1000 chars).
- `POST /apartments/documents/generate`: published `template_id` plus exactly one usable `application_id` or `stay_id`.
- `GET /apartments/documents/:id/render`: `{ filename, html }`.
- `POST /apartments/documents/:id/sign-online`: `signer_name`, confirmation `statement`, optional `client_label`.
- `POST /apartments/documents/:id/sign-paper`: scoped active `signed_file_id`.
- DB document status: `pending_signature | online_signed | paper_signed | void`.

### 3. Contracts

- Generation freezes template version, escaped variable snapshot and rendered HTML; later template edits never change it.
- Template variables are HTML escaped and executable template markup is stripped before persistence/rendering.
- Online signing hashes frozen HTML on the server and records actor, name, statement, time and evidence.
- Paper signing uses the uploaded file's `content_sha256` when available and validates file tenant/park scope.
- Default reason affects new form initialization only; historical application reasons are immutable.
- Never edit the succeeded responsibility migration to correct roles; use an exact, scoped production convergence seed.

### 4. Validation & Error Matrix

- Missing target or published template -> 400/404.
- Missing associated application/stay in scope -> 404.
- Repeat sign or sign after void -> 409.
- Missing/cross-scope/deleted paper file -> 404.
- Blank signer/default reason -> DTO 400.

### 5. Good/Base/Bad Cases

- Good: generate, print, online-sign, then verify hash and signer evidence.
- Base: generate and upload a scanned paper signature file.
- Bad: trust a browser-provided hash, mutate generated HTML after signing, or restore `SYSTEM_ADMIN` from a responsibility migration.

### 6. Tests Required

- Contract test asserts five formal templates and every document action.
- Disposable PostgreSQL applies migration and production seed twice and asserts 5 templates / 1 setting.
- RBAC governance test enumerates historical `SYSTEM_ADMIN` bindings and requires explicit convergence.
- Run API/Web lint, typecheck, build and production browser verification.

### 7. Wrong vs Correct

#### Wrong

```ts
signedSha256 = dto.signed_sha256;
documentHtml = currentTemplate.contentHtml;
```

#### Correct

```ts
documentHtml = renderAndFreeze(template, escapedVariables);
signedSha256 = sha256(documentHtml); // server-owned evidence
```
