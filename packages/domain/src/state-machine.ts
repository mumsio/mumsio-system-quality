import type { RunStatus } from "@mumsio/quality-contracts";

export const TERMINAL_RUN_STATUSES = ["passed", "warning", "failed", "cancelled"] as const satisfies readonly RunStatus[];

const ALLOWED_TRANSITIONS = {
  queued: ["running", "failed", "cancelled"],
  running: ["passed", "warning", "failed", "cancelled"],
  passed: [],
  warning: [],
  failed: [],
  cancelled: [],
} as const satisfies Record<RunStatus, readonly RunStatus[]>;

export class InvalidRunTransitionError extends Error {
  readonly from: RunStatus;
  readonly to: RunStatus;

  constructor(from: RunStatus, to: RunStatus) {
    super(`Run cannot transition from ${from} to ${to}`);
    this.name = "InvalidRunTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.some((terminal) => terminal === status);
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED_TRANSITIONS[from].some((candidate) => candidate === to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new InvalidRunTransitionError(from, to);
  }
}
