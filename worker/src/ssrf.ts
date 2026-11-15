/**
 * SSRF guard for URL transfers.
 *
 * `transferFileByUrl` fetches an arbitrary user-supplied URL, so without
 * checks it can be used as a proxy into private networks (internal services,
 * loopback, cloud metadata endpoints) or as an open redirect hop. This
 * module is the single choke point for that fetch:
 *
 * - only http/https, no credentials embedded in the URL;
 * - literal private/reserved IPs are rejected;
 * - hostnames are resolved via DNS-over-HTTPS and rejected when they point
 *   at a private/reserved address (fail closed when resolution fails);
 * - every redirect hop is re-validated, and the fetch is pinned to the
 *   validated IP with `cf.resolveOverride`, so a rebinding answer served
 *   between validation and fetch cannot steer the request elsewhere.
 *
 * Callers: `transferFileByUrl` in storage.ts, which serves the web
 * `/api/transfer`, `/api/transfer/batch` and the Agent API `/transfer`,
 * `/transfer/batch` routes — fixing it here covers all four.
 */

export class UrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlBlockedError';
  }
}

const MAX_REDIRECTS = 5;
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const DOH_TIMEOUT_MS = 5000;

/** IPv4 private/reserved ranges as [first, last] inclusive uint32 pairs. */
const IPV4_BLOCKED: Array<readonly [number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8 — "this network"
  [0x0a000000, 0x0affffff], // 10.0.0.0/8 — private
  [0x64400000, 0x647fffff], // 100.64.0.0/10 — CGNAT shared address space
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 — loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 — link-local (incl. cloud metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12 — private
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24 — IETF protocol assignments
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24 — TEST-NET-1 (documentation)
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16 — private
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15 — benchmarking
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24 — TEST-NET-2 (documentation)
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24 — TEST-NET-3 (documentation)
  [0xe0000000, 0xefffffff], // 224.0.0.0/4 — multicast
  [0xf0000000, 0xffffffff], // 240.0.0.0/4 — reserved (incl. 255.255.255.255)
];

/** Strict dotted-quad IPv4 → uint32, or null when not an IPv4 literal. */
function parseIpv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/** Parse an IPv6 literal (no brackets) into 8 uint16 groups, or null. */
function parseIpv6(host: string): number[] | null {
  if (!host || host.includes('%')) return null; // zone id — reject
  const split = host.split('::');
  if (split.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (side === '') return [];
    const out: number[] = [];
    const comps = side.split(':');
    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      if (comp === '') return null;
      if (comp.includes('.')) {
        // Embedded IPv4 — only allowed as the last component.
        if (i !== comps.length - 1) return null;
        const v4 = parseIpv4(comp);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(comp)) return null;
        out.push(parseInt(comp, 16));
      }
    }
    return out;
  };
  if (split.length === 1) {
    const groups = parseSide(split[0]);
    return groups && groups.length === 8 ? groups : null;
  }
  const head = parseSide(split[0]);
  const tail = parseSide(split[1]);
  if (!head || !tail) return null;
  if (head.length + tail.length > 7) return null; // '::' must compress ≥1 group
  return [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail];
}

/**
 * True when `ip` is a private/reserved IP literal (v4 or v6). Returns false
 * for hostnames and malformed input — those are handled by the caller.
 */
export function isPrivateIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    return IPV4_BLOCKED.some(([lo, hi]) => v4 >= lo && v4 <= hi);
  }
  const host = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  const g = parseIpv6(host);
  if (g === null) return false;
  const isZero = (i: number) => g[i] === 0;
  if (g.every((x) => x === 0)) return true; // ::/128 unspecified
  if (g[7] === 1 && g.slice(0, 7).every((x) => x === 0)) return true; // ::1/128 loopback
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if (g[0] === 0x0100 && isZero(1) && isZero(2) && isZero(3)) return true; // 100::/64 discard
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return true; // 2001::/32 Teredo (embeds IPv4)
  if (g[0] === 0x2002) {
    // 2002::/16 6to4 — next 32 bits are an embedded IPv4 address.
    const embedded = ((g[1] << 16) | g[2]) >>> 0;
    return IPV4_BLOCKED.some(([lo, hi]) => embedded >= lo && embedded <= hi);
  }
  if (isZero(0) && isZero(1) && isZero(2) && isZero(3) && isZero(4) && g[5] === 0xffff) {
    // ::ffff:0:0/96 IPv4-mapped — check the embedded IPv4 address.
    const embedded = ((g[6] << 16) | g[7]) >>> 0;
    return IPV4_BLOCKED.some(([lo, hi]) => embedded >= lo && embedded <= hi);
  }
  return false;
}

/** Resolve A + AAAA records via DNS-over-HTTPS. Fail closed on any error. */
async function resolveHostname(hostname: string): Promise<string[]> {
  const ips: string[] = [];
  for (const type of [1, 28]) {
    let res: Response;
    try {
      res = await fetch(`${DOH_URL}?name=${encodeURIComponent(hostname)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
      });
    } catch {
      throw new UrlBlockedError(`DNS lookup failed for ${hostname}`);
    }
    if (!res.ok) {
      throw new UrlBlockedError(`DNS lookup failed for ${hostname} (HTTP ${res.status})`);
    }
    const data: any = await res.json().catch(() => null);
    if (!data || data.Status !== 0 || !Array.isArray(data.Answer)) continue;
    for (const answer of data.Answer) {
      if (answer.type === type && typeof answer.data === 'string') ips.push(answer.data);
    }
  }
  return ips;
}

/**
 * Resolve `url`'s host to one public IP to connect to. Literal IPs are
 * checked directly; hostnames go through DoH and must resolve to at least
 * one public address (a hostname resolving only to private addresses, or
 * not resolving at all, is blocked).
 */
async function resolvePublicIp(url: URL): Promise<string> {
  const host = url.hostname;
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new UrlBlockedError(`Blocked URL host: ${host}`);
  }
  if (host.startsWith('[')) {
    const ip = host.slice(1, -1);
    if (parseIpv6(ip) === null) throw new UrlBlockedError(`Invalid IPv6 address: ${host}`);
    if (isPrivateIp(ip)) throw new UrlBlockedError(`Blocked private IPv6 address: ${host}`);
    return ip;
  }
  if (parseIpv4(host) !== null) {
    if (isPrivateIp(host)) throw new UrlBlockedError(`Blocked private IP address: ${host}`);
    return host;
  }
  const ips = await resolveHostname(host.replace(/\.$/, ''));
  const publicIps = ips.filter((ip) => !isPrivateIp(ip));
  if (publicIps.length === 0) {
    throw new UrlBlockedError(
      ips.length === 0
        ? `Could not resolve ${host} to a public address`
        : `Blocked: ${host} resolves to a private address`,
    );
  }
  return publicIps[0];
}

/**
 * Fetch `input` after SSRF validation, following redirects manually so each
 * hop is re-validated (protocol, host, resolved IP). `init` is passed
 * through (e.g. the caller's abort timeout); `redirect` is always manual.
 */
export async function fetchPublicUrl(input: string, init: RequestInit = {}): Promise<Response> {
  let current = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      throw new UrlBlockedError(`Invalid URL: ${current}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new UrlBlockedError(`Blocked URL protocol: ${url.protocol} (only http/https allowed)`);
    }
    if (url.username || url.password) {
      throw new UrlBlockedError('Blocked URL with embedded credentials');
    }
    const ip = await resolvePublicIp(url);
    const res = await fetch(url.toString(), {
      ...init,
      redirect: 'manual',
      cf: { ...init.cf, resolveOverride: ip },
    });
    if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
      const location = res.headers.get('Location');
      if (!location) return res;
      if (hop === MAX_REDIRECTS) {
        throw new UrlBlockedError(`Too many redirects (max ${MAX_REDIRECTS})`);
      }
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new UrlBlockedError(`Too many redirects (max ${MAX_REDIRECTS})`);
}
