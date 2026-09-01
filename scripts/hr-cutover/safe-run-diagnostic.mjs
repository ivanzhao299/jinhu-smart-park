export function safeDiagnosticDetail(error, fallbackCode = "") {
  const code = /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : fallbackCode;
  const prefix = code ? `${code}: ` : "";
  const detail = typeof error?.message === "string" && prefix && error.message.startsWith(prefix) ? error.message.slice(prefix.length) : "";
  return /^[A-Za-z0-9:._=/-]{1,256}$/u.test(detail) ? detail : null;
}
