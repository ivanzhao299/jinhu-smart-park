export interface DialogDraftState {
  targetId: string;
  reason: string;
}

export type DialogDraftEvent =
  | { type: "synchronize"; open: boolean; targetId: string }
  | { type: "change-reason"; targetId: string; reason: string }
  | { type: "confirmed"; targetId: string };

export function reduceDialogDraft(
  state: DialogDraftState,
  event: DialogDraftEvent
): DialogDraftState {
  switch (event.type) {
    case "synchronize":
      if (!event.open || event.targetId !== state.targetId) {
        return { targetId: event.targetId, reason: "" };
      }
      return state;
    case "change-reason":
      return { targetId: event.targetId, reason: event.reason };
    case "confirmed":
      return event.targetId === state.targetId
        ? { targetId: state.targetId, reason: "" }
        : state;
    default:
      return assertNever(event);
  }
}

export function visibleDialogReason(
  state: DialogDraftState,
  open: boolean,
  targetId: string
): string {
  return open && state.targetId === targetId ? state.reason : "";
}

export interface SingleFlightGate {
  isActive(): boolean;
  tryEnter(): boolean;
  leave(): void;
}

export function createSingleFlightGate(): SingleFlightGate {
  let active = false;
  return {
    isActive: () => active,
    tryEnter: () => {
      if (active) {
        return false;
      }
      active = true;
      return true;
    },
    leave: () => {
      active = false;
    }
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled dialog draft event: ${JSON.stringify(value)}`);
}
