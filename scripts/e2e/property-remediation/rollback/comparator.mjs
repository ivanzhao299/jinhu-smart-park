import {
  canonicalSha256,
  exactKeys,
  validateDurableSnapshot,
  validateTimestamp
} from "./lib.mjs";

export function compareDurableSnapshots(before, after, profile) {
  validateDurableSnapshot(before, profile);
  validateDurableSnapshot(after, profile);
  const beforeByTable = new Map(before.tables.map((entry) => [entry.table, entry]));
  const differences = [];
  for (const entry of after.tables) {
    const prior = beforeByTable.get(entry.table);
    if (!prior || prior.count !== entry.count || prior.contentSha256 !== entry.contentSha256) {
      differences.push(entry.table);
    }
  }
  return {
    rpoCommittedRows: differences.length === 0 ? 0 : differences.reduce((sum, table) => {
      const beforeCount = beforeByTable.get(table)?.count ?? 0;
      const afterCount = after.tables.find((entry) => entry.table === table)?.count ?? 0;
      return sum + Math.abs(afterCount - beforeCount) + (beforeCount === afterCount ? 1 : 0);
    }, 0),
    identical: differences.length === 0,
    changedTables: differences,
    beforeSha256: canonicalSha256(before.tables),
    afterSha256: canonicalSha256(after.tables)
  };
}

export function validateRtoRpo(result, before, after, profile) {
  exactKeys(result, [
    "startedAt",
    "finishedAt",
    "monotonicStartedNanoseconds",
    "monotonicFinishedNanoseconds",
    "rtoMilliseconds",
    "rpoCommittedRows"
  ], "RTO/RPO result");
  const startedAt = validateTimestamp(result.startedAt, "rollback start timestamp");
  const finishedAt = validateTimestamp(result.finishedAt, "rollback finish timestamp");
  if (finishedAt < startedAt) throw new Error("rollback wall clock is not monotonic");
  let monotonicStarted;
  let monotonicFinished;
  try {
    monotonicStarted = BigInt(result.monotonicStartedNanoseconds);
    monotonicFinished = BigInt(result.monotonicFinishedNanoseconds);
  } catch {
    throw new Error("rollback monotonic timestamps must be integer strings");
  }
  if (monotonicStarted < 0n || monotonicFinished < monotonicStarted) {
    throw new Error("rollback monotonic timestamps are invalid");
  }
  const measuredMilliseconds = Number(monotonicFinished - monotonicStarted) / 1_000_000;
  if (!Number.isFinite(measuredMilliseconds) || measuredMilliseconds < 0) {
    throw new Error("rollback monotonic duration is invalid");
  }
  if (Math.abs(result.rtoMilliseconds - measuredMilliseconds) > 0.001) {
    throw new Error("RTO does not match monotonic timestamps");
  }
  if (result.rtoMilliseconds > profile.rtoTargetMilliseconds) {
    throw new Error("rollback exceeds the 30-minute RTO target");
  }
  const durable = compareDurableSnapshots(before, after, profile);
  if (result.rpoCommittedRows !== durable.rpoCommittedRows || !durable.identical) {
    throw new Error("rollback violates durable finance/approval RPO=0");
  }
  if (result.rpoCommittedRows !== profile.rpoTargetCommittedRows) {
    throw new Error("rollback RPO differs from the frozen target");
  }
  return { measuredMilliseconds, durable };
}
