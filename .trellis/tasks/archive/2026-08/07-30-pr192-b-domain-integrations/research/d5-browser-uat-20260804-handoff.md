# D5 Chrome browser UAT handoff — 2026-08-04

Status: browser UAT complete; final quality gate pending before archive.

## Authority and environment

- Official user Chrome plugin only.
- Clean logout and login from the login surface with local dev seed account.
- PostgreSQL 16 isolated database: `jinhu_uat_20260804`.
- Web: `http://localhost:3100`; API: `http://localhost:3101`.
- Evidence: `D:/lishuai/JinhuWork/智慧园区UAT测试/2026-08-04`.

## Completed browser gates

- Homestay 10 canonical routes and Housing 12 canonical routes.
- Property identity, notification, event incident and approval incident lists/details.
- Admin and explicit `s1_user` denial surfaces.
- Desktop and 768/390/360/320 critical-route matrix; all measured with zero horizontal overflow.
- Mobile drawer navigation and post-navigation close behavior.
- Keyboard focus, validation aria-live, dialog focus trap, Escape focus restoration.
- Accessibility landmarks, headings, definition lists and named controls.
- Deep link and refresh persistence.
- Real notification mark-read, event replay and approval execution retry through Chrome UI.

## Product defects fixed

- PostgreSQL quoted TypeORM alias in module dependency projection.
- Homestay availability strict date interval and clear-field handling.
- Authenticated DashboardLayout for `/property/*`.
- Typed `$3::uuid` super-actor identity predicate.
- Mobile off-canvas sidebar and deterministic close on navigation.
- Semantic Housing forbidden h1.
- Consequence dialog Tab focus loop.

Affected gates are green: API selected tests 15/15, API build, Web selected tests 10/10, Web typecheck, Web lint, affected-file ESLint and `git diff --check`.

## Remaining hard browser gates

The Chrome plugin does not expose browser-level zoom or media emulation. Chrome settings navigation is rejected by BrowserUse security. No alternate browser, CDP, DOM/CSS injection, standalone Playwright or Computer Use may substitute.

User must manually toggle, one at a time, in the current Chrome / Windows session:

Chrome 200% and 400% are now PASS. At 200% the plugin measured `outerWidth=1920`, `innerWidth=960`, DPR 2; at 400% it measured `outerWidth=1920`, `innerWidth=480`, DPR 4. Homestay booking, Housing lease, and approval incident details all had zero horizontal overflow at both levels. Visible keyboard focus also passed.

Remaining user toggles:

Reduced motion is now PASS at 100% zoom. The real media query was active. The first browser pass exposed 0.16–0.28 second transitions in the shared Dashboard shell; a global reduced-motion rule now reduces all computed animation and transition durations to 0.01ms. Homestay booking, Housing lease, and approval incident details all passed with zero overflow and visible focus.

Forced colors is now PASS at 100% zoom with the real Windows contrast theme. Homestay booking, Housing lease, and approval incident details all displayed stable content, borders, controls, and system-color focus; hidden text count and horizontal overflow were both zero.

All browser matrix gates are complete. Run the final code/evidence gates, regenerate hashes, and archive only after those gates pass.

## Final quality gate

- Web typecheck PASS.
- Web targeted tests 11/11 PASS.
- Web lint PASS.
- Next.js production build PASS; 158 static pages generated.
- API targeted tests 15/15 PASS.
- API Nest build PASS.
- `git diff --check` and staged diff check PASS.
- Web `/login` returned 200 and internal API `/api/v1/health` returned 200 after runtime restart.
- Work commit: `b6f8d47 fix(property): close final browser UAT gaps`.

The first Web build attempt failed only because a stopped root-run dev container owned one `.next` build artifact. Ownership of the exact `.next` cache directory was corrected and the clean rerun passed. No source workaround was applied.

After each toggle, use the same Chrome plugin to capture evidence and verify focus, content visibility, reflow and horizontal overflow. Then regenerate `sha256-manifest.csv`, run final gates, update this task, and use `trellis-finish-work` only if all gates pass.

`B3-P1-BROWSER-VISUAL-EVIDENCE-ENVIRONMENT` is closed by the evidence root above.
