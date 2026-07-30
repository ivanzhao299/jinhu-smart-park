import { spawn, spawnSync } from "node:child_process";

export const OFFICIAL_POSTGRES_IMAGE = "postgres:16-alpine";
export const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{11,63}$/;

export function validateRunId(runId) {
  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      "run id must be a unique 12-64 character lowercase value containing only letters, digits, underscore or hyphen"
    );
  }
  return runId;
}

export function buildEphemeralPostgresRunArgs({
  containerName,
  databaseName,
  fixtureLabel,
  runId,
  postgresUser,
  postgresPassword
}) {
  validateRunId(runId);
  return [
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--label",
    `com.jinhu.fixture=${fixtureLabel}`,
    "--label",
    `com.jinhu.fixture.run-id=${runId}`,
    "--env",
    `POSTGRES_USER=${postgresUser}`,
    "--env",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "--env",
    `POSTGRES_DB=${databaseName}`,
    "--publish",
    "127.0.0.1::5432",
    OFFICIAL_POSTGRES_IMAGE
  ];
}

export function runDocker(args, { cwd, input, allowFailure = false } = {}) {
  const result = spawnSync("docker", args, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 40 * 1024 * 1024
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("docker is not installed");
  }
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `docker ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result;
}

export class DockerCommandInterruptedError extends Error {
  constructor(command) {
    super(`docker ${command} interrupted`);
    this.name = "DockerCommandInterruptedError";
  }
}

export function runDockerAsync(
  args,
  { cwd, input, allowFailure = false, signal } = {}
) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let interrupted = false;
    let forceKillTimer = null;
    const child = spawn("docker", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    const stopChild = () => {
      interrupted = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      forceKillTimer.unref();
    };
    if (signal?.aborted) stopChild();
    else signal?.addEventListener("abort", stopChild, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      signal?.removeEventListener("abort", stopChild);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(
        error.code === "ENOENT" ? new Error("docker is not installed") : error
      );
    });
    child.on("close", (status) => {
      signal?.removeEventListener("abort", stopChild);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (interrupted) {
        reject(new DockerCommandInterruptedError(args[0]));
        return;
      }
      const result = { status, stdout, stderr };
      if (!allowFailure && status !== 0) {
        reject(
          new Error(
            `docker ${args[0]} failed: ${(stderr || stdout).trim()}`
          )
        );
        return;
      }
      resolve(result);
    });
    if (input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

export function inspectContainer(containerName, { cwd } = {}) {
  const result = runDocker(
    ["inspect", "--type", "container", containerName],
    { cwd, allowFailure: true }
  );
  if (result.status !== 0) {
    return null;
  }
  try {
    const [inspected] = JSON.parse(result.stdout);
    return inspected ?? null;
  } catch {
    throw new Error("docker container inspect returned invalid JSON");
  }
}

export async function inspectContainerAsync(
  containerName,
  { cwd, signal } = {}
) {
  const result = await runDockerAsync(
    ["inspect", "--type", "container", containerName],
    { cwd, signal, allowFailure: true }
  );
  if (result.status !== 0) {
    if (/No such (object|container)/i.test(result.stderr)) return null;
    throw new Error(
      `docker container inspect failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  try {
    const [inspected] = JSON.parse(result.stdout);
    return inspected ?? null;
  } catch {
    throw new Error("docker container inspect returned invalid JSON");
  }
}

export function assertExactEphemeralPostgresContainer(
  inspected,
  {
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    expectedImage,
    requireLoopbackPort = false,
    requireRunning = true
  }
) {
  validateRunId(runId);
  if (
    !inspected ||
    inspected.Name !== `/${containerName}` ||
    (requireRunning && inspected.State?.Running !== true) ||
    inspected.HostConfig?.AutoRemove !== true
  ) {
    throw new Error(
      "fixture target must be the exact running --rm container for this run id"
    );
  }

  const image = inspected.Config?.Image ?? "";
  if (
    expectedImage ? image !== expectedImage : !/^postgres(?::|@)/.test(image)
  ) {
    throw new Error("fixture target must use the expected official PostgreSQL image");
  }

  const labels = inspected.Config?.Labels ?? {};
  const jinhuLabels = Object.keys(labels)
    .filter((key) => key.startsWith("com.jinhu.fixture"))
    .sort();
  if (
    jinhuLabels.length !== 2 ||
    jinhuLabels[0] !== "com.jinhu.fixture" ||
    jinhuLabels[1] !== "com.jinhu.fixture.run-id" ||
    labels["com.jinhu.fixture"] !== fixtureLabel ||
    labels["com.jinhu.fixture.run-id"] !== runId
  ) {
    throw new Error(
      "fixture target must carry exactly the fixture and exact run-id labels"
    );
  }

  const containerDatabase = (inspected.Config?.Env ?? [])
    .find((entry) => entry.startsWith("POSTGRES_DB="))
    ?.slice("POSTGRES_DB=".length);
  if (containerDatabase !== databaseName) {
    throw new Error("fixture target POSTGRES_DB does not match the exact database");
  }

  const mounts = inspected.Mounts ?? [];
  if (
    mounts.length !== 1 ||
    mounts[0].Type !== "volume" ||
    mounts[0].Destination !== "/var/lib/postgresql/data" ||
    !/^[a-f0-9]{64}$/.test(mounts[0].Name ?? "")
  ) {
    throw new Error(
      "fixture target must use one Docker-created anonymous PostgreSQL data volume"
    );
  }

  let hostPort = null;
  if (requireLoopbackPort) {
    const bindings = inspected.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
    if (
      bindings.length !== 1 ||
      bindings[0].HostIp !== "127.0.0.1" ||
      !/^\d+$/.test(bindings[0].HostPort ?? "")
    ) {
      throw new Error(
        "fixture target must publish PostgreSQL only on a random loopback port"
      );
    }
    hostPort = bindings[0].HostPort;
  }

  return {
    containerId: inspected.Id,
    hostPort,
    volumeName: mounts[0].Name
  };
}

export function resolveCreatedContainerId(
  dockerRunStdout,
  inspected,
  expected
) {
  const exact = assertExactEphemeralPostgresContainer(inspected, {
    ...expected,
    requireRunning: false
  });
  const stdoutId = dockerRunStdout.trim();
  if (/^[a-f0-9]{64}$/.test(stdoutId)) {
    if (stdoutId !== exact.containerId) {
      throw new Error(
        "docker run returned a container id that does not match the exact inspected target"
      );
    }
    return stdoutId;
  }
  if (!/^[a-f0-9]{64}$/.test(exact.containerId ?? "")) {
    throw new Error(
      "docker run stdout was invalid and exact target inspection did not provide a container id"
    );
  }
  return exact.containerId;
}

export function assertNoDatabaseUrlOverrides(environment) {
  const forbidden = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "PROPERTY_RBAC_FIXTURE_DATABASE_URL",
    "PROPERTY_EPHEMERAL_DB_DATABASE_URL"
  ].filter((name) => environment[name]);
  if (forbidden.length > 0) {
    throw new Error(
      `database URL overrides are forbidden for the ephemeral bootstrap: ${forbidden.join(", ")}`
    );
  }
}
