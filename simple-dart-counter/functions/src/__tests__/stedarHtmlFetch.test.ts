import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStedarHtml, toHttpUrl, toHttpsUrl } from '../stedarHtmlFetch';

const SOURCE = 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=1';
const HTML = '<html><body><table id="rankingsTable"><tr><td>1</td></tr></table></body></html>';

function htmlResponse(status: number, body: string, location?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'location') return location ?? null;
        return null;
      },
    },
    text: async () => body,
  };
}

describe('stedarHtmlFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('přepíná schéma URL', () => {
    expect(toHttpUrl(SOURCE)).toMatch(/^http:\/\/www\.stedar\.org\//);
    expect(toHttpsUrl('http://www.stedar.org/alms/x')).toMatch(/^https:\/\/www\.stedar\.org\//);
  });

  it('použije ověřené HTTPS, když projde', async () => {
    const get = vi.fn(async (url: string, init?: { insecure?: boolean }) => {
      expect(url).toMatch(/^https:/);
      expect(init?.insecure).toBeFalsy();
      return htmlResponse(200, HTML);
    });
    const html = await fetchStedarHtml(SOURCE, get);
    expect(html).toContain('rankingsTable');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('po TLS chybě zkusí HTTPS bez ověření certifikátu', async () => {
    const get = vi.fn(async (url: string, init?: { insecure?: boolean }) => {
      expect(url).toMatch(/^https:/);
      if (!init?.insecure) {
        throw Object.assign(new Error('unable to verify the first certificate'), {
          code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        });
      }
      return htmlResponse(200, `${HTML}<!--insecure-->`);
    });
    const html = await fetchStedarHtml(SOURCE, get);
    expect(html).toContain('<!--insecure-->');
    expect(get.mock.calls.some((call) => call[1]?.insecure)).toBe(true);
  });

  it('když HTTPS nejde, vezme čisté HTTP 200', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.startsWith('https:')) {
        throw new Error('connect ECONNREFUSED');
      }
      expect(url).toMatch(/^http:/);
      return htmlResponse(200, `${HTML}<!--http-->`);
    });
    const html = await fetchStedarHtml(SOURCE, get);
    expect(html).toContain('<!--http-->');
  });

  it('HTTP 308 na HTTPS nebere jako úspěch', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.startsWith('https:')) {
        throw Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' });
      }
      return htmlResponse(308, '', 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=1');
    });
    const message = await fetchStedarHtml(SOURCE, get).then(
      () => {
        throw new Error('expected throw');
      },
      (err: unknown) => (err instanceof Error ? err.message : String(err))
    );
    expect(message).toMatch(/Stedar fetch failed/);
    expect(message).toMatch(/HTTP 308 redirect/);
  });
});
