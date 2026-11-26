// Return destinations (sign-in `next`, notification and support links) must stay on this site.
// A prefix check isn't enough: browsers strip tabs and newlines and treat "\" as "/", so
// "/\t/evil.com" or "/\\evil.com" become "//evil.com", another site. Instead the value is resolved
// against a placeholder origin and accepted only if it still points there.

const PLACEHOLDER = "http://internal.invalid";

/** The same-site path (pathname + query + hash) for `value`, or null if it could leave the site. */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 2048) return null;
  // Control characters and backslashes never appear in our own links.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
