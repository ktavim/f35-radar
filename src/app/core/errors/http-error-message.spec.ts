import { describe, expect, it } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from './http-error-message';

const response = (error: unknown) => new HttpErrorResponse({ status: 409, error });

describe('httpErrorMessage', () => {
  it('reads the backend’s nested detail message', () => {
    expect(httpErrorMessage(response({ detail: { message: '1 service(s) to review remain' } }))).toBe(
      '1 service(s) to review remain'
    );
  });

  it('reads FastAPI’s string detail', () => {
    expect(httpErrorMessage(response({ detail: 'Not Found' }))).toBe('Not Found');
  });

  it('reads the first validation error', () => {
    expect(httpErrorMessage(response({ detail: [{ msg: 'field required', loc: ['body'] }] }))).toBe(
      'field required'
    );
  });

  it('reads the mocks’ flat message', () => {
    expect(httpErrorMessage(response({ message: 'this scan is submitted and locked' }))).toBe(
      'this scan is submitted and locked'
    );
  });

  it('gives undefined when the server gave no reason', () => {
    expect(httpErrorMessage(response(null))).toBeUndefined();
    expect(httpErrorMessage(response('<html>Bad Gateway</html>'))).toBeUndefined();
    expect(httpErrorMessage(new Error('boom'))).toBeUndefined();
  });
});
