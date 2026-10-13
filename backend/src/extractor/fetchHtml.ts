import { safeFetch } from "../lib/safeFetch.js";

/** Max characters of cleaned HTML we send to the model. */
const MAX_HTML_CHARS = 200_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Turn user input like "biglittlethings.de" into a fully-qualified https URL.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export interface FetchedPage {
  /** The final URL after redirects (used as the base for relative links). */
  finalUrl: string;
  /** Cleaned, size-capped HTML suitable for the model. */
  html: string;
}

/**
 * Fetch the raw HTML of a page and strip the parts that carry no design
 * signal (script bodies, comments) so we don't waste tokens.
 */
export async function fetchHtml(url: string): Promise<FetchedPage> {
  // The domain is typed by whoever asks for an extraction: fetched only if it
  // resolves somewhere public, redirects included. See lib/safeFetch.ts.
  const { response: res, finalUrl } = await safeFetch(url, {
    headers: BROWSER_HEADERS,
    timeoutMs: 30_000,
    maxBytes: 10 * 1024 * 1024,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  return { finalUrl, html: cleanHtml(raw) };
}

/**
 * Remove script contents and HTML comments, then cap the length.
 * We deliberately keep <style>, <link>, <meta>, and body markup since those
 * hold colors, fonts, favicons, logos, and border-radius hints.
 */
export function cleanHtml(html: string): string {
  const cleaned = html
    // drop script bodies but keep a marker so structure is obvious
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    // drop HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // collapse runs of whitespace
    .replace(/\s{2,}/g, " ")
    .trim();

  if (cleaned.length <= MAX_HTML_CHARS) return cleaned;

  // Keep the head-heavy beginning plus a slice of the rest.
  const headPart = cleaned.slice(0, Math.floor(MAX_HTML_CHARS * 0.7));
  const tailPart = cleaned.slice(-Math.floor(MAX_HTML_CHARS * 0.3));
  return `${headPart}\n<!-- …truncated… -->\n${tailPart}`;
}
