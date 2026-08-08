import { execFile } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";

export const TIMEOUTS = Object.freeze({
  probe: 10_000,
  git: 60_000,
  command: 20 * 60_000,
  databaseConnect: 10_000,
  databaseQuery: 60_000,
  cleanup: 90_000
});

export function abortError(label) {
  const error = new Error(`${label} aborted`);
  error.name = "AbortError";
  return error;
}

export function withHardTimeout(operation, timeoutMilliseconds, label, parentSignal) {
  const controller = new globalThis.AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(parentSignal?.reason ?? abortError(label));
  if (parentSignal?.aborted) onAbort();
  else parentSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error(`${label} timed out after ${timeoutMilliseconds}ms`)); }, timeoutMilliseconds);
  timer.unref?.();
  return Promise.resolve().then(() => operation(controller.signal)).catch((error) => {
    if (timedOut) throw new Error(`${label} timed out after ${timeoutMilliseconds}ms`, { cause: error });
    if (parentSignal?.aborted) throw abortError(label);
    throw error;
  }).finally(() => {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  });
}

export function execFileBounded(executable, args, options = {}, policy = {}) {
  const timeout = policy.timeout ?? TIMEOUTS.command;
  const label = policy.label ?? executable;
  const { input, ...childOptions } = options;
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, {
      ...childOptions,
      timeout,
      killSignal: "SIGKILL",
      signal: policy.signal,
      maxBuffer: childOptions.maxBuffer ?? 64 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout ?? error.stdout ?? "";
        error.stderr = stderr ?? error.stderr ?? "";
        if (error.killed || error.signal === "SIGKILL") error.message = `${label} timed out or was killed`;
        reject(error);
      } else resolve({ stdout, stderr });
    });
    child.stdin.on("error", () => { /* child exit is reported by the exec callback */ });
    child.stdin.end(input);
  });
}
