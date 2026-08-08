export interface ConsequenceTarget {
  id: string;
  label: string;
}

export type ConsequenceReasonPolicy =
  | { kind: "none" }
  | { kind: "optional"; label?: string; maxLength?: number }
  | { kind: "required"; label?: string; minLength?: number; maxLength?: number };
