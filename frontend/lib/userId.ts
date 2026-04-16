/**
 * Browser-local user id — anchors the long-term memory table on the backend.
 * Not an auth identity; purely a stable key for the UserFact rows tied to
 * this browser. Users can wipe it via the Reset Memory button in the UI.
 */
const KEY = 'th-user-id';

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'anon';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length > 0) return existing;
    const fresh = `u_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return 'anon';
  }
}

export function resetUserId(): string {
  if (typeof window === 'undefined') return 'anon';
  try {
    const fresh = `u_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return 'anon';
  }
}
