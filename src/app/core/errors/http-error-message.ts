import { HttpErrorResponse } from '@angular/common/http';

/**
 * The server's reason for an error response, or undefined if it gave none.
 * The backend raises `{detail: {message}}`; FastAPI's own errors carry a
 * string `detail` (an unknown route) or a list of them (422 validation, read
 * by its first `msg`). The dev mocks send a flat `{message}`.
 */
export function httpErrorMessage(err: unknown): string | undefined {
  if (!(err instanceof HttpErrorResponse)) return undefined;
  const body = err.error;
  const detail = body?.detail;
  if (typeof detail?.message === 'string') return detail.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg;
  if (typeof body?.message === 'string') return body.message;
  return undefined;
}
