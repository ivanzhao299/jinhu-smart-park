import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function reserveRunId({ reservationPath, runId, artifact, manifest, reservedAt }) {
  const value = { schema_version: "property-remediation-b2a-c3-runid-reservation-v1",
    run_id: runId, artifact, manifest, reserved_at: reservedAt };
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(reservationPath, bytes, { flag: "wx", mode: 0o600 });
  return { path: reservationPath, raw_sha256: digest(bytes), bytes: bytes.length,
    immutable_and_preserved: true };
}

export function outcomeAuthority({ reservation, runId, attemptId }) {
  return reservation
    ? { run_id: runId, run_id_reservation: reservation }
    : { attempt_id: attemptId, attempted_run_id: runId };
}

export function publishOutcome({ artifactPath, manifestPath, artifactLabel, outcome }) {
  const bytes = `${JSON.stringify(outcome, null, 2)}\n`;
  const authority = outcome.run_id
    ? `run_id\t${outcome.run_id}\n`
    : `attempt_id\t${outcome.attempt_id}\nattempted_run_id\t${outcome.attempted_run_id}\n`;
  const manifestBytes = `property-remediation-b2a-c3-runtime-candidate-v1\n${authority}`
    + `status\t${outcome.status}\ncandidate_admissible\t${outcome.candidate_admissible}\n`
    + `publication_contract\tartifact-and-manifest-both-required\n`
    + `artifact\t${artifactLabel}\t${bytes.length}\t${digest(bytes)}\n`
    + `input_freeze\t${outcome.input_freeze_before?.raw_sha256 ?? "unavailable"}\n`
    + `reservation\t${outcome.run_id_reservation?.path ?? "unavailable"}\t${outcome.run_id_reservation?.raw_sha256 ?? "unavailable"}\n`
    + (outcome.specs ?? []).map((spec) => `pg_spec\t${spec.path}\t${spec.raw_sha256}\n`).join("");
  writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  writeFileSync(artifactPath, bytes, { flag: "wx", mode: 0o600 });
  return { raw_sha256: digest(bytes), manifest_sha256: digest(manifestBytes),
    artifact_bytes: bytes.length, manifest_bytes: manifestBytes.length };
}

export function cleanupExactLifecycle(input) {
  const { creationAttempted, containerName, containerId: initialContainerId,
    volumeName: initialVolumeName, inspectContainer, inspectVolume, validateContainer,
    removeContainer, removeVolume } = input;
  if (!creationAttempted) return { status: "passed", attempted: false,
    container_absent: true, anonymous_volume_absent: true, errors: [], exact_targets: [] };
  const errors = [];
  let containerId = initialContainerId ?? null;
  let volumeName = initialVolumeName ?? null;
  try {
    const observed = inspectContainer(containerName);
    if (observed) {
      const exact = validateContainer(observed);
      if (containerId && exact.containerId !== containerId) throw new Error("container-id-drift");
      if (volumeName && exact.volumeName !== volumeName) throw new Error("volume-id-drift");
      containerId = exact.containerId;
      volumeName = exact.volumeName;
      removeContainer(containerId);
    } else if (!containerId || !volumeName) {
      errors.push("created-container-not-visible-and-anonymous-volume-identity-unproven");
    }
  } catch (error) {
    errors.push(`exact-container-cleanup-refused:${error.message}`);
  }
  let containerAbsent = false;
  try { containerAbsent = inspectContainer(containerName) === null; }
  catch (error) { errors.push(`container-absence-unproven:${error.message}`); }
  let volumeAbsent = false;
  if (volumeName && containerAbsent) {
    try {
      if (inspectVolume(volumeName)) removeVolume(volumeName);
      volumeAbsent = inspectVolume(volumeName) === null;
    } catch (error) { errors.push(`volume-absence-unproven:${error.message}`); }
  } else if (!volumeName) {
    errors.push("anonymous-volume-identity-unproven");
  }
  return { status: errors.length === 0 && containerAbsent && volumeAbsent ? "passed" : "failed",
    attempted: true, container_absent: containerAbsent,
    anonymous_volume_absent: volumeAbsent, errors, exact_targets: [
      { type: "container", id: containerId, name: containerName, absent: containerAbsent },
      { type: "anonymous-volume", id: volumeName, name: volumeName, absent: volumeAbsent }
    ] };
}

export function readOutcome(path) { return JSON.parse(readFileSync(path, "utf8")); }
