import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const STAGES = new Set(["list", "count", "page", "items", "projection", "audit"]);
const LIMIT = 128;
export function sanitizeInsuranceLabTimings(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (let i = 0; i < Math.min(value.length, LIMIT); i++) {
    try {
      const { stage, status, elapsedMs } = value[i] ?? {};
      if (STAGES.has(stage) && ["pending", "success", "failed"].includes(status) &&
          Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 3600000) result.push({ stage, status, elapsedMs });
    } catch { /* Untrusted diagnostics never carry accessor errors into receipts. */ }
  }
  return result;
}

/** Isolated Nest instance only. Never inspect or retain arguments, results, SQL,
 * or errors. Async context excludes unrelated requests and background audits. */
export function installInsuranceLabTiming(service, now = () => performance.now()) {
  const context = new AsyncLocalStorage(), records = [], restore = [], builders = new WeakSet();
  function wrap(object, name, replacement) {
    const original = object?.[name];
    if (typeof original !== "function") throw new Error("HR_HTTP_LAB_TIMING_INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    object[name] = replacement(original);
    restore.push(() => descriptor ? Object.defineProperty(object, name, descriptor) : delete object[name]);
  }
  async function measure(stage, call) {
    if (!context.getStore() || records.length >= LIMIT) return call();
    const record = { stage, status: "pending", start: now() };
    records.push(record);
    try { const result = await call(); record.status = "success"; return result; }
    catch (error) { record.status = "failed"; throw error; }
    finally { record.end = now(); }
  }
  function builder(qb) {
    if (builders.has(qb)) return qb;
    builders.add(qb);
    for (const [method, stage] of [["getCount", "count"], ["getRawMany", "page"]]) {
      wrap(qb, method, original => function (...args) { return measure(stage, () => original.apply(this, args)); });
    }
    wrap(qb, "clone", original => function (...args) { return builder(original.apply(this, args)); });
    return qb;
  }
  try {
    wrap(service, "listInsurancePeriods", original => function (...args) {
      return context.run(true, () => measure("list", () => original.apply(this, args)));
    });
    wrap(service.insurancePeriods, "createQueryBuilder", original => function (...args) {
      const qb = original.apply(this, args);
      return context.getStore() ? builder(qb) : qb;
    });
    for (const [object, method, stage] of [
      [service.insuranceItems, "find", "items"],
      [service, "projectInsurancePeriod", "projection"],
      [service.auditService, "recordOperationRequired", "audit"],
    ]) wrap(object, method, original => function (...args) { return measure(stage, () => original.apply(this, args)); });
  } catch (error) { for (const undo of restore.reverse()) undo(); throw error; }
  return {
    snapshot: () => sanitizeInsuranceLabTimings(records.map(r => ({ stage: r.stage, status: r.status,
      elapsedMs: Math.min(3600000, Math.max(0, Math.round((r.end ?? now()) - r.start))) }))),
    restore: () => { for (const undo of restore.splice(0).reverse()) undo(); },
  };
}
