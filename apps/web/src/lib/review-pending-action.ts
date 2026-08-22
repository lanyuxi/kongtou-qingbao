export interface PendingActionGate {
  begin(): boolean;
  finish(): void;
}

export function createPendingActionGate(): PendingActionGate {
  let pending = false;
  return {
    begin() {
      if (pending) return false;
      pending = true;
      return true;
    },
    finish() {
      pending = false;
    },
  };
}
