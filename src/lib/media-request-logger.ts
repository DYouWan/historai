/**
 * 将 URL / Data URL 压缩为可读日志里的短描述（不写整段 base64、不写 query 后长尾）。
 */
export function sanitizeRemoteAssetHint(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("data:")) {
    const comma = s.indexOf(",");
    const head =
      comma >= 0 ? s.slice(0, Math.min(40, comma + 1)) : s.slice(0, 40);
    return `${head}…[data-url totalChars=${s.length}]`;
  }
  try {
    const u = new URL(s);
    const pathname =
      u.pathname.length > 80 ? `${u.pathname.slice(0, 80)}…` : u.pathname;
    return `${u.origin}${pathname}`;
  } catch {
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  }
}
