// Unsent work kept on this device (IMP-05). Every draft belongs to one signed-in user and a
// precise scope, is restored only when the page has already been authorized on the server
// and that scope matches exactly, and expires. Nothing secret is stored: no tokens, no file
// contents, only what the person typed.
//
// Key: nyumbani.v2.draft.<userId>.<kind>.<scope id>

const PREFIX = "nyumbani.v2.draft.";
const SCHEMA = 2;
export const DRAFT_RETENTION_DAYS = 14;

// Before v2, drafts were keyed only by tenancy or conversation, so they can't be attributed
// to a person. They are dropped, never restored.
const LEGACY_PREFIXES = ["nyumbani.entryDraft.", "nyumbani.msgDraft."];

type Envelope<T> = { schema: number; userId: string; scope: Record<string, string>; savedAt: number; data: T };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function keyFor(userId: string, kind: string, scope: Record<string, string>) {
  const id = Object.keys(scope).sort().map((k) => scope[k]).join(".");
  return `${PREFIX}${userId}.${kind}.${id}`;
}

function sameScope(a: Record<string, string>, b: Record<string, string>) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

export function readDraft<T>(userId: string, kind: string, scope: Record<string, string>): { data: T; savedAt: number } | null {
  const s = storage();
  if (!s || !userId) return null;
  dropLegacy(s);
  const key = keyFor(userId, kind, scope);
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    const expired = Date.now() - env.savedAt > DRAFT_RETENTION_DAYS * 86_400_000;
    if (env.schema !== SCHEMA || env.userId !== userId || !sameScope(env.scope, scope) || expired) {
      s.removeItem(key);
      return null;
    }
    return { data: env.data, savedAt: env.savedAt };
  } catch {
    s.removeItem(key);
    return null;
  }
}

export function writeDraft<T>(userId: string, kind: string, scope: Record<string, string>, data: T): boolean {
  const s = storage();
  if (!s || !userId) return false;
  try {
    const env: Envelope<T> = { schema: SCHEMA, userId, scope, savedAt: Date.now(), data };
    s.setItem(keyFor(userId, kind, scope), JSON.stringify(env));
    return true;
  } catch {
    return false;
  }
}

/** Removes exactly one draft: this user, this kind, this scope. */
export function removeDraft(userId: string, kind: string, scope: Record<string, string>) {
  storage()?.removeItem(keyFor(userId, kind, scope));
}

/** Sign-out on a shared device: this user's drafts, plus searches typed in this session. */
export function clearDeviceDataFor(userId: string) {
  const s = storage();
  if (!s) return;
  for (const k of Object.keys(s)) {
    if ((userId && k.startsWith(`${PREFIX}${userId}.`)) || k === "nyumbani.recentSearches") s.removeItem(k);
  }
  dropLegacy(s);
}

function dropLegacy(s: Storage) {
  for (const k of Object.keys(s)) if (LEGACY_PREFIXES.some((p) => k.startsWith(p))) s.removeItem(k);
}
