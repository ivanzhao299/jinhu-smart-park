import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const percentile = (sorted, ratio) => {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
};

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function requestOnce(config, latencies, failures) {
  const started = performance.now();
  try {
    const response = await fetch(`${config.baseUrl}${config.path}`, {
      headers: {
        authorization: `Bearer ${config.token}`,
        "x-request-id": `track-c-perf-${crypto.randomUUID()}`
      },
      signal: AbortSignal.timeout(config.requestTimeoutMilliseconds)
    });
    await response.arrayBuffer();
    latencies.push(performance.now() - started);
    if (!response.ok) failures.push({ kind: "http", status: response.status });
  } catch (error) {
    latencies.push(performance.now() - started);
    failures.push({ kind: "transport", name: error?.name ?? "Error" });
  }
}

async function runPhase(config, durationSeconds, minimumRequests) {
  const latencies = [];
  const failures = [];
  const started = performance.now();
  let issued = 0;
  let active = 0;

  await new Promise((resolve) => {
    const launch = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= durationSeconds && issued >= minimumRequests) {
        if (active === 0) resolve();
        return;
      }
      while (active < config.concurrency) {
        issued += 1;
        active += 1;
        requestOnce(config, latencies, failures).finally(() => {
          active -= 1;
          launch();
        });
      }
    };
    launch();
  });

  const elapsedSeconds = (performance.now() - started) / 1000;
  latencies.sort((left, right) => left - right);
  return {
    elapsedSeconds,
    requests: latencies.length,
    failures,
    metrics: {
      p50Milliseconds: percentile(latencies, 0.5),
      p90Milliseconds: percentile(latencies, 0.9),
      p95Milliseconds: percentile(latencies, 0.95),
      p99Milliseconds: percentile(latencies, 0.99),
      throughputPerSecond: latencies.length / elapsedSeconds,
      errorRate: failures.length / Math.max(latencies.length, 1)
    }
  };
}

export async function executeLoad(config) {
  const warmup = await runPhase(config, config.warmupSeconds, 0);
  const formal = await runPhase(config, config.formalSeconds, config.minimumRequests);
  return { warmup, formal };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const config = await readInput();
    const result = await executeLoad(config);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
