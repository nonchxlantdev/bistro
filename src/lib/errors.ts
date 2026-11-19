export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function isUniqueConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
