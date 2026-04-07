/**
 * Builds a deterministic sort key for the Links table.
 * URL-encodes both SKs to avoid collisions with the `#` delimiter.
 */
export function buildLinkSk(parentSk: string, childSk: string): string {
  return `LINK#${encodeURIComponent(parentSk)}#${encodeURIComponent(childSk)}`;
}

/**
 * Builds a URL-safe linkId derived from the composite sort key.
 * Uses base64url encoding, truncated to 43 chars for clean URLs.
 */
export function buildLinkId(sk: string): string {
  return Buffer.from(sk).toString('base64url').slice(0, 43);
}
