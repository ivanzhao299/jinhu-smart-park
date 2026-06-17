export interface PasswordLockoutConfigInput {
  enabled?: boolean;
  failureLimit?: number;
  windowMs?: number;
  durationMs?: number;
  resetOnSuccess?: boolean;
}

export interface PasswordLockoutConfig {
  enabled: boolean;
  failureLimit: number;
  windowMs: number;
  durationMs: number;
  resetOnSuccess: boolean;
}

export interface PasswordLockoutState {
  passwordFailedCount: number;
  passwordFailedWindowStartedAt: Date | null;
  passwordLockedUntil: Date | null;
  lastPasswordFailedAt: Date | null;
}

export interface PasswordFailureEvaluation {
  state: PasswordLockoutState;
  lockoutTriggered: boolean;
}

const DEFAULT_PASSWORD_LOCKOUT_CONFIG: PasswordLockoutConfig = {
  enabled: true,
  failureLimit: 5,
  windowMs: 15 * 60 * 1000,
  durationMs: 15 * 60 * 1000,
  resetOnSuccess: true
};

export function normalizePasswordLockoutConfig(input: PasswordLockoutConfigInput): PasswordLockoutConfig {
  return {
    enabled: input.enabled ?? DEFAULT_PASSWORD_LOCKOUT_CONFIG.enabled,
    failureLimit: positiveOrDefault(input.failureLimit, DEFAULT_PASSWORD_LOCKOUT_CONFIG.failureLimit),
    windowMs: positiveOrDefault(input.windowMs, DEFAULT_PASSWORD_LOCKOUT_CONFIG.windowMs),
    durationMs: positiveOrDefault(input.durationMs, DEFAULT_PASSWORD_LOCKOUT_CONFIG.durationMs),
    resetOnSuccess: input.resetOnSuccess ?? DEFAULT_PASSWORD_LOCKOUT_CONFIG.resetOnSuccess
  };
}

export function evaluatePasswordFailure(
  state: PasswordLockoutState,
  config: PasswordLockoutConfig,
  now: Date
): PasswordFailureEvaluation {
  if (!config.enabled) {
    return { state, lockoutTriggered: false };
  }

  const windowStartedAt = state.passwordFailedWindowStartedAt;
  const inWindow = Boolean(windowStartedAt && now.getTime() - windowStartedAt.getTime() <= config.windowMs);
  const passwordFailedCount = inWindow ? state.passwordFailedCount + 1 : 1;
  const passwordFailedWindowStartedAt = inWindow ? windowStartedAt : now;
  const lockoutTriggered = passwordFailedCount >= config.failureLimit;

  return {
    state: {
      passwordFailedCount,
      passwordFailedWindowStartedAt,
      passwordLockedUntil: lockoutTriggered ? new Date(now.getTime() + config.durationMs) : null,
      lastPasswordFailedAt: now
    },
    lockoutTriggered
  };
}

export function isPasswordLocked(state: PasswordLockoutState, now: Date): boolean {
  return Boolean(state.passwordLockedUntil && state.passwordLockedUntil.getTime() > now.getTime());
}

export function resetExpiredPasswordLock(state: PasswordLockoutState, now: Date): PasswordLockoutState {
  if (!state.passwordLockedUntil || state.passwordLockedUntil.getTime() > now.getTime()) {
    return state;
  }
  return clearPasswordLockoutState();
}

export function clearPasswordLockoutState(): PasswordLockoutState {
  return {
    passwordFailedCount: 0,
    passwordFailedWindowStartedAt: null,
    passwordLockedUntil: null,
    lastPasswordFailedAt: null
  };
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
