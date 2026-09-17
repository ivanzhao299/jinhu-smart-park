# Issue740 V02 post-05596d26 real-device final recheck — PASS

Date: 2026-09-17 (Asia/Singapore). Executor: parent assistant directly (Codex CLI failed twice on model capacity: `bash-13` gpt-5.6-sol, `bash-14` gpt-6-astra; per cost-control ≤2 retries then takeover).

## Environment restore (phase 1)

- Docker Desktop engine restarted (user manual restart + assistant-launched `Docker Desktop.exe`; engine recovered).
- Original UAT containers survived `Exited(255)`: `jinhu-housing-uat-20260914-024557-api-1`, `-postgres-1`; volume `jinhu-housing-uat-20260914-024557_data` preserved. Started via `docker start` — **no recreate, no migrate, no seed**.
- /tmp had been wiped between sessions: original compose file, steps private backup, credentials dir, `/tmp/issue740-authorized-device.md` all lost; handoff file rebuilt by parent from session-confirmed authorization constraints. Admin credentials recovered from API container env (`docker inspect`).
- API rebuilt from HEAD `05596d26` (`pnpm --filter @jinhu/api build`) + `docker start api-1` → `/api/v1/health`=200, `/api/v1/ready`=200.
- Web: root cause of first login failure — `next.config.ts` rewrites bake `NEXT_PUBLIC_API_TARGET` into `.next/routes-manifest.json` at BUILD time; earlier session build baked default `3101`. Rebuilt with `NEXT_PUBLIC_API_TARGET=http://127.0.0.1:3428` (routes-manifest verified → 3428), restarted `next start -p 3427`; `/`=307 (login redirect), `/api/v1/health` via web proxy=200.
- Evidence: `../env-restore-2/restore.txt`.

## V02-A legacy-Chrome submit button (phase 2, real device)

- Authorized device `7f00544c` (`adb get-state`=device), system browser `com.android.browser`, task route `http://127.0.0.1:3427/assets/property-operations/64700142-1210-43a1-a1f1-5073bae5a166` via task reverse 3427/3428 (removed after test, readback empty).
- Login as isolated admin `issue740_admin` (52-char password entered in 3 chunks after single-shot `input text` corruption; masked length 52 verified). Browser save-password prompt dismissed with "一律不保存".
- Dialog opened via 申请经营模式切换 → 目标模式=长租经营 → 提交切换审批. Dialog + reason (28 chars) + buttons confirmed via uiautomator dump (`dump-n.xml`).
- **Objective pixel verification** (pure-Python PNG decode, no PIL): submit button 提交审批 bounds [99,1861][981,1988], 6 interior sample points all **rgb(11,79,122)** — solid DS primary background, no blank/transparent rendering. References: cancel button rgb(239,239,239), dialog body rgb(255,255,255) (surface fallback), page behind dialog rgb(207,214,219). Screenshot: `dialog-open.png` (sha256 9591372e…8ece7).
- **PASS**: pre-fix Chrome 109 rendered the primary button background transparent (computed `color-mix` failure); post-fix `@supports not` fallback provides solid tokens.

## V02-B real 409 → Chinese message (phase 2, real device + real API)

- Second client (host curl, admin token) created a real pending transition for the same source: POST `/api/v1/property/units/64700142…/mode-transitions` → HTTP 200 `disposition=created`, requestId `b728a2de-143e-4193-af97-1a17f8b0301a`.
- Duplicate same-source submission reproduced from host: **HTTP 409 `{"code":409,"message":"property-version-conflict"}`** — the phone received this same real 409 on its stale dialog.
- Phone UI after tapping 提交审批 (`dump-409.xml`, `dialog-409.png` sha256 0a76d44f…cd274):
  - Error line shows **数据状态已变化，请刷新后重试** (propertyErrorMessage conflict mapping; pre-fix showed raw `property-version-conflict`).
  - Reason `Issue740-V02-post-fix-recheck` retained in textarea.
  - Dialog stays open (title/object/consequences/buttons present).
  - Busy released (button label back to 提交审批, not 正在提交…; no stuck state).
- **PASS**.

## Cleanup (verified)

- Pending approval `b728a2de…` formally withdrawn via API (`decisionStatus=withdrawn`, `executionStatus=not_required`).
- Unit `I740-S-A01-withdraw` readback: mode none, status none, version 1 — identical to pre-test state.
- Task page closed (browser back at its own start portal, no platform content); reverse list empty; `user_rotation=0`; IME `com.sohu.inputmethod.sogou.xiaomi/.SogouIME`; device still `device`. (`cleanup.txt`; pre-test baseline recorded same values — original baseline file lost in /tmp wipe, values re-recorded at recheck start: accel=null/user_rot=0/IME Sogou/reverse empty.)

## Known boundaries (unchanged, non-blocking)

- Landscape IME physical occlusion (visual viewport ≈86px) remains a native limitation, documented in `../mobile-diagnosis/report.md`; out of V02 A+B scope by review decision.
- Phone raw HTTP 409 capture not taken on-device; the 409 is proven by host reproduction of the identical same-source request plus the phone UI rendering the exact mapped Chinese message.
- Password typed via chunked `input text`; masked-length verified but no per-character on-device equality assertion.

## Matrix

| Check | Status |
|---|---|
| Authorized device `7f00544c` online | PASS |
| Isolated env restored without DB rebuild | PASS |
| API health/ready 200 on new dist | PASS |
| Web 3427 + proxy to 3428 | PASS |
| V02-A submit button solid visible background (pixel-verified) | PASS |
| V02-B real 409 property-version-conflict | PASS |
| V02-B Chinese conflict message | PASS |
| V02-B reason retained / dialog open / busy released | PASS |
| Pending withdrawn + business object unchanged | PASS |
| Reverse/rotation/IME/task-page cleanup | PASS |
| Landscape IME occlusion | Known native boundary (documented, not a defect) |
