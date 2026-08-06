import {
  closeSync,
  existsSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { dirname } from "node:path";
import { canonicalize, sha256 } from "./canonical.mjs";
import { decodeJsonText, validateSchema } from "./strict-decoder.mjs";

const TRANSITIONS = Object.freeze({
  planned: new Set(["creating", "cleanup_pending", "failed"]),
  creating: new Set(["created", "cleanup_pending", "failed"]),
  created: new Set(["cleanup_pending", "failed"]),
  cleanup_pending: new Set(["cleaned", "failed"]),
  failed: new Set(["cleanup_pending"]),
  cleaned: new Set()
});

function eventPayload(event) {
  const { event_hash: ignored, ...payload } = event;
  return payload;
}

export function computeEventHash(event) {
  return sha256(canonicalize(eventPayload(event)));
}

export function readJournal(path, schema, { repairTornTail = false } = {}) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let event;
    try {
      event = decodeJsonText(line, `${path}:${index + 1}`);
    } catch (error) {
      const isLast = index === lines.length - 1;
      const hasTerminalNewline = text.endsWith("\n");
      if (repairTornTail && isLast && !hasTerminalNewline) {
        const fd = openSync(path, "r+");
        try {
          // Only an incomplete final physical write may be removed. A complete
          // newline-terminated hash mismatch is corruption and remains fatal.
          ftruncateSync(fd, 0);
          // Restore the verified prefix exactly and durably.
          for (const verified of events) {
            writeSync(fd, `${JSON.stringify(verified)}\n`);
          }
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        return events;
      }
      throw error;
    }
    // A syntactically complete final record is never treated as a torn write.
    // Schema, sequence or hash drift must fail closed even without a newline.
    validateSchema(event, schema, `${path}:${index + 1}`);
    const previous = events.at(-1);
    if (event.seq !== index + 1) {
      throw new Error(`${path}:${index + 1}: non-contiguous sequence`);
    }
    if (event.previous_hash !== (previous?.event_hash ?? null)) {
      throw new Error(`${path}:${index + 1}: previous hash mismatch`);
    }
    if (event.event_hash !== computeEventHash(event)) {
      throw new Error(`${path}:${index + 1}: event hash mismatch`);
    }
    events.push(event);
  }
  return events;
}

export function reduceJournal(events) {
  const resources = new Map();
  for (const event of events) {
    const key = `${event.resource_type}:${event.resource_key}`;
    const previous = resources.get(key);
    if (previous) {
      if (!TRANSITIONS[previous.state].has(event.state)) {
        throw new Error(
          `invalid journal transition ${previous.state} -> ${event.state} for ${key}`
        );
      }
      if (event.attempt < previous.attempt) {
        throw new Error(`journal attempt regressed for ${key}`);
      }
    } else if (event.state !== "planned") {
      throw new Error(`first journal state must be planned for ${key}`);
    }
    resources.set(key, event);
  }
  return resources;
}

export class CleanupJournal {
  constructor({ path, runId, schema, clock = () => new Date().toISOString() }) {
    this.path = path;
    this.runId = runId;
    this.schema = schema;
    this.clock = clock;
    mkdirSync(dirname(path), { recursive: true });
    this.events = readJournal(path, schema, { repairTornTail: true });
    reduceJournal(this.events);
  }

  append({
    resourceType,
    resourceKey,
    state,
    tenantId = null,
    parkId = null,
    attempt = 1,
    error = null
  }) {
    const event = {
      schema_version: "property-remediation-cleanup-event-v1",
      run_id: this.runId,
      seq: this.events.length + 1,
      resource_type: resourceType,
      resource_key: resourceKey,
      tenant_id: tenantId,
      park_id: parkId,
      state,
      attempt,
      timestamp: this.clock(),
      error,
      previous_hash: this.events.at(-1)?.event_hash ?? null,
      event_hash: ""
    };
    event.event_hash = computeEventHash(event);
    validateSchema(event, this.schema, `${this.path}:${event.seq}`);
    reduceJournal([...this.events, event]);
    const fd = openSync(this.path, "a", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(event)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.events.push(event);
    return event;
  }

  pendingInReverseOrder() {
    return [...reduceJournal(this.events).values()]
      .filter((entry) => entry.state !== "cleaned")
      .sort((left, right) => right.seq - left.seq);
  }
}

export function acquireRunLock(
  path,
  content,
  { recoverStale = false } = {}
) {
  mkdirSync(dirname(path), { recursive: true });
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") {
      if (recoverStale) {
        const recorded = readFileSync(path, "utf8").trim();
        if (/^\d+$/.test(recorded) && !existsSync(`/proc/${recorded}`)) {
          unlinkSync(path);
          return acquireRunLock(path, content, { recoverStale: false });
        }
      }
      throw new Error(`another A-base process owns lock ${path}`);
    }
    throw error;
  }
  writeSync(fd, content);
  fsyncSync(fd);
  return () => {
    closeSync(fd);
    unlinkSync(path);
  };
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, "w", 0o600);
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  const directoryFd = openSync(dirname(path), "r");
  try {
    fsyncSync(directoryFd);
  } finally {
    closeSync(directoryFd);
  }
}
