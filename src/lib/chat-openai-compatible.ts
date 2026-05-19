/**
 * OpenAI 兼容 Chat Completions（DeepSeek、通义千问 compatible-mode 等）
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletionChoice = {
  finish_reason?: string;
  message?: {
    content?: string | null | Array<{ type?: string; text?: string }>;
    /** DeepSeek reasoner / 部分 V4 路由：正文可能在 reasoning_content */
    reasoning_content?: string | null;
  };
};

export type ParseChatCompletionOptions = {
  /** 为 false 时不把 reasoning_content 当作正文（短文案等场景） */
  allowReasoningFallback?: boolean;
};

/** 从 chat/completions JSON 提取 assistant 正文（兼容 string / 多段 content / reasoning_content） */
export function parseChatCompletionResponse(
  data: unknown,
  options?: ParseChatCompletionOptions,
): {
  text: string;
  finishReason?: string;
  usedReasoningFallback: boolean;
} {
  const allowReasoningFallback = options?.allowReasoningFallback !== false;
  const choices = (data as { choices?: ChatCompletionChoice[] })?.choices;
  const choice = choices?.[0];
  const msg = choice?.message;

  const fromContent = (raw: unknown): string => {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw)) {
      const joined = raw
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const t = (part as { text?: string }).text;
          return typeof t === "string" ? t : "";
        })
        .join("");
      if (joined.trim()) return joined.trim();
    }
    return "";
  };

  let text = fromContent(msg?.content ?? null);
  let usedReasoningFallback = false;
  if (
    allowReasoningFallback &&
    !text &&
    typeof msg?.reasoning_content === "string"
  ) {
    const rc = msg.reasoning_content.trim();
    if (rc) {
      text = rc;
      usedReasoningFallback = true;
    }
  }

  return {
    text,
    finishReason: choice?.finish_reason,
    usedReasoningFallback,
  };
}

export async function callOpenAICompatibleChat(args: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  responseFormatJsonObject?: boolean;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature,
    max_tokens: args.maxTokens,
  };
  if (args.responseFormatJsonObject) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(args.url.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat Completions 失败（${res.status}）：${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const { text, finishReason } = parseChatCompletionResponse(data);
  if (!text) {
    throw new Error(
      `Chat Completions 返回内容为空${finishReason ? `（finish_reason=${finishReason}）` : ""}`,
    );
  }
  return text;
}
