import { randomUUID } from "node:crypto";
import fs from "fs/promises";
import path from "path";

import type { LlmDebugPhase, LlmMessagesDebug } from "@/lib/types";

/** 在 API handler 入口调用一次，整段请求（含内部多轮 LLM）共用同一 ID */
export function createLlmRequestId(): string {
  return randomUUID();
}

/** 响应头带回 requestId，便于与 `.llm-read.md` 对照 */
export const LLM_REQUEST_ID_HEADER = "x-request-id";

export function llmRequestIdHeaders(requestId: string): Record<string, string> {
  return { [LLM_REQUEST_ID_HEADER]: requestId };
}

/** 默认日志目录（项目根下）；可通过环境变量 HISTORAI_LLM_LOG_DIR 覆盖 */
const DEFAULT_RELATIVE_LOG_DIR = "logs";

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 本地时区时间戳，用于 `.llm-read.md` 二级标题（避免 `toISOString()` 的 UTC） */
function localLogTimestamp(d: Date): string {
  const z = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ` +
    `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}.${z(d.getMilliseconds(), 3)}`
  );
}

function resolveLogDir(): string {
  const override = process.env.HISTORAI_LLM_LOG_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), DEFAULT_RELATIVE_LOG_DIR);
}

function tryPrettyJsonString(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

function fence(lang: "text" | "json", body: string): string {
  return "```" + lang + "\n" + body.trimEnd() + "\n```\n\n";
}

/** assistant 正文（不含 ### 标题），供根级与 merged 段复用 */
function assistantMarkdownBody(raw: string | undefined): string {
  if (!raw?.trim()) return "_(empty)_\n\n";
  const t = raw.trim();
  const pretty = tryPrettyJsonString(t);
  return pretty !== null ?
      `_${t.length} chars · parsed as JSON_\n\n${fence("json", pretty)}`
    : `_${t.length} chars_\n\n${fence("text", t)}`;
}

function sectionAssistant(raw: string | undefined): string {
  return "### assistant\n\n" + assistantMarkdownBody(raw);
}

function sectionPhase(
  ph: LlmDebugPhase,
  stepIndex?: number,
  totalSteps?: number,
): string {
  const ord =
    stepIndex != null && totalSteps != null ?
      `第 ${stepIndex}/${totalSteps} 轮 · `
    : "";
  let out = `#### ${ord}\`${ph.phase}\``;
  if (ph.maxTokens != null) out += ` · max_tokens=${ph.maxTokens}`;
  out += "\n\n";
  out +=
    `##### system · ${ph.system.length} chars\n\n` + fence("text", ph.system);
  out += `##### user · ${ph.user.length} chars\n\n` + fence("text", ph.user);
  if (ph.assistantRaw?.trim()) {
    out += "##### assistant\n\n";
    const pretty = tryPrettyJsonString(ph.assistantRaw.trim());
    out +=
      pretty !== null ?
        fence("json", pretty)
      : fence("text", ph.assistantRaw.trim());
  }
  return out;
}

/** 人类可读 Markdown（按日追加 `YYYY-MM-DD.llm-read.md`；文首 `##` 时间为运行环境本地时区） */
function buildMarkdownBlock(args: {
  ts: string;
  requestId: string;
  route: string;
  meta: Record<string, unknown>;
  promptDebug: LlmMessagesDebug;
}): string {
  const { ts, requestId, route, meta, promptDebug: pd } = args;
  let md = "\n--------------------------------------------------------------------------------\n\n";
  md += `## ${ts}\n\n`;
  md += `**requestId:** \`${requestId}\`\n\n`;
  md += `**route:** \`${route}\`\n\n`;
  md += `- **model:** \`${pd.model}\` · temperature ${pd.temperature}`;
  md += ` · JSON mode: ${pd.usesJsonResponseFormat ? "on" : "off"}\n`;
  if (pd.storyboardStrategy) {
    md += `- **storyboard:** ${pd.storyboardStrategy}\n`;
  }
  md += `\n### meta\n\n`;
  md += fence("json", JSON.stringify(meta, null, 2));

  if (pd.phases && pd.phases.length > 0) {
    const n = pd.phases.length;
    md += "### 本次请求的模型调用链\n\n";
    md += `同一 HTTP 请求（**requestId** 见文首）内顺序执行，共 **${n}** 轮对话。\n\n`;
    md += "| # | phase | max_tokens |\n|---|-------|------------|\n";
    for (let i = 0; i < n; i++) {
      const ph = pd.phases[i]!;
      const mtok = ph.maxTokens != null ? String(ph.maxTokens) : "—";
      md += `| ${i + 1} | \`${ph.phase}\` | ${mtok} |\n`;
    }
    md += "\n### 各轮明细（system / user / assistant）\n\n";
    for (let i = 0; i < n; i++) {
      md += sectionPhase(pd.phases[i]!, i + 1, n);
    }
    if (
      pd.assistantRaw?.trim() &&
      pd.phases.length > 1 &&
      pd.phases.some((p) => p.assistantRaw)
    ) {
      md +=
        "### 调试拼接：各轮 assistant 合并串\n\n" +
        "_（仅供对照 UI / 解析逻辑；逐轮正文以上表为准。）_\n\n" +
        assistantMarkdownBody(pd.assistantRaw);
    }
  } else {
    md +=
      `### system · ${pd.system.length} chars\n\n` + fence("text", pd.system);
    md += `### user · ${pd.user.length} chars\n\n` + fence("text", pd.user);
    md += sectionAssistant(pd.assistantRaw);
  }

  return md;
}

async function appendMarkdownLog(block: string): Promise<void> {
  const dir = resolveLogDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${localDateYmd(new Date())}.llm-read.md`);
  await fs.appendFile(filePath, block, "utf8");
}

/**
 * 文生图等非 Chat Completions 请求：构造与 `appendLlmDebugLog` 兼容的 `promptDebug`，写入同日 `.llm-read.md`。
 * 若传 `error`，表示未完成或未发起 vendor 调用（校验失败、解析失败、抛错等）。
 */
export function buildImageGenerationPromptDebug(args: {
  driver?: string;
  model?: string;
  promptSummary?: string;
  promptCharCount?: number;
  referenceImagePassedToVendor?: boolean;
  resultUrlHint?: string;
  error?: string;
}): LlmMessagesDebug {
  const driver = args.driver?.trim() || "—";
  const model = args.model?.trim();
  if (args.error) {
    const user = (args.promptSummary?.trim() || "—").slice(0, 8000);
    return {
      system: `HistorAI 文生图${driver !== "—" ? ` · ${driver}` : ""}`,
      user,
      model: model && model.length > 0 ? model : driver,
      chatCompletionsUrl: "(image generation)",
      temperature: 0,
      usesJsonResponseFormat: false,
      assistantRaw: args.error,
    };
  }
  const ps = args.promptSummary ?? "";
  const chars = args.promptCharCount ?? ps.length;
  return {
    system: `[HistorAI 文生图] ${driver}${model ? ` · ${model}` : ""} · promptChars=${chars} · referenceToVendor=${Boolean(args.referenceImagePassedToVendor)}`,
    user: ps,
    model: model && model.length > 0 ? model : driver,
    chatCompletionsUrl: "(image generation API)",
    temperature: 0,
    usesJsonResponseFormat: false,
    assistantRaw: args.resultUrlHint
      ? `result_url: ${args.resultUrlHint}`
      : undefined,
  };
}

/**
 * 将 LLM 调试明细追加到按日 `YYYY-MM-DD.llm-read.md`（每条 `##` 下时间为**服务器本地时区**，与文件名日期一致）。
 * **requestId**：请在 API handler 入口 `createLlmRequestId()` 一次，同一 HTTP 请求内多次 `appendLlmDebugLog` 传同一值；不传则每次追加单独生成（一般不推荐）。
 * 设置 HISTORAI_LLM_LOG=0 可关闭。写入失败只打 console，不抛错。
 */
export async function appendLlmDebugLog(entry: {
  route: string;
  promptDebug: LlmMessagesDebug;
  /** 便于检索的少量上下文，勿放密钥 */
  meta?: Record<string, unknown>;
  requestId?: string;
}): Promise<void> {
  if (process.env.HISTORAI_LLM_LOG?.trim() === "0") {
    return;
  }
  try {
    const requestId = entry.requestId ?? randomUUID();
    const meta = { ...(entry.meta ?? {}), requestId };
    const ts = localLogTimestamp(new Date());
    await appendMarkdownLog(
      buildMarkdownBlock({
        ts,
        requestId,
        route: entry.route,
        meta,
        promptDebug: entry.promptDebug,
      }),
    );
  } catch (e) {
    console.error("[HistorAI] LLM 日志写入失败:", e);
  }
}
