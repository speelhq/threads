import { isIP } from "node:net";

/**
 * Validate that a URL is safe to fetch (no SSRF).
 * Blocks private IPs, loopback, link-local, and localhost.
 */
export function isUrlSafe(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost
  if (hostname === "localhost") return false;

  // If hostname is an IP, check ranges directly
  if (isIP(hostname)) {
    return !isPrivateIp(hostname);
  }

  // Domain names are not resolved here. DNS rebinding attacks
  // (e.g. evil.com → 169.254.169.254) are not prevented.
  // TODO: Add DNS resolution check before deploying to Cloud Run.
  return true;
}

/**
 * Check if an IP is private/reserved.
 */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const parts = ip.split(".").map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local, includes GCP metadata server)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts.every((p) => p === 0)) return true;
  }

  if (isIP(ip) === 6) {
    // ::1 (loopback)
    if (ip === "::1") return true;
    // fe80::/10 (link-local)
    if (ip.toLowerCase().startsWith("fe80:")) return true;
  }

  return false;
}

/**
 * Fetch OGP metadata from a URL.
 * Returns { title, description } or null values on failure.
 */
export async function fetchOgp(url: string): Promise<{
  title: string | null;
  description: string | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ThreadsBot/1.0" },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { title: null, description: null };
    }

    const html = await res.text();
    const title = extractMetaContent(html, "og:title");
    const description = extractMetaContent(html, "og:description");

    return { title, description };
  } catch {
    return { title: null, description: null };
  }
}

/**
 * Extract content from an OGP meta tag.
 */
function extractMetaContent(html: string, property: string): string | null {
  // Match <meta property="og:title" content="..."> or <meta content="..." property="og:title">
  const regex = new RegExp(
    `<meta[^>]*(?:property=["']${property}["'][^>]*content=["']([^"']*)["']|content=["']([^"']*)["'][^>]*property=["']${property}["'])`,
    "i",
  );
  const match = html.match(regex);
  if (!match) return null;
  const value = match[1] ?? match[2];
  return value || null;
}

/**
 * Extract domain from a URL.
 */
export function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname;
}
