export type SafetyInspectTaskStartDisposition = "start" | "resume" | "reject";

export function resolveSafetyInspectTaskStartDisposition(status: string): SafetyInspectTaskStartDisposition {
  if (status === "10" || status === "40") return "start";
  if (status === "20") return "resume";
  return "reject";
}
