import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const stateDir = process.env.PROPERTY_EPHEMERAL_DB_FAKE_DOCKER_STATE_DIR;
if (!stateDir) {
  process.stderr.write("fake Docker state directory is required\n");
  process.exit(2);
}
const statePath = resolve(stateDir, "container.json");

function readState() {
  return existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : null;
}

function removeState() {
  rmSync(statePath, { force: true });
}

function valuesAfter(flag) {
  const values = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === flag) values.push(args[index + 1]);
  }
  return values;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (args[0] === "run") {
  const name = valuesAfter("--name")[0];
  const labels = Object.fromEntries(
    valuesAfter("--label").map((entry) => entry.split(/=(.*)/s).slice(0, 2))
  );
  const environment = valuesAfter("--env");
  const database = environment
    .find((entry) => entry.startsWith("POSTGRES_DB="))
    ?.slice("POSTGRES_DB=".length);
  const state = {
    id: "d".repeat(64),
    name,
    labels,
    environment,
    database,
    volume: "e".repeat(64),
    running: true
  };
  writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write(`${state.id}\n`);
  process.exit(0);
}

const state = readState();
if (args[0] === "inspect" && args[1] === "--type") {
  const target = args.at(-1);
  if (!state || ![state.id, state.name].includes(target)) {
    fail(`Error: No such object: ${target}`);
  }
  process.stdout.write(
    `${JSON.stringify([
      {
        Id: state.id,
        Name: `/${state.name}`,
        State: { Running: state.running },
        HostConfig: { AutoRemove: true },
        Config: {
          Image: "postgres:16-alpine",
          Env: state.environment,
          Labels: state.labels
        },
        Mounts: [
          {
            Type: "volume",
            Name: state.volume,
            Destination: "/var/lib/postgresql/data"
          }
        ],
        NetworkSettings: {
          Ports: {
            "5432/tcp": [
              { HostIp: "127.0.0.1", HostPort: "49152" }
            ]
          }
        }
      }
    ])}\n`
  );
  process.exit(0);
}

if (args[0] === "logs") {
  if (!state) fail("Error: No such container");
  process.stderr.write(
    "PostgreSQL init process complete; ready for start up.\n"
  );
  process.exit(0);
}

if (args[0] === "exec") {
  if (!state) fail("Error: No such container");
  if (args.includes("pg_isready")) {
    process.stdout.write("accepting connections\n");
    process.exit(0);
  }
  if (args.includes("psql")) {
    const sql = readFileSync(0, "utf8");
    if (sql.trim() === "SELECT 1;") {
      process.stdout.write("1\n");
      process.exit(0);
    }
    const exitCode = await new Promise((resolveExit) => {
      const timer = setTimeout(() => resolveExit(0), 60_000);
      process.once("SIGTERM", () => {
        clearTimeout(timer);
        resolveExit(143);
      });
    });
    process.exit(exitCode);
  }
}

if (args[0] === "stop" || args[0] === "rm") {
  if (!state) fail("Error: No such container");
  removeState();
  process.stdout.write(`${state.id}\n`);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "inspect") {
  const volume = args.at(-1);
  if (!state || state.volume !== volume) {
    fail(`Error: No such volume: ${volume}`);
  }
  process.stdout.write(`${JSON.stringify([{ Name: volume }])}\n`);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "rm") {
  process.stdout.write(`${args.at(-1)}\n`);
  process.exit(0);
}

fail(`unsupported fake Docker command: ${args.join(" ")}`);
