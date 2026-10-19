import { describe, it, expect } from 'vitest';
import { requestHeaders, responseHeaders, responseStatus, scannerLabel } from './service';

describe('responseStatus', () => {
  it('is the status code when there was a response', () => {
    expect(responseStatus({ status_code: 401, failure_reason: null })).toBe('401');
  });

  it("is the browser's error text when there was none", () => {
    expect(responseStatus({ status_code: 0, failure_reason: 'net::ERR_NAME_NOT_RESOLVED' })).toBe(
      'net::ERR_NAME_NOT_RESOLVED'
    );
  });

  it('says no response was recorded when the error text is missing', () => {
    expect(responseStatus({ status_code: 0, failure_reason: null })).toBe('no response recorded');
  });
});

describe('scannerLabel', () => {
  it('names the scanners as the reviewer sees them', () => {
    expect(scannerLabel('interceptor')).toBe('Browser');
    expect(scannerLabel('tracer')).toBe('Probe');
  });
});

describe('requestHeaders', () => {
  it('stars out the credential the scanner never stored', () => {
    expect(requestHeaders({ sent_auth_scheme: 'Bearer' })).toBe('Authorization: Bearer *****');
  });

  it('is null when no Authorization header was sent', () => {
    expect(requestHeaders({ sent_auth_scheme: null })).toBeNull();
  });
});

describe('responseHeaders', () => {
  it('lists the challenge and the redirect target', () => {
    expect(
      responseHeaders({ auth_challenge: 'Negotiate', redirect_url: 'https://login.contoso.com/' })
    ).toBe('WWW-Authenticate: Negotiate\nLocation: https://login.contoso.com/');
  });

  it('is null when the response carried neither', () => {
    expect(responseHeaders({ auth_challenge: null, redirect_url: null })).toBeNull();
  });
});
