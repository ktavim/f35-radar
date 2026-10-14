import { describe, it, expect } from 'vitest';
import { firstSeenOn } from './service';
import type { ServiceUrl } from '@core/models';

const page = 'https://app.intranet.contoso.com/dashboard';
const evidence = { page_url: page } as ServiceUrl;

describe('firstSeenOn', () => {
  it('prefers the winning request\'s page', () => {
    const service = { evidence, sources: [{ kind: 'page' as const, value: 'https://other/page' }] };
    expect(firstSeenOn(service)).toBe(page);
  });

  it('falls back to a page source when there is no evidence', () => {
    const service = {
      evidence: null,
      sources: [
        { kind: 'js' as const, value: 'https://app/static/main.js' },
        { kind: 'page' as const, value: page }
      ]
    };
    expect(firstSeenOn(service)).toBe(page);
  });

  it('is null for a service no page saw, rather than another kind of source', () => {
    const service = { evidence: null, sources: [{ kind: 'js' as const, value: 'https://app/static/main.js' }] };
    expect(firstSeenOn(service)).toBeNull();
  });

  it('is null for a service with no evidence and no sources', () => {
    expect(firstSeenOn({ evidence: null, sources: [] })).toBeNull();
  });
});
