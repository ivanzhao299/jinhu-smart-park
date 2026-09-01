const fail = (code, runId) => { const error = new Error(`${code}: ${runId}`); error.code = code; throw error; };

function terminalLine(output) {
  return String(output ?? "").trim().split(/\r?\n/u).map(line => line.trim()).filter(Boolean).at(-1) ?? "";
}

export function assertIsolatedLoadReceipt(output, { runId, code }) {
  const match = /^(succeeded)\|(\d+)\|(\d+)\|(\d+)$/u.exec(terminalLine(output));
  if (!match) fail(code, runId);
  const [, status, sourceText, loadedText, quarantinedText] = match;
  const source = Number(sourceText), loaded = Number(loadedText), quarantined = Number(quarantinedText);
  if (!Number.isSafeInteger(source) || !Number.isSafeInteger(loaded) || !Number.isSafeInteger(quarantined)
    || source < 0 || loaded < 0 || quarantined < 0 || source !== loaded + quarantined) fail(code, runId);
  return { runId, status, source, loaded, quarantined };
}

export function assertIsolatedRollbackReceipt(output, { runId, code, requireZeroActiveMaps = false }) {
  const match = /^(rolled_back)(?:\|(\d+))?$/u.exec(terminalLine(output));
  if (!match || (requireZeroActiveMaps && Number(match[2]) !== 0)) fail(code, runId);
  return { runId, status: match[1], ...(match[2] === undefined ? {} : { activeMaps: Number(match[2]) }) };
}
