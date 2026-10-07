import { getDomain, parse } from 'tldts';

export interface ParsedSite {
  /** Hostname without a leading `www.` / `m.`, e.g. `docs.google.com`. */
  host: string;
  /** Registrable domain per the Public Suffix List, e.g. `bbc.co.uk`. */
  domain: string;
  /** Kept in memory for path rules only; never persisted. */
  path: string;
}

/** Pages that are http(s) but are really the browser's own new-tab page. */
const NEW_TAB_URLS = [/^https?:\/\/(www\.)?google\.[a-z.]+\/_\/chrome\/newtab/i];

const STRIP_PREFIXES = ['www.', 'm.', 'mobile.'];

export function normalizeHost(hostname: string): string {
  let h = hostname.toLowerCase().replace(/\.$/, '');
  for (const p of STRIP_PREFIXES) {
    // Only strip when something registrable remains (keep `m.co` style hosts intact).
    if (h.startsWith(p) && getDomain(h.slice(p.length), { allowPrivateDomains: true })) {
      h = h.slice(p.length);
      break;
    }
  }
  return h;
}

/** Parse a URL into a trackable site, or null if it must be ignored. */
export function parseSite(url: string | undefined): ParsedSite | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (NEW_TAB_URLS.some((re) => re.test(url))) return null;
  if (!u.hostname) return null;

  const host = normalizeHost(u.hostname);
  const info = parse(host, { allowPrivateDomains: true });
  // IPs, localhost and other suffix-less hosts track as themselves.
  const domain = (!info.isIp && info.domain) || host;
  return { host, domain, path: u.pathname };
}

/** Matches when `host` equals `pattern` or is a subdomain of it. */
export function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase();
  return host === p || host.endsWith(`.${p}`);
}

/**
 * The aggregation key: the registrable domain, or the full host for domains the
 * user wants split by subdomain (docs.google.com vs mail.google.com).
 */
export function trackingKey(site: Pick<ParsedSite, 'host' | 'domain'>, splitSubdomains: string[]): string {
  return splitSubdomains.includes(site.domain) ? site.host : site.domain;
}
