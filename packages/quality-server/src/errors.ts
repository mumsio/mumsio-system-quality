export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorEnvelope(error: unknown): { status: number; body: { error: { code: string; message: string; details?: Record<string, unknown> } } } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } },
    };
  }
  return { status: 500, body: { error: { code: "internal_error", message: "The Quality Center could not complete the request." } } };
}
