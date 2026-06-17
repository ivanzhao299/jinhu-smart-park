import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPasswordLockoutState,
  evaluatePasswordFailure,
  isPasswordLocked,
  normalizePasswordLockoutConfig,
  resetExpiredPasswordLock
} from "./auth-password-lockout.policy";

test("password lockout policy accumulates failures inside the configured window", () => {
  const now = new Date("2026-06-17T00:00:00.000Z");
  const config = normalizePasswordLockoutConfig({
    enabled: true,
    failureLimit: 3,
    windowMs: 900_000,
    durationMs: 900_000,
    resetOnSuccess: true
  });

  const first = evaluatePasswordFailure(
    {
      passwordFailedCount: 0,
      passwordFailedWindowStartedAt: null,
      passwordLockedUntil: null,
      lastPasswordFailedAt: null
    },
    config,
    now
  );
  const second = evaluatePasswordFailure(first.state, config, new Date(now.getTime() + 60_000));

  assert.equal(first.state.passwordFailedCount, 1);
  assert.equal(second.state.passwordFailedCount, 2);
  assert.equal(second.lockoutTriggered, false);
  assert.equal(second.state.passwordFailedWindowStartedAt?.toISOString(), now.toISOString());
});

test("password lockout policy locks when the failure threshold is reached", () => {
  const now = new Date("2026-06-17T00:00:00.000Z");
  const config = normalizePasswordLockoutConfig({
    enabled: true,
    failureLimit: 2,
    windowMs: 900_000,
    durationMs: 600_000,
    resetOnSuccess: true
  });

  const result = evaluatePasswordFailure(
    {
      passwordFailedCount: 1,
      passwordFailedWindowStartedAt: now,
      passwordLockedUntil: null,
      lastPasswordFailedAt: now
    },
    config,
    new Date(now.getTime() + 30_000)
  );

  assert.equal(result.state.passwordFailedCount, 2);
  assert.equal(result.lockoutTriggered, true);
  assert.equal(result.state.passwordLockedUntil?.toISOString(), new Date(now.getTime() + 630_000).toISOString());
});

test("password lockout policy restarts the window after it expires", () => {
  const now = new Date("2026-06-17T00:00:00.000Z");
  const config = normalizePasswordLockoutConfig({
    enabled: true,
    failureLimit: 3,
    windowMs: 60_000,
    durationMs: 600_000,
    resetOnSuccess: true
  });

  const result = evaluatePasswordFailure(
    {
      passwordFailedCount: 2,
      passwordFailedWindowStartedAt: now,
      passwordLockedUntil: null,
      lastPasswordFailedAt: now
    },
    config,
    new Date(now.getTime() + 61_000)
  );

  assert.equal(result.state.passwordFailedCount, 1);
  assert.equal(result.lockoutTriggered, false);
  assert.equal(result.state.passwordFailedWindowStartedAt?.toISOString(), new Date(now.getTime() + 61_000).toISOString());
});

test("password lockout policy detects active and expired locks", () => {
  const now = new Date("2026-06-17T00:00:00.000Z");
  const active = {
    passwordFailedCount: 5,
    passwordFailedWindowStartedAt: now,
    passwordLockedUntil: new Date(now.getTime() + 60_000),
    lastPasswordFailedAt: now
  };

  assert.equal(isPasswordLocked(active, now), true);
  assert.equal(isPasswordLocked(active, new Date(now.getTime() + 60_001)), false);

  const reset = resetExpiredPasswordLock(active, new Date(now.getTime() + 60_001));
  assert.equal(reset.passwordFailedCount, 0);
  assert.equal(reset.passwordFailedWindowStartedAt, null);
  assert.equal(reset.passwordLockedUntil, null);
  assert.equal(reset.lastPasswordFailedAt, null);
});

test("password lockout policy can be disabled by configuration", () => {
  const now = new Date("2026-06-17T00:00:00.000Z");
  const config = normalizePasswordLockoutConfig({
    enabled: false,
    failureLimit: 2,
    windowMs: 60_000,
    durationMs: 60_000,
    resetOnSuccess: true
  });

  const result = evaluatePasswordFailure(
    {
      passwordFailedCount: 1,
      passwordFailedWindowStartedAt: now,
      passwordLockedUntil: null,
      lastPasswordFailedAt: now
    },
    config,
    new Date(now.getTime() + 1_000)
  );

  assert.equal(result.lockoutTriggered, false);
  assert.equal(result.state.passwordFailedCount, 1);
});

test("password lockout policy clears failure state on successful login", () => {
  assert.deepEqual(clearPasswordLockoutState(), {
    passwordFailedCount: 0,
    passwordFailedWindowStartedAt: null,
    passwordLockedUntil: null,
    lastPasswordFailedAt: null
  });
});
