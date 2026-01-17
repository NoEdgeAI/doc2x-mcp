export const DOC2X_API_V2_PREFIX = '/api/v2';

export function v2(pathname: string): string {
  const p = String(pathname || '').trim();
  if (!p) return DOC2X_API_V2_PREFIX;
  if (p.startsWith('/')) return `${DOC2X_API_V2_PREFIX}${p}`;
  return `${DOC2X_API_V2_PREFIX}/${p}`;
}
