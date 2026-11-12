/** Only allow same-site relative redirect targets (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/studio'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) {
    return fallback;
  }
  return next;
}
