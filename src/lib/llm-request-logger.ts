import fs from "fs/promises";
import path from "path";

import type { LlmMessagesDebug } from "@/lib/types";

/** 默认日志目录（项目根下）；可通过环境变量 HISTORAI_LLM_LOG_DIR 覆盖 */
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
 * 将单次 LLM 请求明细追加到按日 jsonl（本机 next dev 用）。
 * 设置 HISTORAI_LLM_LOG=0 可关闭。写入失败只打 console，不抛错。
 */
export async function appendLlmDebugLog(entry: {
  route: string;
  promptDebug: LlmMessagesDebug;
  /** 便于检索的少量上下文，勿放密钥 */
  meta?: Record<string, unknown>;
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
      route: entry.route,
      meta: entry.meta ?? null,
      promptDebug: entry.promptDebug,
    };
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (e) {
    console.error("[HistorAI] LLM 日志写入失败:", e);
  }
}
