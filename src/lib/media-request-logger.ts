import fs from "fs/promises";
import path from "path";

/** 与 LLM 调试日志共用目录与开关（HISTORAI_LLM_LOG_DIR / HISTORAI_LLM_LOG=0） */
const DEFAULT_RELATIVE_LOG_DIR = "logs";

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveLogDir(): string {
  const override = process.env.HISTORAI_LLM_LOG_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), DEFAULT_RELATIVE_LOG_DIR);
}

/**
 * 将 URL / Data URL 压缩为可进 jsonl 的短描述（不写整段 base64、不写 query 后长尾）。
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

/**
 * 文生图 / 图生视频 请求摘要，追加到 logs 按日 jsonl。
 * 与 appendLlmDebugLog 共用 HISTORAI_LLM_LOG=0 关闭、HISTORAI_LLM_LOG_DIR 覆盖目录。
 */
export async function appendMediaDebugLog(entry: {
  kind: "image" | "video";
  route: string;
  status: "ok" | "error";
  meta: Record<string, unknown>;
}): Promise<void> {
  if (process.env.HISTORAI_LLM_LOG?.trim() === "0") {
    return;
  }
  try {
    const dir = resolveLogDir();
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${localDateYmd(new Date())}.jsonl`;
    const filePath = path.join(dir, fileName);
    const record = {
      ts: new Date().toISOString(),
      recordKind: "media",
      mediaKind: entry.kind,
      route: entry.route,
      status: entry.status,
      meta: entry.meta,
    };
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (e) {
    console.error("[HistorAI] 媒体请求日志写入失败:", e);
  }
}
