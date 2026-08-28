# Browser Rehearsal Hydration

## Scenario: Interacting With A Hydrated Login Surface

### 1. Scope / Trigger

- Applies when a smoke, migration rehearsal, or UAT runner drives a server-rendered React/Next.js login page through a real browser.
- Triggered before the runner enters credentials or submits the form in each isolated browser context and viewport.

### 2. Signatures

- Browser runner readiness input: the login route plus username, password, and submit selectors.
- Readiness observation: `document.readyState === "complete"`, all required controls exist, and the submit control owns a React `__reactProps$...` property.
- Failure remains the bounded, actor/viewport-scoped `YUZHOU_UAT_BROWSER_LOGIN_FORM_MISSING` error; credentials and rendered values never enter the detail.

### 3. Contracts

- Server-rendered DOM presence is not interaction readiness. The runner must wait for client hydration before setting controlled inputs or clicking submit.
- The readiness poll is bounded and occurs independently in every browser context; a cold first context must not hide a warm-context race.
- Authentication success still requires navigation away from `/login` and a stored access token. Hydration readiness alone is never recorded as a successful login.

### 4. Validation & Error Matrix

- document incomplete or required control absent -> keep polling until the existing bounded deadline, then fail `LOGIN_FORM_MISSING`.
- controls present but React props not attached -> keep polling; do not click.
- hydrated form submits but no token/navigation appears -> fail `LOGIN_FAILED` for that actor and viewport.
- API/runtime/role failure after login -> preserve its more specific downstream browser-matrix gate.

### 5. Good / Base / Bad Cases

- Good: the second warm browser context exposes SSR controls immediately, hydrates later, and the runner waits before clicking.
- Base: a cold context completes document load and hydration together, then proceeds normally.
- Bad: polling only `document.readyState` and input existence, causing a no-op click before React attaches the delegated submit handler.

### 6. Tests Required

- Real headless-Chrome integration must delay attachment of the login click handler and the React-owned readiness marker, then complete all actors and both viewports.
- The full rehearsal must prove API login and the desktop/390 browser matrix independently; direct HTTP login cannot substitute for the browser path.
- Failure evidence must identify actor and viewport without recording usernames, passwords, tokens, or personal data.

### 7. Wrong vs Correct

#### Wrong

```js
await poll("document.readyState === 'complete' && document.querySelector('input')");
await clickSubmit();
```

#### Correct

```js
await poll(`document.readyState === 'complete'
  && requiredControlsExist()
  && Object.keys(submitButton).some(key => key.startsWith('__reactProps$'))`);
await clickSubmit();
```
